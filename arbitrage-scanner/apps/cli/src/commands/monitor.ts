import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import path from 'path';
import fs from 'fs';
import { MarketCategory } from '@arb/core';
import { createExchanges, parseExchangeList, getAvailableExchanges } from '../utils/exchanges.js';

interface MonitorStats {
  totalScans: number;
  totalOpportunities: number;
  alertsTriggered: number;
  highestProfit: number;
  avgProfit: number;
  startTime: Date;
  lastScanTime: Date | null;
  opportunitiesByExchange: Record<string, number>;
}

interface AlertConfig {
  minProfit: number;
  soundEnabled: boolean;
  logFile: string | null;
}

interface OpportunityLog {
  timestamp: string;
  exchanges: string;
  direction: string;
  grossProfit: number;
  netProfit: number;
  totalCost: number;
  market1: { id: string; title: string };
  market2: { id: string; title: string };
}

export function createMonitorCommand() {
  return {
    command: 'monitor',
    description: 'Continuous arbitrage monitoring with alerts and logging',
    options: [
      { flags: '--threshold <n>', description: 'Max total cost threshold', defaultValue: '1.02' },
      { flags: '--alert-profit <n>', description: 'Profit % to trigger alert', defaultValue: '1.0' },
      { flags: '--exchanges <list>', description: `Exchanges: ${getAvailableExchanges().join(', ')}`, defaultValue: 'kalshi,predictit' },
      { flags: '--categories <list>', description: 'Categories: politics,economy,crypto', defaultValue: 'politics' },
      { flags: '--max-markets <n>', description: 'Max markets per exchange', defaultValue: '2000' },
      { flags: '--whitelist <file>', description: 'Verified pairs whitelist JSON', defaultValue: '' },
      { flags: '--interval <ms>', description: 'Scan interval in milliseconds', defaultValue: '60000' },
      { flags: '--log-file <path>', description: 'Log opportunities to file', defaultValue: '' },
      { flags: '--quiet', description: 'Suppress detailed output', defaultValue: false },
      { flags: '--dashboard', description: 'Show live dashboard', defaultValue: false }
    ],
    action: async (options: any) => {
      const spinner = ora('Initializing monitor...').start();

      const stats: MonitorStats = {
        totalScans: 0,
        totalOpportunities: 0,
        alertsTriggered: 0,
        highestProfit: 0,
        avgProfit: 0,
        startTime: new Date(),
        lastScanTime: null,
        opportunitiesByExchange: {}
      };

      const alertConfig: AlertConfig = {
        minProfit: parseFloat(options.alertProfit),
        soundEnabled: true,
        logFile: options.logFile ? path.resolve(options.logFile) : null
      };

      const recentOpportunities: OpportunityLog[] = [];

      try {
        const { PriceFirstScanner } = await import('@arb/scanner');

        const exchangeOptions = parseExchangeList(options.exchanges);
        const exchanges = createExchanges({
          ...exchangeOptions,
          filterSports: true
        });

        if (exchanges.length < 2) {
          throw new Error('Need at least 2 exchanges for monitoring');
        }

        spinner.text = `Connecting to ${exchanges.length} exchanges...`;
        await Promise.all(exchanges.map(e => e.connect()));

        const scanner = new PriceFirstScanner();

        if (options.whitelist) {
          spinner.text = 'Loading whitelist...';
          await scanner.loadWhitelist(path.resolve(options.whitelist));
        }

        const categories = options.categories
          ? options.categories.split(',').map((c: string) => c.trim() as MarketCategory)
          : ['politics'];

        const config = {
          maxTotalCost: parseFloat(options.threshold),
          minGrossArbitrage: 0.001,
          includeCategories: categories,
          maxMarketsPerExchange: parseInt(options.maxMarkets)
        };

        spinner.succeed('Monitor initialized');
        console.log(chalk.cyan('\n═══════════════════════════════════════════════════════════'));
        console.log(chalk.cyan.bold('              ARBITRAGE MONITORING SYSTEM                   '));
        console.log(chalk.cyan('═══════════════════════════════════════════════════════════'));
        console.log(chalk.white(`\n  Exchanges: ${options.exchanges}`));
        console.log(chalk.white(`  Alert threshold: ${alertConfig.minProfit}% net profit`));
        console.log(chalk.white(`  Scan interval: ${options.interval}ms`));
        console.log(chalk.white(`  Categories: ${categories.join(', ')}`));
        if (alertConfig.logFile) {
          console.log(chalk.white(`  Log file: ${alertConfig.logFile}`));
        }
        console.log(chalk.gray('\n  Press Ctrl+C to stop\n'));

        const interval = parseInt(options.interval);

        const runScan = async () => {
          stats.totalScans++;
          stats.lastScanTime = new Date();

          try {
            const result = await scanner.scan(exchanges, config);

            const profitable = result.opportunities.filter(
              (o: any) => o.netProfitPercent >= alertConfig.minProfit
            );

            stats.totalOpportunities += profitable.length;

            for (const opp of profitable) {
              const exchangeKey = `${opp.candidate.exchange1}-${opp.candidate.exchange2}`;
              stats.opportunitiesByExchange[exchangeKey] = (stats.opportunitiesByExchange[exchangeKey] || 0) + 1;

              if (opp.netProfitPercent > stats.highestProfit) {
                stats.highestProfit = opp.netProfitPercent;
              }

              const logEntry: OpportunityLog = {
                timestamp: new Date().toISOString(),
                exchanges: exchangeKey,
                direction: opp.direction,
                grossProfit: opp.grossProfitPercent,
                netProfit: opp.netProfitPercent,
                totalCost: opp.totalCost,
                market1: {
                  id: opp.candidate.market1.id,
                  title: opp.candidate.market1.title
                },
                market2: {
                  id: opp.candidate.market2.id,
                  title: opp.candidate.market2.title
                }
              };

              recentOpportunities.unshift(logEntry);
              if (recentOpportunities.length > 100) {
                recentOpportunities.pop();
              }

              if (alertConfig.logFile) {
                appendToLog(alertConfig.logFile, logEntry);
              }

              stats.alertsTriggered++;
              displayAlert(opp, options.quiet);
            }

            if (profitable.length > 0) {
              stats.avgProfit = recentOpportunities.reduce((sum, o) => sum + o.netProfit, 0) / recentOpportunities.length;
            }

            if (options.dashboard) {
              displayDashboard(stats, recentOpportunities.slice(0, 10));
            } else if (!options.quiet) {
              displayScanSummary(stats, result, profitable.length);
            }

          } catch (error: any) {
            console.error(chalk.red(`  Scan error: ${error.message}`));
          }
        };

        await runScan();
        const intervalId = setInterval(runScan, interval);

        process.on('SIGINT', async () => {
          clearInterval(intervalId);
          console.log(chalk.yellow('\n\n⏹ Stopping monitor...'));
          displayFinalStats(stats, recentOpportunities);
          await Promise.all(exchanges.map(e => e.disconnect()));
          process.exit(0);
        });

      } catch (error: any) {
        spinner.fail('Monitor failed');
        console.error(chalk.red(error.message));
        process.exit(1);
      }
    }
  };
}

