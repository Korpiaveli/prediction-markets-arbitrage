import { CrossExchangePair, PriceHistory, ArbitrageDirection } from '@arb/core';
import { KalshiAdapter, PolymarketAdapter, createKalshiAdapter, createPolymarketAdapter } from '@arb/exchanges';
import { RateLimitedQueue, createQueueForExchange } from './RateLimitedQueue.js';
import {
  RealHistoricalSnapshot,
  CollectionJob,
  CollectionError
} from '../types.js';

export interface CollectorConfig {
  fidelityMinutes: number;
  minProfitThreshold: number;
  kalshiApiKey?: string;
  polymarketApiKey?: string;
}

const DEFAULT_CONFIG: CollectorConfig = {
  fidelityMinutes: 60,
  minProfitThreshold: 0.5
};

export class HistoricalCollector {
  private kalshiAdapter: KalshiAdapter;
  private polymarketAdapter: PolymarketAdapter;
  private kalshiQueue: RateLimitedQueue;
  private polymarketQueue: RateLimitedQueue;
  private config: CollectorConfig;

  constructor(config: Partial<CollectorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.kalshiAdapter = createKalshiAdapter({
      apiKey: config.kalshiApiKey
    });
    this.polymarketAdapter = createPolymarketAdapter({
      apiKey: config.polymarketApiKey
    });

    this.kalshiQueue = createQueueForExchange('KALSHI');
    this.polymarketQueue = createQueueForExchange('POLYMARKET');
  }

  async collectSnapshots(
    pairs: CrossExchangePair[],
    dateRange: { start: Date; end: Date },
    onProgress?: (completed: number, total: number, currentPair: string) => void
  ): Promise<{ snapshots: RealHistoricalSnapshot[]; errors: CollectionError[] }> {
    const snapshots: RealHistoricalSnapshot[] = [];
    const errors: CollectionError[] = [];

    const startTs = Math.floor(dateRange.start.getTime() / 1000);
    const endTs = Math.floor(dateRange.end.getTime() / 1000);

    for (let i = 0; i < pairs.length; i++) {
      const pair = pairs[i];
      if (onProgress) {
        onProgress(i, pairs.length, pair.description);
      }

      try {
        const pairSnapshots = await this.collectPairSnapshots(pair, startTs, endTs);
        snapshots.push(...pairSnapshots);
      } catch (error: any) {
        errors.push({
          marketPairId: pair.id,
          exchange: pair.exchange1,
          error: error.message || String(error),
          timestamp: new Date()
        });
      }
    }

    if (onProgress) {
      onProgress(pairs.length, pairs.length, 'Complete');
    }

    return { snapshots, errors };
  }

  private async collectPairSnapshots(
    pair: CrossExchangePair,
    startTs: number,
    endTs: number
  ): Promise<RealHistoricalSnapshot[]> {
    const [exchange1Prices, exchange2Prices] = await Promise.all([
      this.fetchHistoricalPrices(pair.exchange1, pair.market1.id, startTs, endTs),
      this.fetchHistoricalPrices(pair.exchange2, pair.market2.id, startTs, endTs)
    ]);

    if (exchange1Prices.length === 0 || exchange2Prices.length === 0) {
      console.warn(`[HistoricalCollector] No price data for pair ${pair.id}`);
      return [];
    }

    const alignedPrices = this.alignPricesByTimestamp(exchange1Prices, exchange2Prices);

    const snapshots: RealHistoricalSnapshot[] = [];

    for (const aligned of alignedPrices) {
      const yesPrice1 = aligned.exchange1Price;
      const yesPrice2 = aligned.exchange2Price;
      const noPrice1 = 1 - yesPrice1;
      const noPrice2 = 1 - yesPrice2;

      const arbitrage = this.calculateArbitrage(yesPrice1, noPrice1, yesPrice2, noPrice2);

      if (arbitrage.exists || arbitrage.profitPercent >= this.config.minProfitThreshold) {
        snapshots.push({
          timestamp: aligned.timestamp,
          marketPairId: pair.id,
          exchange1: {
            marketId: pair.market1.id,
            yesPrice: yesPrice1,
            noPrice: noPrice1
          },
          exchange2: {
            marketId: pair.market2.id,
            yesPrice: yesPrice2,
            noPrice: noPrice2
          },
          arbitrage: {
            exists: arbitrage.exists,
            profitPercent: arbitrage.profitPercent,
            direction: arbitrage.direction,
            totalCost: arbitrage.totalCost
          },
          source: 'API',
          fetchedAt: new Date()
        });
      }
    }

    return snapshots;
  }

