#!/usr/bin/env tsx
/**
 * Phase 3 Intelligence Layer Demo
 *
 * Demonstrates all Phase 3 features:
 * 1. Historical Pattern Analysis
 * 2. Liquidity Depth Analysis
 * 3. Backtesting Engine
 * 4. Market Correlation Detection
 */

import { ArbitrageOpportunity, Market, Quote } from '@arb/core';
import {
  PatternAnalyzer,
  LiquidityAnalyzer,
  BacktestEngine,
  CorrelationDetector,
  BacktestConfig,
  PriceHistory
} from '@arb/ml';

console.log('='.repeat(70));
console.log('Phase 3 Intelligence Layer Demo');
console.log('='.repeat(70));
console.log();

// 1. HISTORICAL PATTERN ANALYSIS
console.log('1. HISTORICAL PATTERN ANALYSIS');
console.log('-'.repeat(70));

async function demoPatternAnalysis() {
  // Load historical opportunities
  const opportunities = generateMockOpportunities(100);

  const patternAnalyzer = new PatternAnalyzer();
  const analysis = patternAnalyzer.analyze(opportunities);

  console.log(`📊 Analyzed ${analysis.totalOpportunities} opportunities`);
  console.log(`📅 Period: ${analysis.dateRange.start.toLocaleDateString()} - ${analysis.dateRange.end.toLocaleDateString()}`);
  console.log();

  console.log('Temporal Patterns:');
  console.log(`  Best hour: ${findBestHour(analysis.temporal.hourOfDay)}`);
  console.log(`  Best day: ${findBestDay(analysis.temporal.dayOfWeek)}`);
  console.log();

  console.log('Top Categories:');
  analysis.categories.slice(0, 3).forEach((cat, i) => {
    console.log(`  ${i + 1}. ${cat.category}`);
    console.log(`     Count: ${cat.count}, Avg Profit: ${cat.avgProfit.toFixed(2)}%`);
  });
  console.log();

  console.log('Profit Distribution:');
  console.log(`  P50 (Median): ${analysis.profitDistribution.percentiles.p50.toFixed(2)}%`);
  console.log(`  P90: ${analysis.profitDistribution.percentiles.p90.toFixed(2)}%`);
  console.log(`  P99: ${analysis.profitDistribution.percentiles.p99.toFixed(2)}%`);
  console.log();

  console.log('Key Insights:');
  analysis.insights.forEach(insight => console.log(`  • ${insight}`));
  console.log();

  // Find best scan times
  const bestTimes = patternAnalyzer.findBestScanTimes(analysis);
  console.log('🎯 Best Times to Scan:');
  bestTimes.slice(0, 3).forEach((time, i) => {
    console.log(`  ${i + 1}. ${time.hour}:00 (score: ${time.score.toFixed(2)})`);
  });
  console.log();
}

// 2. LIQUIDITY DEPTH ANALYSIS
console.log('2. LIQUIDITY DEPTH ANALYSIS');
console.log('-'.repeat(70));

async function demoLiquidityAnalysis() {
  const liquidityAnalyzer = new LiquidityAnalyzer();

  // Create sample quote
  const quote: Quote = {
    marketId: 'KALSHI-EXAMPLE',
    exchange: 'KALSHI',
    timestamp: new Date(),
    lastUpdate: new Date(),
    yes: {
      bid: 0.48,
      ask: 0.52,
      mid: 0.50,
      liquidity: 5000
    },
    no: {
      bid: 0.48,
      ask: 0.52,
      mid: 0.50,
      liquidity: 5000
    }
  };

  const analysis = liquidityAnalyzer.analyze(quote);

  console.log(`📈 Market: ${analysis.marketId}`);
  console.log(`💰 Depth Score: ${analysis.depthScore.toFixed(1)}/100`);
  console.log(`✅ Quality: ${analysis.quality}`);
  console.log(`📊 Optimal Size: $${analysis.optimalSize.toFixed(2)}`);
  console.log();

  console.log('Price Impact Estimates:');
  console.log(`  $100 order: ${(analysis.priceImpact.small * 100).toFixed(2)}%`);
  console.log(`  $1000 order: ${(analysis.priceImpact.medium * 100).toFixed(2)}%`);
  console.log(`  $10000 order: ${(analysis.priceImpact.large * 100).toFixed(2)}%`);
  console.log();

  // Test execution feasibility
  const execution = liquidityAnalyzer.assessExecution(analysis, 2000, 'yes');
  console.log('Execution Assessment ($2000 order):');
  console.log(`  Can Execute: ${execution.canExecute}`);
  console.log(`  Max Size: $${execution.maxSize.toFixed(2)}`);
  console.log(`  Est. Slippage: ${(execution.estimatedSlippage * 100).toFixed(3)}%`);
  console.log(`  Recommendation: ${execution.recommendation}`);
  if (execution.warnings.length > 0) {
    console.log('  Warnings:');
    execution.warnings.forEach(w => console.log(`    ⚠️ ${w}`));
  }
  console.log();
}

