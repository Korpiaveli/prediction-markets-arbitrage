import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import fs from 'fs';
import { KalshiAdapter, PolymarketAdapter } from '@arb/exchanges';
import { MarketMatcher } from '@arb/scanner';
import { CrossExchangePair, HistoricalSnapshot, ArbitrageDirection } from '@arb/core';

export interface FetchHistoricalPairsOptions {
  days: number;
  fidelity: number;
  minConfidence: number;
  dataDir: string;
  maxPairs?: number;
}

interface AlignedSnapshot {
  timestamp: Date;
  kalshiPrice: number;
  polyPrice: number;
}

export async function fetchHistoricalPairs(options: FetchHistoricalPairsOptions) {
  const spinner = ora('Initializing historical data fetch...').start();

  try {
    const kalshi = new KalshiAdapter({ testMode: false });
    const polymarket = new PolymarketAdapter({ testMode: false });

    spinner.text = 'Connecting to exchanges...';
    await Promise.all([kalshi.connect(), polymarket.connect()]);

    spinner.text = 'Finding matched market pairs...';
    const matcher = new MarketMatcher({
      minConfidence: options.minConfidence / 100,
      includeLowConfidence: false,
      includeUncertain: false
    });

    const pairs = await matcher.matchCrossExchangeMarkets(kalshi, polymarket);
    const pairsToFetch = options.maxPairs ? pairs.slice(0, options.maxPairs) : pairs;

    spinner.succeed(`Found ${pairs.length} matched pairs, fetching ${pairsToFetch.length}`);

    const endTs = Math.floor(Date.now() / 1000);
    const startTs = endTs - (options.days * 24 * 60 * 60);

    const outputDir = path.join(path.resolve(options.dataDir), 'historical');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const allSnapshots: HistoricalSnapshot[] = [];
    const pairResults: { pair: CrossExchangePair; snapshots: HistoricalSnapshot[]; error?: string }[] = [];

    for (let i = 0; i < pairsToFetch.length; i++) {
      const pair = pairsToFetch[i];
      const pairSpinner = ora(`[${i + 1}/${pairsToFetch.length}] ${pair.description.substring(0, 40)}...`).start();

      try {
        const kalshiMarketId = pair.market1.exchange === 'KALSHI' ? pair.market1.id : pair.market2.id;
        const polyMarketId = pair.market1.exchange === 'POLYMARKET' ? pair.market1.id : pair.market2.id;
        const polyMarket = pair.market1.exchange === 'POLYMARKET' ? pair.market1 : pair.market2;

        const tokenId = polyMarket.metadata?.tokens?.[0]?.tokenId || polyMarketId;

        const [kalshiPrices, polyPrices] = await Promise.all([
          kalshi.getHistoricalPrices(kalshiMarketId, startTs, endTs, options.fidelity),
          polymarket.getHistoricalPrices(tokenId, startTs, endTs, options.fidelity)
        ]);

        if (kalshiPrices.length === 0 && polyPrices.length === 0) {
          pairSpinner.warn(`No data for ${pair.description.substring(0, 30)}`);
          pairResults.push({ pair, snapshots: [], error: 'No historical data available' });
          continue;
        }

        const aligned = alignPriceData(kalshiPrices, polyPrices, options.fidelity);

        const snapshots = aligned.map(a => {
          const kalshiYes = a.kalshiPrice;
          const kalshiNo = 1 - kalshiYes;
          const polyYes = a.polyPrice;
          const polyNo = 1 - polyYes;

          const cost1 = kalshiYes + polyNo;
          const cost2 = kalshiNo + polyYes;
          const profit1 = ((1 - cost1) / cost1) * 100;
          const profit2 = ((1 - cost2) / cost2) * 100;

          const bestProfit = Math.max(profit1, profit2);
          const direction: ArbitrageDirection = profit1 > profit2
            ? 'EXCHANGE1_YES_EXCHANGE2_NO'
            : 'EXCHANGE1_NO_EXCHANGE2_YES';

          return {
            timestamp: a.timestamp,
            marketPairId: pair.id,
            exchange1: {
              marketId: kalshiMarketId,
              yesPrice: kalshiYes,
              noPrice: kalshiNo
            },
            exchange2: {
              marketId: polyMarketId,
              yesPrice: polyYes,
              noPrice: polyNo
            },
            arbitrage: {
              exists: bestProfit > 0,
              profitPercent: bestProfit,
              direction,
              totalCost: direction === 'EXCHANGE1_YES_EXCHANGE2_NO' ? cost1 : cost2
            }
          };
        });

        allSnapshots.push(...snapshots);
        pairResults.push({ pair, snapshots });

        const profitableCount = snapshots.filter(s => s.arbitrage.exists && s.arbitrage.profitPercent > 1).length;
        pairSpinner.succeed(
          `${pair.description.substring(0, 30)}: ${snapshots.length} snapshots, ${profitableCount} profitable`
        );

      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        pairSpinner.fail(`${pair.description.substring(0, 30)}: ${errMsg}`);
        pairResults.push({ pair, snapshots: [], error: errMsg });
      }
    }

    await Promise.all([kalshi.disconnect(), polymarket.disconnect()]);

    const outputFile = path.join(outputDir, `pairs_${Date.now()}.json`);
    const outputData = {
      fetchedAt: new Date().toISOString(),
      period: {
        startTs,
        endTs,
        days: options.days
      },
      config: {
        fidelity: options.fidelity,
        minConfidence: options.minConfidence
      },
      summary: {
        totalPairs: pairsToFetch.length,
        successfulPairs: pairResults.filter(r => r.snapshots.length > 0).length,
        totalSnapshots: allSnapshots.length,
        profitableSnapshots: allSnapshots.filter(s => s.arbitrage.exists && s.arbitrage.profitPercent > 1).length
      },
      pairs: pairResults.map(r => ({
        id: r.pair.id,
        description: r.pair.description,
        exchange1MarketId: r.pair.market1Id,
        exchange2MarketId: r.pair.market2Id,
        snapshotCount: r.snapshots.length,
        error: r.error
      })),
      snapshots: allSnapshots
    };

    fs.writeFileSync(outputFile, JSON.stringify(outputData, null, 2));

    console.log(chalk.cyan('\n═══════════════════════════════════════════════════════════'));
    console.log(chalk.cyan.bold('              HISTORICAL DATA FETCH SUMMARY                 '));
    console.log(chalk.cyan('═══════════════════════════════════════════════════════════'));
    console.log(chalk.white(`\n  Period: ${options.days} days`));
    console.log(chalk.white(`  Fidelity: ${options.fidelity} minutes`));
    console.log(chalk.white(`  Pairs fetched: ${outputData.summary.successfulPairs}/${outputData.summary.totalPairs}`));
    console.log(chalk.white(`  Total snapshots: ${outputData.summary.totalSnapshots.toLocaleString()}`));
    console.log(chalk.white(`  Profitable (>1%): ${outputData.summary.profitableSnapshots.toLocaleString()}`));
    console.log(chalk.green(`\n  💾 Saved to: ${outputFile}\n`));

  } catch (error) {
    spinner.fail('Failed to fetch historical pairs');
    if (error instanceof Error) {
      console.error(chalk.red(`\nError: ${error.message}\n`));
    }
    throw error;
  }
}

