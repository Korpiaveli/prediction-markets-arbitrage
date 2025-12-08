import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import fs from 'fs';
import Table from 'cli-table3';
import { HistoricalBacktestEngine, HistoricalBacktestResult } from '@arb/ml';
import { HistoricalSnapshot, HistoricalResolution } from '@arb/core';

export interface BacktestHistoricalOptions {
  capital: number;
  weeks: number;
  minProfit: number;
  slippage: 'conservative' | 'realistic' | 'optimistic';
  dataDir: string;
  input?: string;
  output?: string;
}

interface HistoricalDataFile {
  snapshots: HistoricalSnapshot[];
  pairs: { id: string; description: string }[];
  period: { startTs: number; endTs: number; days: number };
}

export async function backtestHistorical(options: BacktestHistoricalOptions) {
  const spinner = ora('Loading historical data...').start();

  try {
    const dataFile = options.input || findLatestDataFile(options.dataDir);
    if (!dataFile) {
      throw new Error('No historical data file found. Run fetch-historical-pairs first.');
    }

    spinner.text = `Loading ${dataFile}...`;
    const rawData = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
    const data: HistoricalDataFile = {
      snapshots: rawData.snapshots.map((s: any) => ({
        ...s,
        timestamp: new Date(s.timestamp)
      })),
      pairs: rawData.pairs,
      period: rawData.period
    };

    const resolutions = loadResolutions(options.dataDir);

    spinner.succeed(`Loaded ${data.snapshots.length} snapshots from ${data.pairs.length} pairs`);

    console.log(chalk.cyan('\n═══════════════════════════════════════════════════════════'));
    console.log(chalk.cyan.bold('           HISTORICAL BACKTEST: KALSHI + POLYMARKET         '));
    console.log(chalk.cyan('═══════════════════════════════════════════════════════════'));

    const startDate = new Date(data.period.startTs * 1000);
    const endDate = new Date(data.period.endTs * 1000);
    console.log(chalk.white(`\n  Period: ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()} (${data.period.days} days)`));
    console.log(chalk.white(`  Matched Pairs: ${data.pairs.length}`));
    console.log(chalk.white(`  Total Snapshots: ${data.snapshots.toLocaleString()}`));
    console.log(chalk.white(`  Starting Capital: $${options.capital.toLocaleString()}`));
    console.log(chalk.white(`  Min Profit Threshold: ${options.minProfit}%`));
    console.log(chalk.white(`  Slippage Model: ${options.slippage}`));

    const engine = new HistoricalBacktestEngine({
      initialCapital: options.capital,
      maxExposure: options.capital,
      cooldownMs: 60000,
      humanDelayMs: [1000, 3000],
      minProfitPercent: options.minProfit,
      slippageModel: options.slippage,
      maxPositionPercent: 0.5
    });

    spinner.start('Selecting random weeks...');
    const randomWeeks = engine.selectRandomWeeks(data.snapshots, options.weeks);
    spinner.succeed(`Selected ${randomWeeks.length} random weeks`);

    spinner.start('Running backtest simulation...');
    const result = engine.run(data.snapshots, resolutions, randomWeeks);
    spinner.succeed('Backtest complete');

    displayResults(result);

    const reportPath = options.output || path.join(
      path.resolve(options.dataDir),
      `backtest_report_${Date.now()}.json`
    );
    saveReport(result, reportPath);

    console.log(chalk.green(`\n💾 Full report saved to: ${reportPath}\n`));

  } catch (error) {
    spinner.fail('Backtest failed');
    if (error instanceof Error) {
      console.error(chalk.red(`\nError: ${error.message}\n`));
    }
    throw error;
  }
}

function findLatestDataFile(dataDir: string): string | null {
  const historicalDir = path.join(path.resolve(dataDir), 'historical');
  if (!fs.existsSync(historicalDir)) {
    return null;
  }

  const files = fs.readdirSync(historicalDir)
    .filter(f => f.startsWith('pairs_') && f.endsWith('.json'))
    .sort()
    .reverse();

  return files.length > 0 ? path.join(historicalDir, files[0]) : null;
}

function loadResolutions(dataDir: string): HistoricalResolution[] {
  const resolutionFile = path.join(path.resolve(dataDir), 'resolutions.json');
  if (!fs.existsSync(resolutionFile)) {
    console.log(chalk.yellow('  ⚠️  No resolution data found. Using simulated outcomes.'));
    return [];
  }

  const data = JSON.parse(fs.readFileSync(resolutionFile, 'utf-8'));
  return data.map((r: any) => ({
    ...r,
    resolvedAt: new Date(r.resolvedAt)
  }));
}