function displayAlert(opp: any, quiet: boolean) {
  const m1 = opp.candidate.market1;
  const m2 = opp.candidate.market2;

  console.log(chalk.green.bold(`\n🚨 ALERT: Arbitrage opportunity found!`));
  console.log(chalk.green(`   Net Profit: ${opp.netProfitPercent.toFixed(2)}% | Gross: ${opp.grossProfitPercent.toFixed(2)}%`));
  console.log(chalk.white(`   ${opp.candidate.exchange1}/${opp.candidate.exchange2} - ${opp.direction}`));

  if (!quiet) {
    console.log(chalk.gray(`   M1: ${m1.title.substring(0, 50)}...`));
    console.log(chalk.gray(`   M2: ${m2.title.substring(0, 50)}...`));
  }
  console.log('');
}

function displayScanSummary(stats: MonitorStats, result: any, alertCount: number) {
  const timestamp = new Date().toLocaleTimeString();
  const runtime = Math.floor((Date.now() - stats.startTime.getTime()) / 1000);

  let statusLine = chalk.gray(`[${timestamp}] `);
  statusLine += chalk.white(`Scan #${stats.totalScans} | `);
  statusLine += chalk.white(`${result.candidates.length} candidates → ${result.opportunities.length} opps | `);

  if (alertCount > 0) {
    statusLine += chalk.green.bold(`${alertCount} alerts`);
  } else {
    statusLine += chalk.gray('0 alerts');
  }

  statusLine += chalk.gray(` | Runtime: ${formatDuration(runtime)}`);

  console.log(statusLine);
}

