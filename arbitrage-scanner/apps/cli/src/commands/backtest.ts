import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { BacktestEngine, BacktestConfig } from '@arb/ml';
import { JsonStorage } from '@arb/storage';
import path from 'path';

export interface BacktestOptions {
  dataDir: string;
  days?: number;
  capital: number;
  maxPosition: number;
  minProfit: number;
  slippage: 'conservative' | 'realistic' | 'optimistic';
  delay: number;
}

export async function runBacktest(options: BacktestOptions) {
  const spinner = ora('Loading historical data...').start();

  try {
    // Load opportunities from storage
    const storage = new JsonStorage({
      dataDir: path.resolve(options.dataDir)
    });
    await storage.connect();

    const endDate = new Date();
    const startDate = new Date();
    if (options.days) {
      startDate.setDate(startDate.getDate() - options.days);
    } else {
      startDate.setMonth(startDate.getMonth() - 1); // Default 1 month
    }

    const opportunities = await storage.getOpportunities({
      limit: 10000,
      orderBy: 'timestamp',
      order: 'asc'
    });

    if (opportunities.length === 0) {
      spinner.fail('No historical data found');
      console.log(chalk.yellow('\n💡 Run some scans first to collect data for backtesting'));
      return;
    }

    spinner.text = 'Running backtest...';

    const config: BacktestConfig = {
      startDate,
      endDate,
      initialCapital: options.capital,
      maxPositionSize: options.maxPosition,
      minProfitPercent: options.minProfit,
      slippageModel: options.slippage,
      executionDelay: options.delay
    };

    const backtester = new BacktestEngine();
    const result = backtester.run(opportunities, config);

    spinner.succeed('Backtest complete');

    displayBacktestResults(result);

  } catch (error) {
    spinner.fail('Backtest failed');
    console.error(chalk.red(error));
    throw error;
  }
}

function displayBacktestResults(result: any) {
  console.log(chalk.cyan('\n╔═══════════════════════════════════════════════════════════╗'));
  console.log(chalk.cyan('║                  BACKTEST RESULTS                         ║'));
  console.log(chalk.cyan('╚═══════════════════════════════════════════════════════════╝'));

  // Period
  console.log(chalk.white('\n📅 Test Period:'));
  console.log(`   ${result.period.start.toLocaleDateString()} - ${result.period.end.toLocaleDateString()}`);

  // Trade Summary
  console.log(chalk.white('\n📊 Trade Summary:'));
  const tradeTable = new Table({
    head: ['Metric', 'Value'],
    colWidths: [30, 30]
  });

  tradeTable.push(
    ['Total Opportunities', result.totalTrades],
    ['Executed Trades', result.executedTrades],
    ['Skipped Trades', result.skippedTrades],
    ['Wins', chalk.green(result.wins)],
    ['Losses', chalk.red(result.losses)],
    ['Break Even', result.breakEven],
    ['Win Rate', chalk.bold(`${(result.winRate * 100).toFixed(1)}%`)]
  );

  console.log(tradeTable.toString());

  // Financial Performance
  console.log(chalk.white('\n💰 Financial Performance:'));
  const perfTable = new Table({
    head: ['Metric', 'Value'],
    colWidths: [30, 30]
  });

  const returnColor = result.returnPercent > 0 ? chalk.green : chalk.red;
  const sharpeColor = result.sharpeRatio > 1 ? chalk.green : result.sharpeRatio > 0.5 ? chalk.yellow : chalk.red;

  perfTable.push(
    ['Initial Capital', `$${result.config.initialCapital.toFixed(2)}`],
    ['Final Capital', `$${result.finalCapital.toFixed(2)}`],
    ['Total Profit', returnColor(`$${result.totalProfit.toFixed(2)}`)],
    ['Total Return', returnColor(`${result.returnPercent.toFixed(2)}%`)],
    ['Total Fees Paid', chalk.red(`$${result.totalFees.toFixed(2)}`)],
    ['Total Slippage', chalk.red(`$${result.totalSlippage.toFixed(2)}`)]
  );

  console.log(perfTable.toString());

  // Risk Metrics
  console.log(chalk.white('\n📉 Risk Metrics:'));
  const riskTable = new Table({
    head: ['Metric', 'Value'],
    colWidths: [30, 30]
  });

  riskTable.push(
    ['Sharpe Ratio', sharpeColor(result.sharpeRatio.toFixed(2))],
    ['Max Drawdown', chalk.red(`${(result.maxDrawdown * 100).toFixed(2)}%`)],
    ['Avg Profit (wins)', chalk.green(`$${result.avgProfit.toFixed(2)}`)],
    ['Avg Loss (losses)', chalk.red(`$${result.avgLoss.toFixed(2)}`)],
    ['Profit Factor', result.profitFactor.toFixed(2)]
  );

  console.log(riskTable.toString());

  // Insights
  if (result.insights.length > 0) {
    console.log(chalk.white('\n💡 Insights:'));
    result.insights.forEach((insight: string) => {
      if (insight.includes('⚠️')) {
        console.log(chalk.yellow(`   ${insight}`));
      } else if (insight.includes('✅')) {
        console.log(chalk.green(`   ${insight}`));
      } else {
        console.log(chalk.white(`   ${insight}`));
      }
    });
  }

  console.log('');
}

export function createBacktestCommand() {
  return {
    command: 'backtest',
    description: 'Run strategy backtest on historical data',
    options: [
      { flags: '--data-dir <path>', description: 'Data directory', defaultValue: './data' },
      { flags: '--days <n>', description: 'Number of days to backtest' },
      { flags: '--capital <n>', description: 'Initial capital', defaultValue: '10000' },
      { flags: '--max-position <n>', description: 'Max position size', defaultValue: '2000' },
      { flags: '--min-profit <n>', description: 'Min profit %', defaultValue: '2' },
      { flags: '--slippage <model>', description: 'Slippage model: conservative, realistic, optimistic', defaultValue: 'realistic' },
      { flags: '--delay <s>', description: 'Execution delay (seconds)', defaultValue: '5' }
    ],
    action: async (options: any) => {
      await runBacktest({
        dataDir: options.dataDir,
        days: options.days ? parseInt(options.days) : undefined,
        capital: parseFloat(options.capital),
        maxPosition: parseFloat(options.maxPosition),
        minProfit: parseFloat(options.minProfit),
        slippage: options.slippage,
        delay: parseInt(options.delay)
      });
    }
  };
}