function alignPriceData(
  kalshiPrices: { timestamp: Date; price: number }[],
  polyPrices: { timestamp: Date; price: number }[],
  fidelityMinutes: number
): AlignedSnapshot[] {
  if (kalshiPrices.length === 0 || polyPrices.length === 0) {
    return [];
  }

  const bucketMs = fidelityMinutes * 60 * 1000;
  const kalshiBuckets = new Map<number, number>();
  const polyBuckets = new Map<number, number>();

  for (const p of kalshiPrices) {
    const bucket = Math.floor(p.timestamp.getTime() / bucketMs) * bucketMs;
    kalshiBuckets.set(bucket, p.price);
  }

  for (const p of polyPrices) {
    const bucket = Math.floor(p.timestamp.getTime() / bucketMs) * bucketMs;
    polyBuckets.set(bucket, p.price);
  }

  const commonBuckets = [...kalshiBuckets.keys()].filter(b => polyBuckets.has(b));

  return commonBuckets
    .sort((a, b) => a - b)
    .map(bucket => ({
      timestamp: new Date(bucket),
      kalshiPrice: kalshiBuckets.get(bucket)!,
      polyPrice: polyBuckets.get(bucket)!
    }));
}

export function createFetchHistoricalPairsCommand() {
  return {
    command: 'fetch-historical-pairs',
    description: 'Fetch historical price data for matched market pairs',
    options: [
      { flags: '-d, --days <n>', description: 'Number of days of history to fetch', defaultValue: '30' },
      { flags: '-f, --fidelity <minutes>', description: 'Price snapshot interval in minutes', defaultValue: '5' },
      { flags: '-c, --min-confidence <n>', description: 'Minimum pair confidence score (0-100)', defaultValue: '60' },
      { flags: '--max-pairs <n>', description: 'Maximum pairs to fetch (default: all)' },
      { flags: '--data-dir <path>', description: 'Data directory', defaultValue: './data' }
    ],
    action: async (options: any) => {
      await fetchHistoricalPairs({
        days: parseInt(options.days),
        fidelity: parseInt(options.fidelity),
        minConfidence: parseInt(options.minConfidence),
        maxPairs: options.maxPairs ? parseInt(options.maxPairs) : undefined,
        dataDir: options.dataDir
      });
    }
  };
}
