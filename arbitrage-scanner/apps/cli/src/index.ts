#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { DEFAULT_FEE_STRUCTURE, MarketCategory } from '@arb/core';
import { ArbitrageCalculator } from '@arb/math';
import { MockExchange } from '@arb/exchanges';
import { Scanner, OpportunityRanker } from '@arb/scanner';
import { JsonStorage } from '@arb/storage';
import path from 'path';
import { ConfigManager } from './config';
import { createBacktestCommand } from './commands/backtest';
import { createPatternsCommand } from './commands/patterns';
import { createFetchHistoricalCommand } from './commands/fetch-historical';
import { createFetchHistoricalPairsCommand } from './commands/fetch-historical-pairs';
import { createBacktestHistoricalCommand } from './commands/backtest-historical';
import { createRecommendCommand } from './commands/recommend';
import { createBacktestRealCommand } from './commands/backtest-real';
import { createCollectHistoricalCommand } from './commands/collect-historical';
import { createExchanges as createExchangesFromFactory, parseExchangeList, getAvailableExchanges } from './utils/exchanges';

const program = new Command();
const configManager = new ConfigManager();

program
  .name('arb-scan')
  .description('Cross-exchange arbitrage scanner for prediction markets')
  .version('1.1.0');

// Scan command
program
  .command('scan')
  .description('Scan for arbitrage opportunities')
  .option('-m, --mode <mode>', 'Exchange mode: mock, test, live', 'live')
  .option('-i, --interval <ms>', 'Scan interval in milliseconds', '5000')
  .option('-o, --once', 'Run single scan and exit')
  .option('--min-profit <percent>', 'Minimum profit percentage', '0.5')
  .option('--min-resolution-score <score>', 'Minimum resolution score (0-100)', '65')
  .option('--data-dir <path>', 'Data directory for storage', './data')
  .option('--collect-resolution-data', 'Collect resolution analysis data (disables filtering)')
  .option('--exchanges <list>', `Comma-separated list: ${getAvailableExchanges().join(', ')}`, 'kalshi,polymarket')
  .option('--all-exchanges', 'Include all available exchanges', false)
  .action(async (options) => {
    const spinner = ora('Initializing scanner...').start();

    try {
      // Create exchanges based on mode and exchange selection
      const exchanges = await createExchanges(options.mode, options.exchanges, options.allExchanges);

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
        scanInterval: parseInt(options.interval),
        disableResolutionFiltering: options.collectResolutionData,
        minResolutionScore: parseInt(options.minResolutionScore)
      });

      // Notify if in data collection mode
      if (options.collectResolutionData) {
        console.log(chalk.yellow('\n⚠️  Data Collection Mode: Resolution filtering disabled'));
        console.log(chalk.yellow('   All opportunities will be shown regardless of resolution risk\n'));
      }

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

        // Save resolution data if in collection mode
        if (options.collectResolutionData && opportunities.length > 0) {
          saveResolutionData(opportunities, options.dataDir);
        }
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

// List markets command
program
  .command('list-markets')
  .description('List available markets from exchanges')
  .option('-e, --exchange <name>', 'Exchange name: kalshi, polymarket, both', 'both')
  .option('-l, --limit <n>', 'Number of markets to show', '20')
  .action(async (options) => {
    const spinner = ora('Fetching markets...').start();

    try {
      const exchanges = await createExchanges('live');
      const results: any[] = [];

      for (const exchange of exchanges) {
        if (options.exchange !== 'both' && exchange.name.toLowerCase() !== options.exchange.toLowerCase()) {
          continue;
        }

        await exchange.connect();
        const markets = await exchange.getMarkets();
        const limited = markets.slice(0, parseInt(options.limit));

        results.push({
          exchange: exchange.name,
          count: markets.length,
          markets: limited
        });

        await exchange.disconnect();
      }

      spinner.succeed('Markets fetched');

      for (const result of results) {
        console.log(chalk.cyan(`\n${'='.repeat(60)}`));
        console.log(chalk.cyan.bold(`  ${result.exchange} - ${result.count} markets found`));
        console.log(chalk.cyan(`${'='.repeat(60)}\n`));

        const table = new Table({
          head: [chalk.bold('ID'), chalk.bold('Title'), chalk.bold('Volume')],
          colWidths: [30, 50, 15]
        });

        for (const market of result.markets) {
          table.push([
            market.id.substring(0, 28),
            market.title.substring(0, 48),
            market.volume24h ? `$${market.volume24h.toFixed(0)}` : 'N/A'
          ]);
        }

        console.log(table.toString());
      }

      console.log('');
    } catch (error) {
      spinner.fail('Failed to fetch markets');
      console.error(chalk.red(error));
      process.exit(1);
    }
  });

// Match markets command
program
  .command('match-markets')
  .description('Find matching market pairs using intelligent matching')
  .option('--min-confidence <n>', 'Minimum confidence score', '40')
  .option('--include-low', 'Include low confidence matches', false)
  .option('--include-uncertain', 'Include uncertain matches', false)
  .option('--save <file>', 'Save results to JSON file')
  .option('--exchanges <list>', `Comma-separated list: ${getAvailableExchanges().join(', ')}`, 'kalshi,polymarket')
  .option('--all-exchanges', 'Include all available exchanges', false)
  .option('--categories <list>', 'Comma-separated allowed categories: politics,sports,crypto,economy,technology,entertainment,science,other')
  .option('--exclude-categories <list>', 'Comma-separated excluded categories')
  .option('--max-markets <n>', 'Limit markets per exchange (for testing)', '0')
  .action(async (options) => {
    const spinner = ora('Finding market pairs...').start();

    try {
      // Parse exchange selection
      const exchangeOptions = options.allExchanges
        ? { includeKalshi: true, includePolymarket: true, includePredictIt: true }
        : parseExchangeList(options.exchanges);

      const exchanges = createExchangesFromFactory({
        ...exchangeOptions,
        filterSports: false
      });

      if (exchanges.length < 2) {
        throw new Error('Need at least 2 exchanges for matching. Use --exchanges or --all-exchanges');
      }

      spinner.text = `Connecting to ${exchanges.length} exchanges...`;
      await Promise.all(exchanges.map(e => e.connect()));

      const { MarketMatcher } = await import('@arb/scanner');
      const allPairs = [];

      // Parse category filters
      const allowedCategories = options.categories
        ? options.categories.split(',').map((c: string) => c.trim() as MarketCategory)
        : undefined;
      const excludedCategories = options.excludeCategories
        ? options.excludeCategories.split(',').map((c: string) => c.trim() as MarketCategory)
        : undefined;

      // Match all exchange pairs
      for (let i = 0; i < exchanges.length; i++) {
        for (let j = i + 1; j < exchanges.length; j++) {
          const exchange1 = exchanges[i];
          const exchange2 = exchanges[j];

          spinner.text = `Matching ${exchange1.name} ⟷ ${exchange2.name}...`;

          const maxMarkets = parseInt(options.maxMarkets);
          const matcher = new MarketMatcher({
            minConfidence: parseFloat(options.minConfidence),
            includeLowConfidence: options.includeLow,
            includeUncertain: options.includeUncertain,
            allowedCategories,
            excludedCategories,
            maxMarketsPerExchange: maxMarkets > 0 ? maxMarkets : undefined
          });

          const pairs = await matcher.matchCrossExchangeMarkets(exchange1, exchange2);
          allPairs.push(...pairs);
        }
      }

      await Promise.all(exchanges.map(e => e.disconnect()));

      spinner.succeed(`Found ${allPairs.length} market pairs across ${exchanges.length} exchanges`);

      // Save if requested
      if (options.save) {
        const fs = require('fs');
        const savePath = path.resolve(options.save);
        fs.writeFileSync(savePath, JSON.stringify(allPairs, null, 2));
        console.log(chalk.green(`\n💾 Saved to: ${savePath}`));
      }

      // Display summary by exchange pair
      console.log(chalk.cyan('\n📊 Match Summary:\n'));
      const byExchange: { [key: string]: any[] } = {};
      allPairs.forEach(p => {
        const key = (p as any).exchangePair || 'unknown';
        if (!byExchange[key]) byExchange[key] = [];
        byExchange[key].push(p);
      });

      Object.entries(byExchange).forEach(([exchangePair, pairs]) => {
        const byLevel = {
          high: pairs.filter(p => (p.correlationScore ?? 0) >= 0.8),
          medium: pairs.filter(p => (p.correlationScore ?? 0) >= 0.6 && (p.correlationScore ?? 0) < 0.8),
          low: pairs.filter(p => (p.correlationScore ?? 0) >= 0.4 && (p.correlationScore ?? 0) < 0.6),
          uncertain: pairs.filter(p => (p.correlationScore ?? 0) < 0.4)
        };

        console.log(chalk.bold(`\n${exchangePair}:`));
        console.log(`  ${chalk.green('High confidence (80+):')}     ${byLevel.high.length} pairs`);
        console.log(`  ${chalk.yellow('Medium confidence (60-79):')} ${byLevel.medium.length} pairs`);
        console.log(`  ${chalk.blue('Low confidence (40-59):')}    ${byLevel.low.length} pairs`);
        console.log(`  ${chalk.gray('Uncertain (<40):')}          ${byLevel.uncertain.length} pairs`);

        // Show top matches for this exchange pair
        if (byLevel.high.length > 0) {
          console.log(chalk.green('\n  Top Matches:'));
          byLevel.high.slice(0, 5).forEach(pair => {
            const score = ((pair.correlationScore ?? 0) * 100).toFixed(0);
            console.log(`    ${chalk.bold(pair.description)}`);
            console.log(`      → ${pair.polymarketMarket?.title || pair.kalshiMarket?.title}`);
            console.log(`      Confidence: ${chalk.green(score + '%')}`);
          });
        }
      });

      console.log('');
    } catch (error) {
      spinner.fail('Failed to match markets');
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

async function createExchanges(mode: string, exchangeList?: string, allExchanges?: boolean) {
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
      const testExchangeOptions = allExchanges
        ? { includeKalshi: true, includePolymarket: true, includePredictIt: true }
        : parseExchangeList(exchangeList || 'kalshi,polymarket');

      return createExchangesFromFactory({
        ...testExchangeOptions,
        filterSports: false,
        testMode: true
      });

    case 'live':
      const liveExchangeOptions = allExchanges
        ? { includeKalshi: true, includePolymarket: true, includePredictIt: true }
        : parseExchangeList(exchangeList || 'kalshi,polymarket');

      return createExchangesFromFactory({
        ...liveExchangeOptions,
        filterSports: false,
        testMode: false
      });

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

function saveResolutionData(opportunities: any[], dataDir: string) {
  const fs = require('fs');
  const resolutionData = opportunities.map(opp => ({
    market: opp.marketPair.description,
    kalshiMarket: {
      id: opp.marketPair.kalshiMarket.id,
      title: opp.marketPair.kalshiMarket.title,
      description: opp.marketPair.kalshiMarket.description,
      metadata: opp.marketPair.kalshiMarket.metadata
    },
    polymarketMarket: {
      id: opp.marketPair.polymarketMarket.id,
      title: opp.marketPair.polymarketMarket.title,
      description: opp.marketPair.polymarketMarket.description,
      metadata: opp.marketPair.polymarketMarket.metadata
    },
    resolutionAlignment: opp.resolutionAlignment,
    profitPercent: opp.profitPercent,
    timestamp: opp.timestamp
  }));

  const filename = path.join(dataDir, `resolution-data-${Date.now()}.json`);
  fs.writeFileSync(filename, JSON.stringify(resolutionData, null, 2));
  console.log(chalk.green(`\n💾 Resolution data saved to: ${filename}`));
}

// Config command
program
  .command('config')
  .description('Display current configuration')
  .option('--path <path>', 'Path to config file')
  .action((options) => {
    try {
      const manager = options.path ? new ConfigManager(options.path) : configManager;
      manager.display();
    } catch (error) {
      console.error(chalk.red('Failed to load configuration:'), error);
      process.exit(1);
    }
  });

// Backtest command
const backtestCmd = createBacktestCommand();
program
  .command(backtestCmd.command)
  .description(backtestCmd.description);
backtestCmd.options.forEach((opt: any) => {
  program.commands[program.commands.length - 1].option(opt.flags, opt.description, opt.defaultValue);
});
program.commands[program.commands.length - 1].action(backtestCmd.action);

// Patterns command
const patternsCmd = createPatternsCommand();
program
  .command(patternsCmd.command)
  .description(patternsCmd.description);
patternsCmd.options.forEach((opt: any) => {
  program.commands[program.commands.length - 1].option(opt.flags, opt.description, opt.defaultValue);
});
program.commands[program.commands.length - 1].action(patternsCmd.action);

// Fetch Historical command
const fetchHistCmd = createFetchHistoricalCommand();
program
  .command(fetchHistCmd.command)
  .description(fetchHistCmd.description);
fetchHistCmd.options.forEach((opt: any) => {
  program.commands[program.commands.length - 1].option(opt.flags, opt.description, opt.defaultValue);
});
program.commands[program.commands.length - 1].action(fetchHistCmd.action);

// Fetch Historical Pairs command
const fetchHistPairsCmd = createFetchHistoricalPairsCommand();
program
  .command(fetchHistPairsCmd.command)
  .description(fetchHistPairsCmd.description);
fetchHistPairsCmd.options.forEach((opt: any) => {
  program.commands[program.commands.length - 1].option(opt.flags, opt.description, opt.defaultValue);
});
program.commands[program.commands.length - 1].action(fetchHistPairsCmd.action);

// Backtest Historical command
const backtestHistCmd = createBacktestHistoricalCommand();
program
  .command(backtestHistCmd.command)
  .description(backtestHistCmd.description);
backtestHistCmd.options.forEach((opt: any) => {
  program.commands[program.commands.length - 1].option(opt.flags, opt.description, opt.defaultValue);
});
program.commands[program.commands.length - 1].action(backtestHistCmd.action);

// Recommend command
const recommendCmd = createRecommendCommand();
program
  .command(recommendCmd.command)
  .description(recommendCmd.description);
recommendCmd.options.forEach((opt: any) => {
  program.commands[program.commands.length - 1].option(opt.flags, opt.description, opt.defaultValue);
});
program.commands[program.commands.length - 1].action(recommendCmd.action);

// Backtest Real Data command
const backtestRealCmd = createBacktestRealCommand();
program
  .command(backtestRealCmd.command)
  .description(backtestRealCmd.description);
backtestRealCmd.options.forEach((opt: any) => {
  program.commands[program.commands.length - 1].option(opt.flags, opt.description, opt.defaultValue);
});
program.commands[program.commands.length - 1].action(backtestRealCmd.action);

// Collect Historical Data command
const collectHistCmd = createCollectHistoricalCommand();
program
  .command(collectHistCmd.command)
  .description(collectHistCmd.description);
collectHistCmd.options.forEach((opt: any) => {
  program.commands[program.commands.length - 1].option(opt.flags, opt.description, opt.defaultValue);
});
program.commands[program.commands.length - 1].action(collectHistCmd.action);

// Error handling
process.on('unhandledRejection', (reason) => {
  console.error(chalk.red('\n✗ Unhandled error:'), reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error(chalk.red('\n✗ Fatal error:'), error);
  process.exit(1);
});

// Parse and run
program.parse();