import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { PatternAnalyzer } from '@arb/ml';
import { JsonStorage } from '@arb/storage';
import path from 'path';

export interface PatternsOptions {
  dataDir: string;
  days?: number;
  save?: string;
}

export async function analyzePatterns(options: PatternsOptions) {
  const spinner = ora('Loading historical data...').start();

  try {
    const storage = new JsonStorage({
      dataDir: path.resolve(options.dataDir)
    });
    await storage.connect();

    const opportunities = await storage.getOpportunities({
      limit: 10000,
      orderBy: 'timestamp',
      order: 'asc'
    });

    if (opportunities.length === 0) {
      spinner.fail('No historical data found');
      console.log(chalk.yellow('\n💡 Run some scans first to collect data for analysis'));
      return;
    }

    spinner.text = 'Analyzing patterns...';

    const analyzer = new PatternAnalyzer();
    const analysis = analyzer.analyze(opportunities);

    spinner.succeed('Pattern analysis complete');

    displayPatternAnalysis(analysis, analyzer);

    // Save if requested
    if (options.save) {
      const fs = require('fs');
      const savePath = path.resolve(options.save);
      fs.writeFileSync(savePath, JSON.stringify(analysis, null, 2));
      console.log(chalk.green(`\n💾 Analysis saved to: ${savePath}`));
    }

  } catch (error) {
    spinner.fail('Pattern analysis failed');
    console.error(chalk.red(error));
    throw error;
  }
}

function displayPatternAnalysis(analysis: any, analyzer: PatternAnalyzer) {
  console.log(chalk.cyan('\n╔═══════════════════════════════════════════════════════════╗'));
  console.log(chalk.cyan('║              HISTORICAL PATTERN ANALYSIS                  ║'));
  console.log(chalk.cyan('╚═══════════════════════════════════════════════════════════╝'));

  // Overview
  console.log(chalk.white('\n📊 Dataset Overview:'));
  console.log(`   Total Opportunities: ${analysis.totalOpportunities}`);
  console.log(`   Period: ${analysis.dateRange.start.toLocaleDateString()} - ${analysis.dateRange.end.toLocaleDateString()}`);

  // Best scan times
  const bestTimes = analyzer.findBestScanTimes(analysis);
  console.log(chalk.white('\n⏰ Best Times to Scan:'));
  const timeTable = new Table({
    head: ['Hour', 'Avg Opportunities', 'Avg Profit %', 'Score'],
    colWidths: [10, 20, 15, 15]
  });

  bestTimes.slice(0, 5).forEach((time: any) => {
    const stats = analysis.temporal.hourOfDay.get(time.hour);
    timeTable.push([
      `${time.hour}:00`,
      stats.count,
      stats.avgProfit.toFixed(2) + '%',
      time.score.toFixed(1)
    ]);
  });

  console.log(timeTable.toString());

  // Category analysis
  console.log(chalk.white('\n📈 Top Categories:'));
  const catTable = new Table({
    head: ['Category', 'Count', 'Avg Profit %', 'Success Rate'],
    colWidths: [20, 10, 15, 15]
  });

  analysis.categories.slice(0, 10).forEach((cat: any) => {
    catTable.push([
      cat.category,
      cat.count,
      cat.avgProfit.toFixed(2) + '%',
      (cat.successRate * 100).toFixed(1) + '%'
    ]);
  });

  console.log(catTable.toString());

  // Profit distribution
  console.log(chalk.white('\n💰 Profit Distribution:'));
  const distTable = new Table({
    head: ['Percentile', 'Profit %'],
    colWidths: [15, 15]
  });

  const p = analysis.profitDistribution.percentiles;
  distTable.push(
    ['P25 (25th)', p.p25.toFixed(2) + '%'],
    ['P50 (Median)', chalk.bold(p.p50.toFixed(2) + '%')],
    ['P75 (75th)', p.p75.toFixed(2) + '%'],
    ['P90 (90th)', chalk.green(p.p90.toFixed(2) + '%')],
    ['P95 (95th)', chalk.green(p.p95.toFixed(2) + '%')],
    ['P99 (99th)', chalk.green.bold(p.p99.toFixed(2) + '%')]
  );

  console.log(distTable.toString());

  // Duration patterns
  console.log(chalk.white('\n⏱️  Duration Patterns:'));
  console.log(`   Average Duration: ${analysis.duration.avgDurationMinutes.toFixed(1)} minutes`);
  console.log(`   Median Duration: ${analysis.duration.medianDurationMinutes.toFixed(1)} minutes`);
  if (analysis.duration.halfLife > 0) {
    console.log(`   Half-Life: ${analysis.duration.halfLife.toFixed(1)} minutes`);
  }

  // Insights
  console.log(chalk.white('\n💡 Key Insights:'));
  analysis.insights.forEach((insight: string) => {
    if (insight.includes('⚠️')) {
      console.log(chalk.yellow(`   ${insight}`));
    } else if (insight.includes('📊')) {
      console.log(chalk.blue(`   ${insight}`));
    } else {
      console.log(chalk.white(`   ${insight}`));
    }
  });

  console.log('');
}

export function createPatternsCommand() {
  return {
    command: 'patterns',
    description: 'Analyze historical patterns in arbitrage data',
    options: [
      { flags: '--data-dir <path>', description: 'Data directory', defaultValue: './data' },
      { flags: '--days <n>', description: 'Number of days to analyze' },
      { flags: '--save <file>', description: 'Save analysis to JSON file' }
    ],
    action: async (options: any) => {
      await analyzePatterns(options);
    }
  };
}
