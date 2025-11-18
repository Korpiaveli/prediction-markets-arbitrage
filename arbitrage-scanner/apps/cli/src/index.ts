#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { DEFAULT_FEE_STRUCTURE } from '@arb/core';
import { ArbitrageCalculator } from '@arb/math';
import { MockExchange, KalshiAdapter, PolymarketAdapter } from '@arb/exchanges';
import { Scanner, OpportunityRanker } from '@arb/scanner';
import { JsonStorage } from '@arb/storage';
import path from 'path';

const program = new Command();

program
  .name('arb-scan')
  .description('Cross-exchange arbitrage scanner for prediction markets')
  .version('1.0.0');

// Scan command
program
  .command('scan')
  .description('Scan for arbitrage opportunities')
  .option('-m, --mode <mode>', 'Exchange mode: mock, test, live', 'mock')
  .option('-i, --interval <ms>', 'Scan interval in milliseconds', '5000')
  .option('-o, --once', 'Run single scan and exit')
  .option('--min-profit <percent>', 'Minimum profit percentage', '0.5')
  .option('--data-dir <path>', 'Data directory for storage', './data')
  .action(async (options) => {
    const spinner = ora('Initializing scanner...').start();

    try {
      // Create exchanges based on mode
      const exchanges = await createExchanges(options.mode);

      // Create storage
      const storage = new JsonStorage({
        dataDir: path.resolve(options.dataDir),
        prettyPrint: true
      });
      await storage.connect();

      // Create scanner
      const scanner = new Scanner({
        exchanges,
        calculator: new ArbitrageCalculator(),
        storage,
        scanInterval: parseInt(options.interval)
      });

      // Connect exchanges
      spinner.text = 'Connecting to exchanges...';
      for (const exchange of exchanges) {
        await exchange.connect();
      }

      spinner.succeed('Scanner initialized');

      // Set up event listeners
      scanner.on('opportunity:found', (opp) => {
        console.log(chalk.green(`✓ Found opportunity: ${opp.marketPair.description} - ${opp.profitPercent.toFixed(2)}%`));
      });

      scanner.on('scan:error', ({ pair, error }) => {
        console.error(chalk.red(`✗ Error scanning ${pair.description}: ${error.message}`));
      });

      scanner.on('scan:complete', (opportunities) => {
        displayResults(opportunities, parseFloat(options.minProfit));
      });

      // Start scanning
      if (options.once) {
        console.log(chalk.blue('\n🔍 Running single scan...\n'));
        const opportunities = await scanner.scan();
        displayResults(opportunities, parseFloat(options.minProfit));
        await scanner.destroy();
        process.exit(0);
      } else {
        console.log(chalk.blue(`\n🔍 Starting continuous scanning (interval: ${options.interval}ms)\n`));
        scanner.start();

        // Handle graceful shutdown
        process.on('SIGINT', async () => {
          console.log(chalk.yellow('\n\n Shutting down...'));
          await scanner.destroy();
          process.exit(0);
        });
      }

    } catch (error) {
      spinner.fail('Failed to initialize scanner');
      console.error(chalk.red(error));
      process.exit(1);
    }
  });

// Analyze command
program
  .command('analyze')
  .description('Analyze a specific market pair')
  .argument('<kalshi-id>', 'Kalshi market ID')
  .argument('<poly-id>', 'Polymarket market ID')
  .option('-m, --mode <mode>', 'Exchange mode: mock, test, live', 'mock')
  .action(async (kalshiId, polyId, options) => {
    const spinner = ora('Fetching market data...').start();

    try {
      const exchanges = await createExchanges(options.mode);
      const calculator = new ArbitrageCalculator();

      // Connect exchanges
      for (const exchange of exchanges) {
        await exchange.connect();
      }

      const kalshi = exchanges.find(e => e.name === 'KALSHI');
      const polymarket = exchanges.find(e => e.name === 'POLYMARKET');

      if (!kalshi || !polymarket) {
        throw new Error('Exchange not found');
      }

      // Fetch quotes
      const [kalshiQuote, polyQuote] = await Promise.all([
        kalshi.getQuote(kalshiId),
        polymarket.getQuote(polyId)
      ]);

      spinner.succeed('Market data fetched');

      // Calculate arbitrage
      const results = calculator.calculate(
        { kalshi: kalshiQuote, polymarket: polyQuote, timestamp: new Date() },
        DEFAULT_FEE_STRUCTURE
      );

      // Display analysis
      displayAnalysis(kalshiQuote, polyQuote, results);

    } catch (error) {
      spinner.fail('Analysis failed');
      console.error(chalk.red(error));
      process.exit(1);
    }
  });

// History command
program
  .command('history')
  .description('View historical arbitrage opportunities')
  .option('--data-dir <path>', 'Data directory', './data')
  .option('-l, --limit <n>', 'Number of records to show', '10')
  .action(async (options) => {
    try {
      const storage = new JsonStorage({
        dataDir: path.resolve(options.dataDir)
      });
      await storage.connect();

      const opportunities = await storage.getOpportunities({
        limit: parseInt(options.limit),
        orderBy: 'timestamp',
        order: 'desc'
      });

      if (opportunities.length === 0) {
        console.log(chalk.yellow('No historical opportunities found'));
        return;
      }

      displayResults(opportunities, 0);

    } catch (error) {
      console.error(chalk.red('Failed to load history:'), error);
      process.exit(1);
    }
  });

// Helper functions

