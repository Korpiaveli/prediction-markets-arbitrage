import chalk from 'chalk';
import ora from 'ora';
import { KalshiAdapter } from '@arb/exchanges';
import path from 'path';
import fs from 'fs';

export interface FetchHistoricalOptions {
  exchange: 'kalshi';
  market: string;
  days?: number;
  limit?: number;
  dataDir: string;
  output?: string;
}

export async function fetchHistorical(options: FetchHistoricalOptions) {
  const spinner = ora('Fetching historical data...').start();

  try {
    if (options.exchange !== 'kalshi') {
      throw new Error('Only Kalshi supports historical data API. PredictIt requires CSV downloads.');
    }

    // Initialize Kalshi adapter
    const kalshi = new KalshiAdapter({ testMode: false });
    await kalshi.connect();

    // Calculate time range
    const endDate = new Date();
    const startDate = new Date();
    if (options.days) {
      startDate.setDate(startDate.getDate() - options.days);
    } else {
      startDate.setMonth(startDate.getMonth() - 1); // Default 1 month
    }

    spinner.text = `Fetching trades for ${options.market}...`;

    // Fetch all historical trades with pagination
    const allTrades: any[] = [];
    let cursor: string | undefined;
    let pageCount = 0;
    const maxPages = 100; // Safety limit

    do {
      const response = await kalshi.getHistoricalTrades(options.market, {
        limit: options.limit || 100,
        cursor,
        minTimestamp: startDate,
        maxTimestamp: endDate
      });

      allTrades.push(...response.trades);
      cursor = response.cursor;
      pageCount++;

      spinner.text = `Fetched ${allTrades.length} trades (page ${pageCount})...`;

      // Break if no cursor or hit max pages
      if (!cursor || cursor === '' || pageCount >= maxPages) {
        break;
      }
    } while (true);

    await kalshi.disconnect();

    spinner.succeed(`Fetched ${allTrades.length} historical trades`);

    // Display summary
    console.log(chalk.cyan('\n═══════════════════════════════════════════════════════════'));
    console.log(chalk.cyan.bold('           HISTORICAL DATA SUMMARY                         '));
    console.log(chalk.cyan('═══════════════════════════════════════════════════════════'));

    if (allTrades.length === 0) {
      console.log(chalk.yellow('\n  No trades found for this market in the specified period\n'));
      return;
    }

    // Calculate statistics
    const stats = calculateTradeStats(allTrades);

    console.log(chalk.white(`\n  Market: ${options.market}`));
    console.log(chalk.white(`  Period: ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`));
    console.log(chalk.white(`  Total Trades: ${allTrades.length}`));
    console.log(chalk.white(`  Total Volume: ${stats.totalVolume.toLocaleString()} contracts`));
    console.log(chalk.white(`  Price Range: $${stats.minPrice.toFixed(2)} - $${stats.maxPrice.toFixed(2)}`));
    console.log(chalk.white(`  Avg Trade Size: ${stats.avgTradeSize.toFixed(0)} contracts`));
    console.log(chalk.white(`  First Trade: ${new Date(allTrades[allTrades.length - 1].created_time).toLocaleString()}`));
    console.log(chalk.white(`  Last Trade: ${new Date(allTrades[0].created_time).toLocaleString()}\n`));

    // Save to file
    const outputPath = options.output || path.join(
      path.resolve(options.dataDir),
      `historical_${options.market}_${Date.now()}.json`
    );

    const outputData = {
      market: options.market,
      exchange: 'KALSHI',
      fetchedAt: new Date().toISOString(),
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      },
      statistics: stats,
      trades: allTrades
    };

    fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
    console.log(chalk.green(`💾 Saved to: ${outputPath}\n`));

    // Display sample trades
    console.log(chalk.cyan('📊 Sample Trades (most recent 5):\n'));
    const sampleTrades = allTrades.slice(0, 5);

    for (const trade of sampleTrades) {
      const time = new Date(trade.created_time).toLocaleString();
      const price = trade.yes_price_dollars || trade.price;
      const side = trade.taker_side;
      const volume = trade.count;

      console.log(chalk.white(`  ${time} - ${side.toUpperCase()} $${price} x ${volume}`));
    }
    console.log('');

  } catch (error) {
    spinner.fail('Failed to fetch historical data');
    if (error instanceof Error) {
      console.error(chalk.red(`\nError: ${error.message}\n`));
    }
    throw error;
  }
}

function calculateTradeStats(trades: any[]) {
  const totalVolume = trades.reduce((sum, t) => sum + (t.count || 0), 0);
  const prices = trades.map(t => parseFloat(t.yes_price_dollars || t.price || 0));

  return {
    totalVolume,
    avgTradeSize: totalVolume / trades.length,
    minPrice: Math.min(...prices),
    maxPrice: Math.max(...prices),
    avgPrice: prices.reduce((sum, p) => sum + p, 0) / prices.length,
    uniqueDays: new Set(trades.map(t => new Date(t.created_time).toDateString())).size
  };
}

export function createFetchHistoricalCommand() {
  return {
    command: 'fetch-historical',
    description: 'Fetch historical trade data from exchanges',
    options: [
      { flags: '-e, --exchange <name>', description: 'Exchange name (currently only: kalshi)', defaultValue: 'kalshi' },
      { flags: '-m, --market <ticker>', description: 'Market ticker (required)' },
      { flags: '-d, --days <n>', description: 'Number of days of history to fetch' },
      { flags: '-l, --limit <n>', description: 'Trades per page', defaultValue: '100' },
      { flags: '--data-dir <path>', description: 'Data directory', defaultValue: './data' },
      { flags: '-o, --output <path>', description: 'Output file path (optional)' }
    ],
    action: async (options: any) => {
      if (!options.market) {
        console.error(chalk.red('Error: --market flag is required\n'));
        console.log(chalk.yellow('Example: arb-scan fetch-historical --market KXHOUSE-28 --days 30\n'));
        process.exit(1);
      }

      await fetchHistorical({
        exchange: options.exchange,
        market: options.market,
        days: options.days ? parseInt(options.days) : undefined,
        limit: parseInt(options.limit),
        dataDir: options.dataDir,
        output: options.output
      });
    }
  };
}
