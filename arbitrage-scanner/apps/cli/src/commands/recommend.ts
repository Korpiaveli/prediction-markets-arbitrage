import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { RecommendationEngine, Recommendation, RecommendationReport } from '@arb/ml';
import { JsonStorage } from '@arb/storage';
import path from 'path';
import fs from 'fs';

export interface RecommendOptions {
  dataDir: string;
  top?: number;
  minScore?: number;
  minProfit?: number;
  maxHours?: number;
  categories?: string;
  riskLevels?: string;
  output?: string;
  json?: boolean;
  verbose?: boolean;
}

export async function generateRecommendations(options: RecommendOptions) {
  const spinner = ora('Loading opportunities...').start();

  try {
    const storage = new JsonStorage({
      dataDir: path.resolve(options.dataDir)
    });
    await storage.connect();

    const opportunities = await storage.getOpportunities({
      limit: 10000,
      orderBy: 'timestamp',
      order: 'desc'
    });

    if (opportunities.length === 0) {
      spinner.fail('No opportunities found');
      console.log(chalk.yellow('\n💡 Run some scans first to collect data'));
      return;
    }

    spinner.text = `Analyzing ${opportunities.length} opportunities...`;

    const engine = new RecommendationEngine({
      topN: options.top || 10,
      filters: {
        minScore: options.minScore,
        minProfit: options.minProfit,
        maxHoursToResolution: options.maxHours,
        categories: options.categories?.split(',').map(c => c.trim()),
        riskLevels: options.riskLevels?.split(',').map(r => r.trim()) as any
      },
      includeHistoricalContext: true,
      includeReasoning: true
    });

    engine.loadHistoricalData(opportunities);

    const report = engine.generateReport(opportunities);

    spinner.succeed(`Generated ${report.recommendations.length} recommendations`);

    if (options.json) {
      displayJsonReport(report);
    } else {
      displayReport(report, options.verbose || false);
    }

    if (options.output) {
      const outputPath = path.resolve(options.output);
      fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
      console.log(chalk.green(`\n💾 Report saved to: ${outputPath}`));
    }

  } catch (error) {
    spinner.fail('Recommendation generation failed');
    console.error(chalk.red(error));
    throw error;
  }
}

function displayReport(report: RecommendationReport, verbose: boolean) {
  console.log(chalk.cyan('\n╔════════════════════════════════════════════════════════════════════╗'));
  console.log(chalk.cyan('║              ARBITRAGE OPPORTUNITY RECOMMENDATIONS                 ║'));
  console.log(chalk.cyan('╚════════════════════════════════════════════════════════════════════╝'));

  console.log(chalk.white('\n📊 Summary:'));
  console.log(`   Total Opportunities: ${report.totalOpportunities}`);
  console.log(`   Recommended: ${report.totalRecommended}`);
  console.log(`   Average Score: ${report.summary.avgScore.toFixed(1)}`);
  console.log(`   Average Profit: ${report.summary.avgProfit.toFixed(2)}%`);
  if (report.summary.avgHoursToResolution) {
    console.log(`   Avg Hours to Resolution: ${report.summary.avgHoursToResolution.toFixed(1)}h`);
  }
  if (report.summary.topCategory) {
    console.log(`   Top Category: ${report.summary.topCategory}`);
  }

  console.log(chalk.white('\n📈 Risk Distribution:'));
  const riskDist = report.summary.riskDistribution;
  console.log(`   ${chalk.green('Low:')} ${riskDist.low}  ${chalk.yellow('Medium:')} ${riskDist.medium}  ${chalk.red('High:')} ${riskDist.high}  ${chalk.red.bold('Critical:')} ${riskDist.critical}`);

  if (report.recommendations.length === 0) {
    console.log(chalk.yellow('\n⚠️  No opportunities meet the specified criteria'));
    return;
  }

  console.log(chalk.cyan('\n═══════════════════════════════════════════════════════════════════════'));
  console.log(chalk.cyan.bold('                         TOP RECOMMENDATIONS                          '));
  console.log(chalk.cyan('═══════════════════════════════════════════════════════════════════════'));

  const table = new Table({
    head: [
      chalk.bold('#'),
      chalk.bold('Score'),
      chalk.bold('Profit'),
      chalk.bold('Time'),
      chalk.bold('Risk'),
      chalk.bold('Market')
    ],
    colWidths: [4, 8, 9, 10, 10, 50]
  });

  for (const rec of report.recommendations) {
    const scoreColor = rec.score.overall >= 80 ? chalk.green :
                       rec.score.overall >= 60 ? chalk.yellow :
                       chalk.white;

    const riskColor = rec.riskLevel === 'low' ? chalk.green :
                      rec.riskLevel === 'medium' ? chalk.yellow :
                      rec.riskLevel === 'high' ? chalk.red :
                      chalk.red.bold;

    const timeStr = rec.hoursUntilResolution !== null
      ? rec.hoursUntilResolution < 24
        ? `${Math.round(rec.hoursUntilResolution)}h`
        : `${Math.round(rec.hoursUntilResolution / 24)}d`
      : '?';

    table.push([
      rec.rank.toString(),
      scoreColor(rec.score.overall.toFixed(0)),
      `${rec.profitPercent.toFixed(2)}%`,
      timeStr,
      riskColor(rec.riskLevel),
      rec.market1Title.substring(0, 48)
    ]);
  }

  console.log(table.toString());

  if (verbose) {
    displayDetailedRecommendations(report.recommendations);
  } else {
    console.log(chalk.gray('\n💡 Use --verbose for detailed breakdown of each recommendation'));
  }
}