// 3. BACKTESTING ENGINE
console.log('3. BACKTESTING ENGINE');
console.log('-'.repeat(70));

async function demoBacktesting() {
  const backtester = new BacktestEngine();
  const opportunities = generateMockOpportunities(50);

  const config: BacktestConfig = {
    startDate: new Date('2024-01-01'),
    endDate: new Date('2024-12-31'),
    initialCapital: 10000,
    maxPositionSize: 2000,
    minProfitPercent: 3,
    slippageModel: 'realistic',
    executionDelay: 5
  };

  console.log('Running backtest...');
  const result = backtester.run(opportunities, config);

  console.log();
  console.log('📊 Backtest Results:');
  console.log(`  Total Trades: ${result.totalTrades}`);
  console.log(`  Executed: ${result.executedTrades}`);
  console.log(`  Skipped: ${result.skippedTrades}`);
  console.log();

  console.log('📈 Performance:');
  console.log(`  Win Rate: ${(result.winRate * 100).toFixed(1)}%`);
  console.log(`  Total Return: ${result.returnPercent.toFixed(2)}%`);
  console.log(`  Sharpe Ratio: ${result.sharpeRatio.toFixed(2)}`);
  console.log(`  Max Drawdown: ${(result.maxDrawdown * 100).toFixed(2)}%`);
  console.log();

  console.log('💰 Financial:');
  console.log(`  Initial Capital: $${config.initialCapital.toFixed(2)}`);
  console.log(`  Final Capital: $${result.finalCapital.toFixed(2)}`);
  console.log(`  Total Profit: $${result.totalProfit.toFixed(2)}`);
  console.log(`  Total Fees: $${result.totalFees.toFixed(2)}`);
  console.log(`  Total Slippage: $${result.totalSlippage.toFixed(2)}`);
  console.log();

  console.log('Key Insights:');
  result.insights.forEach(insight => console.log(`  ${insight}`));
  console.log();
}

// 4. MARKET CORRELATION DETECTION
console.log('4. MARKET CORRELATION DETECTION');
console.log('-'.repeat(70));

async function demoCorrelation() {
  const detector = new CorrelationDetector();

  // Create sample markets
  const markets = generateMockMarkets(5);
  const priceHistories = generateMockPriceHistories(markets);

  console.log(`🔍 Analyzing ${markets.length} markets...`);
  console.log();

  const correlations = detector.findCorrelations(markets, priceHistories, 60);

  console.log(`Found ${correlations.length} significant correlations:`);
  console.log();

  correlations.slice(0, 5).forEach((corr, i) => {
    console.log(`${i + 1}. ${corr.market1.title.substring(0, 40)}`);
    console.log(`   ↔ ${corr.market2.title.substring(0, 40)}`);
    console.log(`   Correlation: ${(corr.correlation * 100).toFixed(1)}%`);
    console.log(`   Strength: ${corr.strength}, Relationship: ${corr.relationship}`);
    console.log(`   Confidence: ${corr.confidence.toFixed(0)}%`);
    console.log();
  });

  // Find clusters
  const clusters = detector.clusterMarkets(correlations, 2);
  console.log(`📊 Found ${clusters.length} market clusters:`);
  clusters.forEach((cluster, i) => {
    console.log(`  ${i + 1}. ${cluster.theme} (${cluster.markets.length} markets)`);
    console.log(`     Avg Correlation: ${(cluster.avgCorrelation * 100).toFixed(1)}%`);
    cluster.opportunities.forEach(opp => console.log(`     💡 ${opp}`));
  });
  console.log();
}

