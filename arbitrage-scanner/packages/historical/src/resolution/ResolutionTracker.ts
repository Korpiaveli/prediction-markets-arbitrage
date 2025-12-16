import { CrossExchangePair, ExchangeName } from '@arb/core';
import { KalshiAdapter, PolymarketAdapter, createKalshiAdapter, createPolymarketAdapter } from '@arb/exchanges';
import { RateLimitedQueue, createQueueForExchange } from '../collectors/RateLimitedQueue.js';
import { RealResolution, ResolutionOutcome } from '../types.js';

export interface ResolutionTrackerConfig {
  kalshiApiKey?: string;
  polymarketApiKey?: string;
  cacheResolutions?: boolean;
}

export type ResolutionAlignmentRisk = 'none' | 'timing_mismatch' | 'outcome_mismatch' | 'pending' | 'voided';

export interface ResolutionAlignmentResult {
  aligned: boolean;
  risk: ResolutionAlignmentRisk;
  details: string;
  timingDifferenceHours?: number;
}

export class ResolutionTracker {
  private kalshiAdapter: KalshiAdapter;
  private polymarketAdapter: PolymarketAdapter;
  private kalshiQueue: RateLimitedQueue;
  private polymarketQueue: RateLimitedQueue;
  private cache: Map<string, RealResolution> = new Map();
  private config: ResolutionTrackerConfig;

  constructor(config: ResolutionTrackerConfig = {}) {
    this.config = config;

    this.kalshiAdapter = createKalshiAdapter({
      apiKey: config.kalshiApiKey
    });
    this.polymarketAdapter = createPolymarketAdapter({
      apiKey: config.polymarketApiKey
    });

    this.kalshiQueue = createQueueForExchange('KALSHI');
    this.polymarketQueue = createQueueForExchange('POLYMARKET');
  }

  async checkResolution(pair: CrossExchangePair): Promise<RealResolution> {
    const cacheKey = pair.id;
    if (this.config.cacheResolutions && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!;
      if (cached.sameOutcome !== null) {
        return cached;
      }
    }

    const [exchange1Result, exchange2Result] = await Promise.all([
      this.fetchResolution(pair.exchange1, pair.market1.id),
      this.fetchResolution(pair.exchange2, pair.market2.id)
    ]);

    const resolution: RealResolution = {
      marketPairId: pair.id,
      exchange1: {
        marketId: pair.market1.id,
        exchange: pair.exchange1,
        outcome: exchange1Result.outcome,
        resolvedAt: exchange1Result.resolvedAt,
        resolutionSource: exchange1Result.source
      },
      exchange2: {
        marketId: pair.market2.id,
        exchange: pair.exchange2,
        outcome: exchange2Result.outcome,
        resolvedAt: exchange2Result.resolvedAt,
        resolutionSource: exchange2Result.source
      },
      sameOutcome: this.calculateSameOutcome(exchange1Result.outcome, exchange2Result.outcome),
      verifiedAt: new Date()
    };

    if (this.config.cacheResolutions) {
      this.cache.set(cacheKey, resolution);
    }

    return resolution;
  }

  async batchCheckResolutions(
    pairs: CrossExchangePair[],
    onProgress?: (completed: number, total: number) => void
  ): Promise<Map<string, RealResolution>> {
    const results = new Map<string, RealResolution>();

    for (let i = 0; i < pairs.length; i++) {
      const pair = pairs[i];
      try {
        const resolution = await this.checkResolution(pair);
        results.set(pair.id, resolution);
      } catch (error: any) {
        console.error(`[ResolutionTracker] Failed to check resolution for ${pair.id}:`, error.message);
        results.set(pair.id, {
          marketPairId: pair.id,
          exchange1: {
            marketId: pair.market1.id,
            exchange: pair.exchange1,
            outcome: 'PENDING'
          },
          exchange2: {
            marketId: pair.market2.id,
            exchange: pair.exchange2,
            outcome: 'PENDING'
          },
          sameOutcome: null
        });
      }

      if (onProgress) {
        onProgress(i + 1, pairs.length);
      }
    }

    return results;
  }