function displayDetailedRecommendations(recommendations: Recommendation[]) {
  for (const rec of recommendations.slice(0, 5)) {
    console.log(chalk.cyan(`\n${'─'.repeat(70)}`));
    console.log(chalk.bold(`#${rec.rank} - Score: ${rec.score.overall.toFixed(1)}/100`));
    console.log(chalk.cyan(`${'─'.repeat(70)}`));

    console.log(chalk.white(`\n📌 ${rec.market1Title}`));
    console.log(chalk.gray(`   vs ${rec.market2Title}`));
    console.log(chalk.gray(`   ${rec.exchange1} ⟷ ${rec.exchange2}`));

    console.log(chalk.white('\n📊 Score Breakdown:'));
    const scoreTable = new Table({
      head: ['Component', 'Score', 'Weight', 'Contribution'],
      colWidths: [15, 10, 10, 15]
    });
    scoreTable.push(
      ['Time', rec.score.timeScore.toFixed(1), '35%', (rec.score.timeScore * 0.35).toFixed(1)],
      ['Profit', rec.score.profitScore.toFixed(1), '35%', (rec.score.profitScore * 0.35).toFixed(1)],
      ['Confidence', rec.score.confidenceScore.toFixed(1), '30%', (rec.score.confidenceScore * 0.30).toFixed(1)]
    );
    console.log(scoreTable.toString());

    console.log(chalk.white('\n💰 Profit:'), chalk.green(`${rec.profitPercent.toFixed(2)}%`));

    if (rec.hoursUntilResolution !== null) {
      const timeStr = rec.hoursUntilResolution < 24
        ? `${Math.round(rec.hoursUntilResolution)} hours`
        : `${Math.round(rec.hoursUntilResolution / 24)} days`;
      console.log(chalk.white('⏱️  Resolution:'), timeStr);
    }

    const riskColor = rec.riskLevel === 'low' ? chalk.green :
                      rec.riskLevel === 'medium' ? chalk.yellow :
                      chalk.red;
    console.log(chalk.white('⚠️  Risk Level:'), riskColor(rec.riskLevel.toUpperCase()));

    if (rec.riskFactors.length > 0) {
      console.log(chalk.yellow('   Risk Factors:'));
      rec.riskFactors.forEach(factor => {
        console.log(chalk.yellow(`   • ${factor}`));
      });
    }

    if (rec.reasoning.length > 0) {
      console.log(chalk.white('\n💡 Reasoning:'));
      rec.reasoning.forEach(reason => {
        console.log(chalk.gray(`   • ${reason}`));
      });
    }

    if (rec.actionItems.length > 0) {
      console.log(chalk.white('\n🎯 Action Items:'));
      rec.actionItems.forEach(action => {
        console.log(chalk.green(`   ✓ ${action}`));
      });
    }

    if (rec.categoryPerformance) {
      const perf = rec.categoryPerformance;
      console.log(chalk.white('\n📈 Category Performance:'));
      console.log(chalk.gray(`   ${perf.category}: ${(perf.historicalWinRate * 100).toFixed(0)}% win rate, ${perf.avgProfit.toFixed(2)}% avg profit`));
      console.log(chalk.gray(`   ${perf.totalOpportunities} historical opportunities, trend: ${perf.recentTrend}`));
    }
  }
}

function displayJsonReport(report: RecommendationReport) {
  console.log(JSON.stringify(report, null, 2));
}

export function createRecommendCommand() {
  return {
    command: 'recommend',
    description: 'Generate ranked opportunity recommendations',
    options: [
      { flags: '--data-dir <path>', description: 'Data directory', defaultValue: './data' },
      { flags: '--top <n>', description: 'Number of top recommendations', defaultValue: '10' },
      { flags: '--min-score <n>', description: 'Minimum overall score (0-100)' },
      { flags: '--min-profit <n>', description: 'Minimum profit percentage' },
      { flags: '--max-hours <n>', description: 'Maximum hours to resolution' },
      { flags: '--categories <list>', description: 'Comma-separated categories to include' },
      { flags: '--risk-levels <list>', description: 'Comma-separated risk levels: low,medium,high,critical' },
      { flags: '--output <file>', description: 'Save report to JSON file' },
      { flags: '--json', description: 'Output raw JSON', defaultValue: false },
      { flags: '--verbose', description: 'Show detailed breakdown', defaultValue: false }
    ],
    action: async (options: any) => {
      await generateRecommendations({
        dataDir: options.dataDir,
        top: options.top ? parseInt(options.top) : undefined,
        minScore: options.minScore ? parseFloat(options.minScore) : undefined,
        minProfit: options.minProfit ? parseFloat(options.minProfit) : undefined,
        maxHours: options.maxHours ? parseFloat(options.maxHours) : undefined,
        categories: options.categories,
        riskLevels: options.riskLevels,
        output: options.output,
        json: options.json,
        verbose: options.verbose
      });
    }
  };
}