function displayResults(result: HistoricalBacktestResult) {
  console.log(chalk.cyan('\n═══════════════════════════════════════════════════════════'));
  console.log(chalk.cyan.bold('                    RANDOM WEEK RESULTS                     '));
  console.log(chalk.cyan('═══════════════════════════════════════════════════════════\n'));

  const weekTable = new Table({
    head: [
      chalk.bold('Week'),
      chalk.bold('Dates'),
      chalk.bold('Trades'),
      chalk.bold('W/L'),
      chalk.bold('Return'),
      chalk.bold('Sharpe'),
      chalk.bold('Drawdown')
    ],
    colWidths: [8, 25, 10, 10, 10, 10, 10]
  });

  result.weeks.forEach((week, idx) => {
    const returnColor = week.returnPercent >= 0 ? chalk.green : chalk.red;
    const sharpeColor = week.sharpeRatio >= 1 ? chalk.green :
                        week.sharpeRatio >= 0 ? chalk.yellow : chalk.red;

    weekTable.push([
      `Week ${idx + 1}`,
      `${formatDate(week.weekStart)} - ${formatDate(week.weekEnd)}`,
      week.tradesExecuted.toString(),
      `${week.wins}/${week.losses}`,
      returnColor(`${week.returnPercent >= 0 ? '+' : ''}${week.returnPercent.toFixed(2)}%`),
      sharpeColor(week.sharpeRatio.toFixed(2)),
      `${(week.maxDrawdown * 100).toFixed(1)}%`
    ]);
  });

  console.log(weekTable.toString());

  console.log(chalk.cyan('\n═══════════════════════════════════════════════════════════'));
  console.log(chalk.cyan.bold('                      AGGREGATE SUMMARY                     '));
  console.log(chalk.cyan('═══════════════════════════════════════════════════════════\n'));

  const { aggregate } = result;
  const returnColor = aggregate.avgWeeklyReturn >= 0 ? chalk.green : chalk.red;

  console.log(chalk.white(`  Avg Weekly Return: ${returnColor(`${aggregate.avgWeeklyReturn >= 0 ? '+' : ''}${aggregate.avgWeeklyReturn.toFixed(2)}%`)} (+/- ${aggregate.stdDevReturn.toFixed(2)}%)`));
  console.log(chalk.white(`  Annualized Return: ${returnColor(`~${aggregate.annualizedReturn.toFixed(0)}%`)} (theoretical)`));
  console.log(chalk.white(`  Win Rate: ${(aggregate.overallWinRate * 100).toFixed(1)}%`));
  console.log(chalk.white(`  Avg Sharpe Ratio: ${aggregate.avgSharpe.toFixed(2)}`));
  console.log(chalk.white(`  Avg Max Drawdown: ${(aggregate.avgMaxDrawdown * 100).toFixed(1)}%`));
  console.log(chalk.white(`  Total Trades: ${aggregate.totalTrades}`));
  console.log(chalk.white(`  95% CI: [${aggregate.confidence95[0].toFixed(2)}%, ${aggregate.confidence95[1].toFixed(2)}%]`));

  console.log(chalk.cyan('\n═══════════════════════════════════════════════════════════'));
  console.log(chalk.cyan.bold('                         INSIGHTS                          '));
  console.log(chalk.cyan('═══════════════════════════════════════════════════════════\n'));

  result.insights.forEach(insight => {
    if (insight.startsWith('✅')) {
      console.log(chalk.green(`  ${insight}`));
    } else if (insight.startsWith('⚠️')) {
      console.log(chalk.yellow(`  ${insight}`));
    } else {
      console.log(chalk.white(`  ${insight}`));
    }
  });

  console.log(chalk.cyan('\n═══════════════════════════════════════════════════════════'));
  console.log(chalk.cyan.bold('                         CAVEATS                           '));
  console.log(chalk.cyan('═══════════════════════════════════════════════════════════\n'));

  console.log(chalk.gray('  - Assumes execution within 1-3 seconds of detection'));
  console.log(chalk.gray('  - Does not account for exchange API downtime'));
  console.log(chalk.gray('  - Limited to markets with matched pairs'));
  console.log(chalk.gray('  - Slippage model is estimated, not measured'));
  console.log(chalk.gray('  - Past performance does not guarantee future results'));
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function saveReport(result: HistoricalBacktestResult, outputPath: string) {
  const report = {
    generatedAt: new Date().toISOString(),
    config: result.config,
    period: {
      start: result.period.start.toISOString(),
      end: result.period.end.toISOString()
    },
    totalSnapshots: result.totalSnapshots,
    aggregate: result.aggregate,
    weeks: result.weeks.map(w => ({
      weekStart: w.weekStart.toISOString(),
      weekEnd: w.weekEnd.toISOString(),
      tradesAttempted: w.tradesAttempted,
      tradesExecuted: w.tradesExecuted,
      wins: w.wins,
      losses: w.losses,
      totalReturn: w.totalReturn,
      returnPercent: w.returnPercent,
      sharpeRatio: w.sharpeRatio,
      maxDrawdown: w.maxDrawdown,
      tradeCount: w.trades.length
    })),
    insights: result.insights
  };

  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
}

export function createBacktestHistoricalCommand() {
  return {
    command: 'backtest-historical',
    description: 'Run historical backtest simulation on fetched market pair data',
    options: [
      { flags: '-c, --capital <amount>', description: 'Starting capital in dollars', defaultValue: '1000' },
      { flags: '-w, --weeks <n>', description: 'Number of random weeks to simulate', defaultValue: '5' },
      { flags: '-p, --min-profit <percent>', description: 'Minimum profit % to execute', defaultValue: '1.0' },
      { flags: '-s, --slippage <model>', description: 'Slippage model: conservative, realistic, optimistic', defaultValue: 'realistic' },
      { flags: '--data-dir <path>', description: 'Data directory', defaultValue: './data' },
      { flags: '-i, --input <path>', description: 'Specific historical data file to use' },
      { flags: '-o, --output <path>', description: 'Output report file path' }
    ],
    action: async (options: any) => {
      await backtestHistorical({
        capital: parseFloat(options.capital),
        weeks: parseInt(options.weeks),
        minProfit: parseFloat(options.minProfit),
        slippage: options.slippage as 'conservative' | 'realistic' | 'optimistic',
        dataDir: options.dataDir,
        input: options.input,
        output: options.output
      });
    }
  };
}
