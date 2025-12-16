import {
  format,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  addDays,
  addWeeks,
  addMonths,
  differenceInDays,
  isBefore,
  isAfter
} from 'date-fns';
import {
  ReportInterval,
  IntervalReport,
  IntervalMetrics,
  PositionSummary,
  SimulatedTrade
} from '../types.js';

interface Period {
  start: Date;
  end: Date;
  label: string;
}

export class IntervalReporter {
  generate(
    trades: SimulatedTrade[],
    intervals: ReportInterval[],
    periodStart: Date,
    periodEnd: Date,
    initialCapital: number
  ): Map<ReportInterval, IntervalReport[]> {
    const reports = new Map<ReportInterval, IntervalReport[]>();

    for (const interval of intervals) {
      const periods = this.dividePeriods(periodStart, periodEnd, interval);
      const intervalReports: IntervalReport[] = [];

      let runningCapital = initialCapital;

      for (const period of periods) {
        const periodTrades = trades.filter(t =>
          t.entryDate >= period.start && t.entryDate < period.end
        );

        const report = this.generateSingleReport(
          periodTrades,
          period,
          interval,
          runningCapital
        );

        intervalReports.push(report);
        runningCapital = report.metrics.endingCapital;
      }

      reports.set(interval, intervalReports);
    }

    return reports;
  }

  private dividePeriods(start: Date, end: Date, interval: ReportInterval): Period[] {
    const periods: Period[] = [];
    let current = start;

    while (isBefore(current, end)) {
      let periodStart: Date;
      let periodEnd: Date;
      let label: string;

      switch (interval) {
        case 'daily':
          periodStart = startOfDay(current);
          periodEnd = endOfDay(current);
          label = format(current, 'MMM d, yyyy');
          current = addDays(current, 1);
          break;

        case 'weekly':
          periodStart = startOfWeek(current, { weekStartsOn: 1 });
          periodEnd = endOfWeek(current, { weekStartsOn: 1 });
          label = `Week of ${format(periodStart, 'MMM d')}`;
          current = addWeeks(current, 1);
          break;

        case 'monthly':
          periodStart = startOfMonth(current);
          periodEnd = endOfMonth(current);
          label = format(current, 'MMMM yyyy');
          current = addMonths(current, 1);
          break;

        case 'semi_annual':
          periodStart = new Date(current);
          periodEnd = addMonths(current, 6);
          if (isAfter(periodEnd, end)) {
            periodEnd = end;
          }
          const h = current.getMonth() < 6 ? 'H1' : 'H2';
          label = `${h} ${format(current, 'yyyy')}`;
          current = periodEnd;
          break;

        case 'annual':
          periodStart = new Date(current.getFullYear(), 0, 1);
          periodEnd = new Date(current.getFullYear(), 11, 31, 23, 59, 59);
          if (isAfter(periodEnd, end)) {
            periodEnd = end;
          }
          label = format(current, 'yyyy');
          current = new Date(current.getFullYear() + 1, 0, 1);
          break;

        default:
          throw new Error(`Unknown interval: ${interval}`);
      }

      if (isAfter(periodEnd, end)) {
        periodEnd = end;
      }

      periods.push({ start: periodStart, end: periodEnd, label });
    }

    return periods;
  }

  private generateSingleReport(
    trades: SimulatedTrade[],
    period: Period,
    interval: ReportInterval,
    startingCapital: number
  ): IntervalReport {
    const closedTrades = trades.filter(t => t.outcome !== 'pending');
    const wins = closedTrades.filter(t => t.outcome === 'win').length;
    const losses = closedTrades.filter(t => t.outcome === 'loss').length;
    const pending = trades.filter(t => t.outcome === 'pending').length;

    const totalProfit = closedTrades.reduce((sum, t) => sum + (t.profit || 0), 0);
    const endingCapital = startingCapital + totalProfit;

    const returns = closedTrades.map(t => t.actualProfitPercent || 0);
    const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const variance = returns.length > 1
      ? returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1)
      : 0;
    const stdDev = Math.sqrt(variance);

    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(52) : 0;