function displayDashboard(stats: MonitorStats, recent: OpportunityLog[]) {
  console.clear();
  console.log(chalk.cyan.bold('\n  ARBITRAGE MONITOR DASHBOARD'));
  console.log(chalk.cyan('  ' + '═'.repeat(50)));

  const runtime = Math.floor((Date.now() - stats.startTime.getTime()) / 1000);

  console.log(chalk.white(`\n  📊 Statistics:`));
  console.log(`     Scans: ${stats.totalScans} | Runtime: ${formatDuration(runtime)}`);
  console.log(`     Alerts: ${stats.alertsTriggered} | Avg Profit: ${stats.avgProfit.toFixed(2)}%`);
  console.log(`     Highest: ${stats.highestProfit.toFixed(2)}%`);

  if (Object.keys(stats.opportunitiesByExchange).length > 0) {
    console.log(chalk.white(`\n  📈 By Exchange Pair:`));
    Object.entries(stats.opportunitiesByExchange).forEach(([pair, count]) => {
      console.log(`     ${pair}: ${count}`);
    });
  }

  if (recent.length > 0) {
    console.log(chalk.white(`\n  🕒 Recent Opportunities:`));

    const table = new Table({
      head: ['Time', 'Pair', 'Net %', 'Gross %'],
      colWidths: [12, 18, 10, 10],
      style: { head: ['cyan'] }
    });

    recent.slice(0, 5).forEach(opp => {
      const time = new Date(opp.timestamp).toLocaleTimeString();
      table.push([
        time,
        opp.exchanges,
        chalk.green(`${opp.netProfit.toFixed(2)}%`),
        `${opp.grossProfit.toFixed(2)}%`
      ]);
    });

    console.log(table.toString());
  }

  console.log(chalk.gray(`\n  Last scan: ${stats.lastScanTime?.toLocaleTimeString() || 'N/A'}`));
  console.log(chalk.gray('  Press Ctrl+C to stop'));
}

function displayFinalStats(stats: MonitorStats, opportunities: OpportunityLog[]) {
  const runtime = Math.floor((Date.now() - stats.startTime.getTime()) / 1000);

  console.log(chalk.cyan('\n═══════════════════════════════════════════════════════════'));
  console.log(chalk.cyan.bold('              MONITORING SESSION SUMMARY                    '));
  console.log(chalk.cyan('═══════════════════════════════════════════════════════════'));

  console.log(chalk.white(`\n  📊 Session Statistics:`));
  console.log(`     Total scans: ${stats.totalScans}`);
  console.log(`     Runtime: ${formatDuration(runtime)}`);
  console.log(`     Alerts triggered: ${stats.alertsTriggered}`);
  console.log(`     Highest profit seen: ${stats.highestProfit.toFixed(2)}%`);
  console.log(`     Average profit: ${stats.avgProfit.toFixed(2)}%`);

  if (Object.keys(stats.opportunitiesByExchange).length > 0) {
    console.log(chalk.white(`\n  📈 Opportunities by Exchange:`));
    Object.entries(stats.opportunitiesByExchange).forEach(([pair, count]) => {
      console.log(`     ${pair}: ${count}`);
    });
  }

  if (opportunities.length > 0) {
    console.log(chalk.white(`\n  🏆 Top Opportunities:`));
    const sorted = [...opportunities].sort((a, b) => b.netProfit - a.netProfit);
    sorted.slice(0, 5).forEach((opp, i) => {
      console.log(`     ${i + 1}. ${opp.netProfit.toFixed(2)}% - ${opp.exchanges} - ${opp.market1.title.substring(0, 40)}...`);
    });
  }

  console.log('');
}

function appendToLog(filePath: string, entry: OpportunityLog) {
  const line = JSON.stringify(entry) + '\n';
  fs.appendFileSync(filePath, line);
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
