import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import fs from 'fs';
import { KalshiAdapter, PolymarketAdapter } from '@arb/exchanges';
import { MarketMatcher } from '@arb/scanner';
import {
  createHistoricalStore,
  createHistoricalCollector,
  createResolutionTracker
} from '@arb/historical';

export interface CollectHistoricalOptions {
  days: number;
  fidelity: number;
  minConfidence: number;
  dataDir: string;
  maxPairs?: number;
  includeResolutions?: boolean;
}

export async function collectHistoricalData(options: CollectHistoricalOptions) {
  const spinner = ora('Initializing historical data collection...').start();

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

    spinner.succeed(`Found ${pairs.length} matched pairs, collecting ${pairsToFetch.length}`);

    const store = createHistoricalStore({
      basePath: path.resolve(options.dataDir, 'historical')
    });

    const collector = createHistoricalCollector({
      fidelityMinutes: options.fidelity,
      minProfitThreshold: 0.5
    });

    const resolutionTracker = createResolutionTracker({
      cacheResolutions: true
    });

    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - options.days * 24 * 60 * 60 * 1000);

    console.log(chalk.cyan(`\nCollecting data from ${startDate.toDateString()} to ${endDate.toDateString()}`));
    console.log(chalk.cyan(`Fidelity: ${options.fidelity} minutes\n`));

    const progressSpinner = ora('Collecting snapshots...').start();

    const { snapshots, errors } = await collector.collectSnapshots(
      pairsToFetch,
      { start: startDate, end: endDate },
      (completed, total, currentPair) => {
        progressSpinner.text = `[${completed}/${total}] ${currentPair.substring(0, 40)}...`;
      }
    );

    progressSpinner.succeed(`Collected ${snapshots.length} snapshots`);

    if (errors.length > 0) {
      console.log(chalk.yellow(`\n⚠️  ${errors.length} collection errors:`));
      errors.slice(0, 5).forEach(e => {
        console.log(chalk.yellow(`   • ${e.marketPairId}: ${e.error}`));
      });
      if (errors.length > 5) {
        console.log(chalk.gray(`   ... and ${errors.length - 5} more`));
      }
    }

    const saveSpinner = ora('Saving snapshots to storage...').start();
    await store.saveSnapshots(snapshots);
    saveSpinner.succeed('Snapshots saved');

    if (options.includeResolutions) {
      const resSpinner = ora('Collecting resolution data...').start();
      let resolutionCount = 0;

      for (let i = 0; i < pairsToFetch.length; i++) {
        const pair = pairsToFetch[i];
        resSpinner.text = `Checking resolution [${i + 1}/${pairsToFetch.length}] ${pair.description.substring(0, 30)}...`;

        try {
          const resolution = await resolutionTracker.checkResolution(pair);
          if (resolution) {
            await store.saveResolution(resolution);
            resolutionCount++;
          }
        } catch (_e) {
          // Skip resolution errors
        }
      }

      resSpinner.succeed(`Collected ${resolutionCount} resolutions`);
    }

    await Promise.all([kalshi.disconnect(), polymarket.disconnect()]);

    const index = await store.buildIndex();

    console.log(chalk.cyan('\n═══════════════════════════════════════════════════════════'));
    console.log(chalk.cyan.bold('           HISTORICAL DATA COLLECTION COMPLETE              '));
    console.log(chalk.cyan('═══════════════════════════════════════════════════════════'));
    console.log(chalk.white(`\n  Period: ${options.days} days`));
    console.log(chalk.white(`  Fidelity: ${options.fidelity} minutes`));
    console.log(chalk.white(`  Pairs processed: ${pairsToFetch.length}`));
    console.log(chalk.white(`  Snapshots stored: ${index.snapshotCount.toLocaleString()}`));
    console.log(chalk.white(`  Resolutions stored: ${index.resolutionCount}`));
    console.log(chalk.white(`  Market pairs: ${index.marketPairs.length}`));
    console.log(chalk.white(`  Date range: ${index.dateRange.earliest.toDateString()} - ${index.dateRange.latest.toDateString()}`));
    console.log(chalk.green(`\n  💾 Data stored in: ${store.getBasePath()}\n`));

    const summaryPath = path.resolve(options.dataDir, 'historical', 'collection_summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify({
      collectedAt: new Date().toISOString(),
      config: options,
      index,
      errors: errors.map(e => ({ marketPairId: e.marketPairId, error: e.error }))
    }, null, 2));

    return { snapshots, index, errors };

  } catch (error) {
    spinner.fail('Failed to collect historical data');
    if (error instanceof Error) {
      console.error(chalk.red(`\nError: ${error.message}\n`));
    }
    throw error;
  }
}

export function createCollectHistoricalCommand() {
  return {
    command: 'collect-historical',
    description: 'Collect historical price data and resolutions for matched market pairs (stores in @arb/historical format)',
    options: [
      { flags: '-d, --days <n>', description: 'Number of days of history to collect', defaultValue: '30' },
      { flags: '-f, --fidelity <minutes>', description: 'Price snapshot interval in minutes', defaultValue: '60' },
      { flags: '-c, --min-confidence <n>', description: 'Minimum pair confidence score (0-100)', defaultValue: '65' },
      { flags: '--max-pairs <n>', description: 'Maximum pairs to collect (default: all)' },
      { flags: '--data-dir <path>', description: 'Data directory', defaultValue: './data' },
      { flags: '--include-resolutions', description: 'Also collect resolution status for each pair', defaultValue: false }
    ],
    action: async (options: any) => {
      await collectHistoricalData({
        days: parseInt(options.days),
        fidelity: parseInt(options.fidelity),
        minConfidence: parseInt(options.minConfidence),
        maxPairs: options.maxPairs ? parseInt(options.maxPairs) : undefined,
        dataDir: options.dataDir,
        includeResolutions: options.includeResolutions
      });
    }
  };
}