  verifyAlignment(resolution: RealResolution): ResolutionAlignmentResult {
    const { exchange1, exchange2 } = resolution;

    if (exchange1.outcome === 'PENDING' || exchange2.outcome === 'PENDING') {
      return {
        aligned: false,
        risk: 'pending',
        details: 'One or both markets have not yet resolved'
      };
    }

    if (exchange1.outcome === 'VOIDED' || exchange2.outcome === 'VOIDED') {
      return {
        aligned: false,
        risk: 'voided',
        details: 'One or both markets were voided'
      };
    }

    if (exchange1.outcome !== exchange2.outcome) {
      return {
        aligned: false,
        risk: 'outcome_mismatch',
        details: `Exchange 1 resolved ${exchange1.outcome}, Exchange 2 resolved ${exchange2.outcome}`
      };
    }

    if (exchange1.resolvedAt && exchange2.resolvedAt) {
      const timeDiffMs = Math.abs(
        exchange1.resolvedAt.getTime() - exchange2.resolvedAt.getTime()
      );
      const timeDiffHours = timeDiffMs / (1000 * 60 * 60);

      if (timeDiffHours > 24) {
        return {
          aligned: true,
          risk: 'timing_mismatch',
          details: `Markets resolved ${timeDiffHours.toFixed(1)} hours apart`,
          timingDifferenceHours: timeDiffHours
        };
      }
    }

    return {
      aligned: true,
      risk: 'none',
      details: 'Both markets resolved identically'
    };
  }

  async trackPendingResolutions(
    pairs: CrossExchangePair[],
    options: {
      pollIntervalMs?: number;
      maxWaitMs?: number;
      onResolved?: (pairId: string, resolution: RealResolution) => void;
      onProgress?: (pending: number, total: number) => void;
    } = {}
  ): Promise<Map<string, RealResolution>> {
    const {
      pollIntervalMs = 3600000, // 1 hour default
      maxWaitMs = 86400000 * 7, // 7 days default
      onResolved,
      onProgress
    } = options;

    const results = new Map<string, RealResolution>();
    const pendingPairs = new Set(pairs.map(p => p.id));
    const pairMap = new Map(pairs.map(p => [p.id, p]));
    const startTime = Date.now();

    while (pendingPairs.size > 0 && (Date.now() - startTime) < maxWaitMs) {
      for (const pairId of pendingPairs) {
        const pair = pairMap.get(pairId)!;
        const resolution = await this.checkResolution(pair);

        if (resolution.sameOutcome !== null) {
          results.set(pairId, resolution);
          pendingPairs.delete(pairId);
          if (onResolved) {
            onResolved(pairId, resolution);
          }
        }
      }

      if (onProgress) {
        onProgress(pendingPairs.size, pairs.length);
      }

      if (pendingPairs.size > 0) {
        await this.delay(pollIntervalMs);
      }
    }

    for (const pairId of pendingPairs) {
      if (!results.has(pairId)) {
        results.set(pairId, {
          marketPairId: pairId,
          exchange1: {
            marketId: pairMap.get(pairId)!.market1.id,
            exchange: pairMap.get(pairId)!.exchange1,
            outcome: 'PENDING'
          },
          exchange2: {
            marketId: pairMap.get(pairId)!.market2.id,
            exchange: pairMap.get(pairId)!.exchange2,
            outcome: 'PENDING'
          },
          sameOutcome: null
        });
      }
    }

    return results;
  }

  private async fetchResolution(
    exchange: ExchangeName,
    marketId: string
  ): Promise<{ outcome: ResolutionOutcome; resolvedAt?: Date; source?: string }> {
    const queue = exchange === 'KALSHI' ? this.kalshiQueue : this.polymarketQueue;

    return queue.add(async () => {
      let result;

      if (exchange === 'KALSHI') {
        result = await this.kalshiAdapter.getMarketResolution(marketId);
      } else if (exchange === 'POLYMARKET') {
        result = await this.polymarketAdapter.getMarketResolution(marketId);
      } else {
        return { outcome: 'PENDING' as ResolutionOutcome };
      }

      if (!result || !result.resolved) {
        return { outcome: 'PENDING' as ResolutionOutcome };
      }

      return {
        outcome: result.outcome as ResolutionOutcome,
        resolvedAt: result.resolvedAt,
        source: `${exchange} API`
      };
    });
  }

  private calculateSameOutcome(
    outcome1: ResolutionOutcome,
    outcome2: ResolutionOutcome
  ): boolean | null {
    if (outcome1 === 'PENDING' || outcome2 === 'PENDING') {
      return null;
    }
    if (outcome1 === 'VOIDED' || outcome2 === 'VOIDED') {
      return null;
    }
    return outcome1 === outcome2;
  }

  getCachedResolution(pairId: string): RealResolution | undefined {
    return this.cache.get(pairId);
  }

  clearCache(): void {
    this.cache.clear();
  }

  getPendingResolutions(): RealResolution[] {
    return Array.from(this.cache.values()).filter(r => r.sameOutcome === null);
  }

  getResolvedResolutions(): RealResolution[] {
    return Array.from(this.cache.values()).filter(r => r.sameOutcome !== null);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export function createResolutionTracker(config?: ResolutionTrackerConfig): ResolutionTracker {
  return new ResolutionTracker(config);
}