  private async fetchHistoricalPrices(
    exchange: string,
    marketId: string,
    startTs: number,
    endTs: number
  ): Promise<PriceHistory[]> {
    const queue = exchange === 'KALSHI' ? this.kalshiQueue : this.polymarketQueue;

    return queue.add(async () => {
      if (exchange === 'KALSHI') {
        return this.kalshiAdapter.getHistoricalPrices(
          marketId,
          startTs,
          endTs,
          this.config.fidelityMinutes
        );
      } else {
        return this.polymarketAdapter.getHistoricalPrices(
          marketId,
          startTs,
          endTs,
          this.config.fidelityMinutes
        );
      }
    });
  }

  private alignPricesByTimestamp(
    prices1: PriceHistory[],
    prices2: PriceHistory[]
  ): { timestamp: Date; exchange1Price: number; exchange2Price: number }[] {
    const bucketMs = this.config.fidelityMinutes * 60 * 1000;
    const price1Map = new Map<number, number>();
    const price2Map = new Map<number, number>();

    for (const p of prices1) {
      const bucket = Math.floor(p.timestamp.getTime() / bucketMs) * bucketMs;
      price1Map.set(bucket, p.price);
    }

    for (const p of prices2) {
      const bucket = Math.floor(p.timestamp.getTime() / bucketMs) * bucketMs;
      price2Map.set(bucket, p.price);
    }

    const commonBuckets = Array.from(price1Map.keys()).filter(b => price2Map.has(b));
    commonBuckets.sort((a, b) => a - b);

    return commonBuckets.map(bucket => ({
      timestamp: new Date(bucket),
      exchange1Price: price1Map.get(bucket)!,
      exchange2Price: price2Map.get(bucket)!
    }));
  }

  private calculateArbitrage(
    yesPrice1: number,
    noPrice1: number,
    yesPrice2: number,
    noPrice2: number
  ): {
    exists: boolean;
    profitPercent: number;
    direction: ArbitrageDirection;
    totalCost: number;
  } {
    // Strategy 1: Buy YES on exchange1, buy NO on exchange2
    const cost1 = yesPrice1 + noPrice2;
    const profit1 = 1 - cost1;
    const profitPercent1 = (profit1 / cost1) * 100;

    // Strategy 2: Buy NO on exchange1, buy YES on exchange2
    const cost2 = noPrice1 + yesPrice2;
    const profit2 = 1 - cost2;
    const profitPercent2 = (profit2 / cost2) * 100;

    if (profitPercent1 >= profitPercent2) {
      return {
        exists: profitPercent1 > 0,
        profitPercent: profitPercent1,
        direction: 'EXCHANGE1_YES_EXCHANGE2_NO',
        totalCost: cost1
      };
    } else {
      return {
        exists: profitPercent2 > 0,
        profitPercent: profitPercent2,
        direction: 'EXCHANGE1_NO_EXCHANGE2_YES',
        totalCost: cost2
      };
    }
  }

  async createCollectionJob(
    pairs: CrossExchangePair[],
    dateRange: { start: Date; end: Date }
  ): Promise<CollectionJob> {
    return {
      id: `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      status: 'pending',
      marketPairs: pairs.map(p => p.id),
      dateRange,
      progress: {
        pairsCompleted: 0,
        pairsTotal: pairs.length,
        snapshotsCollected: 0,
        resolutionsCollected: 0
      },
      errors: []
    };
  }

  async runCollectionJob(
    job: CollectionJob,
    pairs: CrossExchangePair[],
    onUpdate: (job: CollectionJob) => void
  ): Promise<CollectionJob> {
    job.status = 'running';
    job.startedAt = new Date();
    onUpdate(job);

    const { snapshots, errors } = await this.collectSnapshots(
      pairs,
      job.dateRange,
      (completed, _total) => {
        job.progress.pairsCompleted = completed;
        job.progress.snapshotsCollected = snapshots?.length || 0;
        onUpdate(job);
      }
    );

    job.progress.snapshotsCollected = snapshots.length;
    job.errors = errors;
    job.status = errors.length === pairs.length ? 'failed' : 'completed';
    job.completedAt = new Date();
    onUpdate(job);

    return job;
  }

  getQueueStats() {
    return {
      kalshi: this.kalshiQueue.getStats(),
      polymarket: this.polymarketQueue.getStats()
    };
  }
}

export function createHistoricalCollector(config?: Partial<CollectorConfig>): HistoricalCollector {
  return new HistoricalCollector(config);
}