// Helper functions
function generateMockOpportunities(count: number): ArbitrageOpportunity[] {
  const opportunities: ArbitrageOpportunity[] = [];
  const baseDate = new Date('2024-01-01');

  for (let i = 0; i < count; i++) {
    const timestamp = new Date(baseDate.getTime() + i * 86400000 * 3); // Every 3 days

    opportunities.push({
      id: `opp-${i}`,
      timestamp,
      marketPair: {
        id: `pair-${i}`,
        description: 'Test market pair',
        kalshiMarket: {
          id: `kalshi-${i}`,
          exchangeId: `kalshi-${i}`,
          exchange: 'KALSHI',
          title: 'Test Market',
          description: 'Test',
          active: true,
          metadata: { category: i % 3 === 0 ? 'politics' : i % 3 === 1 ? 'sports' : 'economics' }
        },
        polymarketMarket: {
          id: `poly-${i}`,
          exchangeId: `poly-${i}`,
          exchange: 'POLYMARKET',
          title: 'Test Market',
          description: 'Test',
          active: true
        },
        kalshiId: `kalshi-${i}`,
        polymarketId: `poly-${i}`
      },
      quotePair: {
        kalshi: {
          marketId: `kalshi-${i}`,
          exchange: 'KALSHI',
          timestamp,
          lastUpdate: timestamp,
          yes: { bid: 0.45, ask: 0.48, mid: 0.465, liquidity: 5000 },
          no: { bid: 0.52, ask: 0.55, mid: 0.535, liquidity: 5000 }
        },
        polymarket: {
          marketId: `poly-${i}`,
          exchange: 'POLYMARKET',
          timestamp,
          lastUpdate: timestamp,
          yes: { bid: 0.50, ask: 0.53, mid: 0.515, liquidity: 5000 },
          no: { bid: 0.47, ask: 0.50, mid: 0.485, liquidity: 5000 }
        },
        timestamp
      },
      direction: 'KALSHI_YES_POLY_NO',
      profitPercent: 2 + Math.random() * 8,
      profitDollars: 50 + Math.random() * 200,
      totalCost: 1000,
      maxSize: 2000,
      confidence: 70 + Math.random() * 25,
      ttl: 300 + Math.random() * 1800,
      fees: {
        kalshiFee: 5,
        polymarketFee: 3,
        totalFees: 8,
        feePercent: 0.8
      },
      liquidity: {
        kalshiAvailable: 5000,
        polymarketAvailable: 5000,
        maxExecutable: 5000,
        depthQuality: 'DEEP'
      },
      valid: Math.random() > 0.2
    });
  }

  return opportunities;
}

function generateMockMarkets(count: number): Market[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `market-${i}`,
    exchangeId: `market-${i}`,
    exchange: 'KALSHI' as const,
    title: `Market ${i}: Test Event`,
    description: 'Test market',
    active: true,
    metadata: { category: i % 2 === 0 ? 'politics' : 'economics' }
  }));
}

function generateMockPriceHistories(markets: Market[]): Map<string, PriceHistory[]> {
  const histories = new Map<string, PriceHistory[]>();

  markets.forEach(market => {
    const history: PriceHistory[] = [];
    let price = 0.5;

    for (let i = 0; i < 50; i++) {
      price += (Math.random() - 0.5) * 0.05;
      price = Math.max(0.1, Math.min(0.9, price));

      history.push({
        marketId: market.id,
        timestamp: new Date(Date.now() - (50 - i) * 3600000),
        price
      });
    }

    histories.set(market.id, history);
  });

  return histories;
}

function findBestHour(hourMap: Map<number, any>): string {
  let bestHour = 0;
  let bestScore = 0;

  for (const [hour, stats] of hourMap.entries()) {
    const score = stats.count * stats.avgProfit;
    if (score > bestScore) {
      bestScore = score;
      bestHour = hour;
    }
  }

  return `${bestHour}:00`;
}

function findBestDay(dayMap: Map<number, any>): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  let bestDay = 0;
  let bestScore = 0;

  for (const [day, stats] of dayMap.entries()) {
    const score = stats.count * stats.avgProfit;
    if (score > bestScore) {
      bestScore = score;
      bestDay = day;
    }
  }

  return days[bestDay];
}

// Run all demos
async function main() {
  await demoPatternAnalysis();
  console.log('\n');
  await demoLiquidityAnalysis();
  console.log('\n');
  await demoBacktesting();
  console.log('\n');
  await demoCorrelation();

  console.log('='.repeat(70));
  console.log('✅ Phase 3 Intelligence Layer Demo Complete');
  console.log('='.repeat(70));
}

main().catch(console.error);