    const negativeReturns = returns.filter(r => r < 0);
    const downsideVariance = negativeReturns.length > 0
      ? negativeReturns.reduce((sum, r) => sum + r * r, 0) / negativeReturns.length
      : 0;
    const downsideDeviation = Math.sqrt(downsideVariance);
    const sortinoRatio = downsideDeviation > 0 ? (avgReturn / downsideDeviation) * Math.sqrt(52) : sharpeRatio;

    let maxDrawdown = 0;
    let maxDrawdownPercent = 0;
    let peak = startingCapital;
    let runningCapital = startingCapital;

    for (const trade of closedTrades.sort((a, b) => a.entryDate.getTime() - b.entryDate.getTime())) {
      runningCapital += trade.profit || 0;
      if (runningCapital > peak) {
        peak = runningCapital;
      }
      const drawdown = peak - runningCapital;
      const drawdownPct = (drawdown / peak) * 100;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
        maxDrawdownPercent = drawdownPct;
      }
    }

    const totalCost = trades.reduce((sum, t) => sum + t.cost, 0);
    const capitalUtilization = startingCapital > 0 ? (totalCost / startingCapital) * 100 : 0;

    const resolutionTimes = closedTrades
      .filter(t => t.exitDate)
      .map(t => differenceInDays(t.exitDate!, t.entryDate));
    const avgDaysToResolution = resolutionTimes.length > 0
      ? resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length
      : 0;

    const metrics: IntervalMetrics = {
      startingCapital,
      endingCapital,
      netProfit: totalProfit,
      returnPercent: startingCapital > 0 ? (totalProfit / startingCapital) * 100 : 0,
      tradesExecuted: trades.length,
      wins,
      losses,
      pending,
      winRate: closedTrades.length > 0 ? (wins / closedTrades.length) * 100 : 0,
      avgProfitPerTrade: closedTrades.length > 0 ? totalProfit / closedTrades.length : 0,
      sharpeRatio,
      sortinoRatio,
      maxDrawdown,
      maxDrawdownPercent,
      capitalUtilization,
      avgDaysToResolution
    };

    const positions: PositionSummary[] = trades.map(t => ({
      marketPairId: t.marketPairId,
      description: t.marketPairDescription,
      entryDate: t.entryDate,
      exitDate: t.exitDate,
      entryProfit: t.entryProfitPercent,
      actualProfit: t.actualProfitPercent,
      status: t.outcome === 'pending' ? 'pending_resolution' : 'closed',
      outcome: t.outcome
    }));

    const notes: string[] = [];
    if (trades.length === 0) {
      notes.push('No trades executed in this period');
    }
    if (wins > 0 && losses === 0) {
      notes.push(`Perfect win rate (${wins} wins)`);
    }
    if (maxDrawdownPercent > 10) {
      notes.push(`High drawdown: ${maxDrawdownPercent.toFixed(1)}%`);
    }
    if (pending > 0) {
      notes.push(`${pending} trade(s) pending resolution`);
    }

    return {
      interval,
      periodStart: period.start,
      periodEnd: period.end,
      periodLabel: period.label,
      metrics,
      positions,
      notes
    };
  }

  formatConsoleOutput(reports: Map<ReportInterval, IntervalReport[]>, summary: any): string {
    const lines: string[] = [];

    lines.push('');
    lines.push('═'.repeat(60));
    lines.push('         REAL HISTORICAL BACKTEST RESULTS');
    lines.push('═'.repeat(60));
    lines.push('');

    if (summary) {
      lines.push(`📅 Period: ${format(summary.period.start, 'MMM d, yyyy')} - ${format(summary.period.end, 'MMM d, yyyy')} (${summary.period.durationDays} days)`);
      lines.push(`💰 Starting Capital: $${summary.performance.initialCapital.toLocaleString()}`);
      lines.push('');

      lines.push('                    ANNUAL SUMMARY');
      lines.push('─'.repeat(60));
      lines.push(`  Final Capital:     $${summary.performance.finalCapital.toLocaleString()}`);
      lines.push(`  Net Profit:        $${summary.performance.netProfit.toLocaleString()} (${summary.performance.totalReturn >= 0 ? '+' : ''}${summary.performance.totalReturn.toFixed(2)}%)`);
      lines.push(`  Trades Executed:   ${summary.trading.totalTrades}`);
      lines.push(`  Win Rate:          ${summary.trading.winRate.toFixed(1)}% (${summary.trading.wins}W / ${summary.trading.losses}L)`);
      lines.push(`  Sharpe Ratio:      ${summary.risk.sharpeRatio.toFixed(2)}`);
      lines.push(`  Max Drawdown:      -${summary.risk.maxDrawdownPercent.toFixed(1)}%`);
      lines.push('');
    }

    if (reports.has('monthly')) {
      lines.push('                    MONTHLY BREAKDOWN');
      lines.push('─'.repeat(60));
      lines.push('  Month       | Trades | Win Rate | Return  | Capital');
      lines.push('  ' + '-'.repeat(56));

      const monthlyReports = reports.get('monthly')!;
      for (const report of monthlyReports) {
        const m = report.metrics;
        lines.push(
          `  ${report.periodLabel.padEnd(12)} | ${String(m.tradesExecuted).padStart(6)} | ${m.winRate.toFixed(1).padStart(7)}% | ${(m.returnPercent >= 0 ? '+' : '') + m.returnPercent.toFixed(1).padStart(6)}% | $${m.endingCapital.toLocaleString()}`
        );
      }
      lines.push('');
    }

    if (reports.has('weekly')) {
      lines.push('                    WEEKLY AVERAGES');
      lines.push('─'.repeat(60));

      const weeklyReports = reports.get('weekly')!;
      const avgTrades = weeklyReports.reduce((s, r) => s + r.metrics.tradesExecuted, 0) / weeklyReports.length;
      const avgReturn = weeklyReports.reduce((s, r) => s + r.metrics.returnPercent, 0) / weeklyReports.length;
      const bestWeek = weeklyReports.reduce((best, r) => r.metrics.returnPercent > best.metrics.returnPercent ? r : best);
      const worstWeek = weeklyReports.reduce((worst, r) => r.metrics.returnPercent < worst.metrics.returnPercent ? r : worst);

      lines.push(`  Avg Trades/Week:     ${avgTrades.toFixed(1)}`);
      lines.push(`  Avg Return/Week:     ${avgReturn >= 0 ? '+' : ''}${avgReturn.toFixed(2)}%`);
      lines.push(`  Best Week:           ${bestWeek.metrics.returnPercent >= 0 ? '+' : ''}${bestWeek.metrics.returnPercent.toFixed(1)}% (${bestWeek.periodLabel})`);
      lines.push(`  Worst Week:          ${worstWeek.metrics.returnPercent >= 0 ? '+' : ''}${worstWeek.metrics.returnPercent.toFixed(1)}% (${worstWeek.periodLabel})`);
      lines.push('');
    }

    if (summary?.resolution) {
      lines.push('                    RESOLUTION ANALYSIS');
      lines.push('─'.repeat(60));
      lines.push(`  Same Outcome Rate:   ${summary.resolution.sameOutcomeRate.toFixed(1)}%`);
      lines.push(`  Avg Resolution Time: ${summary.resolution.avgResolutionTime.toFixed(0)} days`);
      lines.push(`  Voided Markets:      ${summary.resolution.voidedMarkets} (${((summary.resolution.voidedMarkets / summary.trading.totalTrades) * 100).toFixed(1)}%)`);
      lines.push('');
    }

    lines.push('═'.repeat(60));

    return lines.join('\n');
  }
}

export function createIntervalReporter(): IntervalReporter {
  return new IntervalReporter();
}