async function createExchanges(mode: string) {
  switch (mode) {
    case 'mock':
      // Create two mock exchanges with different names
      const mockKalshi = new MockExchange({ testMode: true });
      const mockPoly = new MockExchange({ testMode: true });
      // Override names for testing
      (mockKalshi as any).name = 'KALSHI';
      (mockPoly as any).name = 'POLYMARKET';
      return [mockKalshi, mockPoly];

    case 'test':
      return [
        new KalshiAdapter({ testMode: true }),
        new PolymarketAdapter({ testMode: true })
      ];

    case 'live':
      // In production, would load API keys from environment
      return [
        new KalshiAdapter(),
        new PolymarketAdapter()
      ];

    default:
      throw new Error(`Invalid mode: ${mode}`);
  }
}

function displayResults(opportunities: any[], minProfit: number) {
  const ranker = new OpportunityRanker();
  const filtered = ranker.filter(opportunities, minProfit);
  const ranked = ranker.rank(filtered);
  const stats = ranker.getStatistics(ranked);

  console.log(chalk.cyan('\n═══════════════════════════════════════════════════════════'));
  console.log(chalk.cyan.bold('                  ARBITRAGE OPPORTUNITIES                  '));
  console.log(chalk.cyan('═══════════════════════════════════════════════════════════'));

  if (ranked.length === 0) {
    console.log(chalk.yellow('\n  No profitable opportunities found\n'));
    return;
  }

  // Statistics
  console.log(chalk.white(`\n  Found: ${stats.count} opportunities`));
  console.log(chalk.white(`  Average profit: ${stats.avgProfit.toFixed(2)}%`));
  console.log(chalk.white(`  Total potential: $${stats.totalPotentialProfit.toFixed(2)}`));
  console.log(chalk.white(`  Average confidence: ${stats.avgConfidence.toFixed(0)}%\n`));

  // Opportunities table
  const table = new Table({
    head: [
      chalk.bold('Market'),
      chalk.bold('Direction'),
      chalk.bold('Profit %'),
      chalk.bold('Max Size'),
      chalk.bold('Cost'),
      chalk.bold('Confidence'),
      chalk.bold('Res.'),
      chalk.bold('Depth')
    ],
    colWidths: [25, 15, 10, 10, 10, 12, 8, 10]
  });

  for (const opp of ranked.slice(0, 10)) {
    const profitColor = opp.profitPercent >= 2 ? chalk.green :
                       opp.profitPercent >= 1 ? chalk.yellow :
                       chalk.white;

    // Resolution score color
    const resScore = opp.resolutionAlignment?.score ?? 100;
    const resColor = resScore >= 85 ? chalk.green :
                     resScore >= 70 ? chalk.yellow :
                     resScore >= 50 ? chalk.red :
                     chalk.red.bold;

    table.push([
      opp.marketPair.description.substring(0, 23),
      opp.direction === 'KALSHI_YES_POLY_NO' ? 'K:Y P:N' : 'K:N P:Y',
      profitColor(`${opp.profitPercent.toFixed(2)}%`),
      opp.maxSize.toString(),
      `$${opp.totalCost.toFixed(3)}`,
      `${opp.confidence}%`,
      resColor(resScore.toString()),
      opp.liquidity.depthQuality
    ]);
  }

  console.log(table.toString());

  // Display resolution warnings if any
  for (const opp of ranked.slice(0, 10)) {
    if (opp.resolutionAlignment && (opp.resolutionAlignment.warnings.length > 0 || opp.resolutionAlignment.risks.length > 0)) {
      console.log(chalk.yellow(`\n⚠️  ${opp.marketPair.description}:`));

      if (opp.resolutionAlignment.risks.length > 0) {
        console.log(chalk.red('  Risks:'));
        opp.resolutionAlignment.risks.forEach((risk: string) => {
          console.log(chalk.red(`    • ${risk}`));
        });
      }

      if (opp.resolutionAlignment.warnings.length > 0) {
        console.log(chalk.yellow('  Warnings:'));
        opp.resolutionAlignment.warnings.forEach((warning: string) => {
          console.log(chalk.yellow(`    • ${warning}`));
        });
      }
    }
  }

  console.log('');
}

function displayAnalysis(kalshiQuote: any, polyQuote: any, results: any[]) {
  console.log(chalk.cyan('\n═══════════════════════════════════════════════════════════'));
  console.log(chalk.cyan.bold('                    MARKET ANALYSIS                        '));
  console.log(chalk.cyan('═══════════════════════════════════════════════════════════'));

  // Price data
  console.log(chalk.white('\n📊 Price Data:'));
  console.log(`  Kalshi YES: ${kalshiQuote.yes.bid.toFixed(3)} / ${kalshiQuote.yes.ask.toFixed(3)}`);
  console.log(`  Kalshi NO:  ${kalshiQuote.no.bid.toFixed(3)} / ${kalshiQuote.no.ask.toFixed(3)}`);
  console.log(`  Poly YES:   ${polyQuote.yes.bid.toFixed(3)} / ${polyQuote.yes.ask.toFixed(3)}`);
  console.log(`  Poly NO:    ${polyQuote.no.bid.toFixed(3)} / ${polyQuote.no.ask.toFixed(3)}`);

  // Arbitrage results
  console.log(chalk.white('\n💰 Arbitrage Analysis:'));
  for (const result of results) {
    const profitable = result.valid && result.profitPercent > 0;
    const icon = profitable ? '✅' : '❌';
    const color = profitable ? chalk.green : chalk.red;

    console.log(`  ${icon} ${result.direction}:`);
    console.log(color(`     Profit: ${result.profitPercent.toFixed(3)}%`));
    console.log(`     Total cost: $${result.totalCost.toFixed(4)}`);
    console.log(`     Fees: $${result.fees.totalFees.toFixed(4)}`);
  }

  console.log('');
}

// Parse and run
program.parse();