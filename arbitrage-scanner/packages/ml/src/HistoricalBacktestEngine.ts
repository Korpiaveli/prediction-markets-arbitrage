import { HistoricalSnapshot, HistoricalResolution, ArbitrageDirection } from '@arb/core';

export interface HistoricalBacktestConfig {
  initialCapital: number;
  maxExposure: number;
  cooldownMs: number;
  humanDelayMs: [number, number];
  minProfitPercent: number;
  slippageModel: 'conservative' | 'realistic' | 'optimistic';
  maxPositionPercent: number;
}

export interface HistoricalPosition {
  id: string;
  marketPairId: string;
  entryTime: Date;
  direction: ArbitrageDirection;
  exchange1Side: 'YES' | 'NO';
  exchange2Side: 'YES' | 'NO';
  size: number;
  totalCost: number;
  exchange1EntryPrice: number;
  exchange2EntryPrice: number;
  slippage: number;
}

export interface HistoricalTrade extends HistoricalPosition {
  exitTime: Date;
  payout: number;
  profit: number;
  profitPercent: number;
  outcome: 'win' | 'loss' | 'break_even' | 'voided';
  resolutionOutcome?: {
    exchange1: 'YES' | 'NO';
    exchange2: 'YES' | 'NO';
    sameOutcome: boolean;
  };
}

export interface WeekResult {
  weekStart: Date;
  weekEnd: Date;
  tradesAttempted: number;
  tradesExecuted: number;
  wins: number;
  losses: number;
  totalReturn: number;
  returnPercent: number;
  sharpeRatio: number;
  maxDrawdown: number;
  trades: HistoricalTrade[];
  equity: { timestamp: Date; value: number }[];
}

export interface HistoricalBacktestResult {
  config: HistoricalBacktestConfig;
  period: { start: Date; end: Date };
  totalSnapshots: number;
  weeks: WeekResult[];
  aggregate: {
    avgWeeklyReturn: number;
    stdDevReturn: number;
    annualizedReturn: number;
    overallWinRate: number;
    avgSharpe: number;
    avgMaxDrawdown: number;
    totalTrades: number;
    confidence95: [number, number];
  };
  insights: string[];
}

export class HistoricalBacktestEngine {
  private config: HistoricalBacktestConfig;

  constructor(config: Partial<HistoricalBacktestConfig> = {}) {
    this.config = {
      initialCapital: config.initialCapital ?? 1000,
      maxExposure: config.maxExposure ?? 1000,
      cooldownMs: config.cooldownMs ?? 60000,
      humanDelayMs: config.humanDelayMs ?? [1000, 3000],
      minProfitPercent: config.minProfitPercent ?? 1.0,
      slippageModel: config.slippageModel ?? 'realistic',
      maxPositionPercent: config.maxPositionPercent ?? 0.5
    };
  }

  run(
    snapshots: HistoricalSnapshot[],
    resolutions: HistoricalResolution[],
    randomWeeks: { start: Date; end: Date }[]
  ): HistoricalBacktestResult {
    const weekResults: WeekResult[] = [];

    for (const week of randomWeeks) {
      const weekSnapshots = snapshots.filter(
        s => s.timestamp >= week.start && s.timestamp <= week.end
      );
      const result = this.runWeek(weekSnapshots, resolutions, week.start, week.end);
      weekResults.push(result);
    }

    const aggregate = this.calculateAggregate(weekResults);
    const insights = this.generateInsights(weekResults, aggregate);

    const allTimestamps = snapshots.map(s => s.timestamp);
    const minDate = new Date(Math.min(...allTimestamps.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...allTimestamps.map(d => d.getTime())));

    return {
      config: this.config,
      period: { start: minDate, end: maxDate },
      totalSnapshots: snapshots.length,
      weeks: weekResults,
      aggregate,
      insights
    };
  }

  selectRandomWeeks(
    snapshots: HistoricalSnapshot[],
    numWeeks: number
  ): { start: Date; end: Date }[] {
    if (snapshots.length === 0) return [];

    const timestamps = snapshots.map(s => s.timestamp.getTime());
    const dataStart = Math.min(...timestamps);
    const dataEnd = Math.max(...timestamps);

    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const availableRange = dataEnd - dataStart - weekMs;

    if (availableRange <= 0) {
      return [{ start: new Date(dataStart), end: new Date(dataEnd) }];
    }

    const weeks: { start: Date; end: Date }[] = [];
    const usedStarts = new Set<number>();

    for (let i = 0; i < numWeeks && i < 100; i++) {
      let startTs: number;
      let attempts = 0;

      do {
        startTs = dataStart + Math.floor(Math.random() * availableRange);
        const dayBucket = Math.floor(startTs / (24 * 60 * 60 * 1000));
        if (!usedStarts.has(dayBucket)) {
          usedStarts.add(dayBucket);
          break;
        }
        attempts++;
      } while (attempts < 50);

      weeks.push({
        start: new Date(startTs),
        end: new Date(startTs + weekMs)
      });
    }

    return weeks.sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  private runWeek(
    snapshots: HistoricalSnapshot[],
    resolutions: HistoricalResolution[],
    weekStart: Date,
    weekEnd: Date
  ): WeekResult {
    const sorted = [...snapshots].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );

    let capital = this.config.initialCapital;
    let exposure = 0;
    const positions: HistoricalPosition[] = [];
    const trades: HistoricalTrade[] = [];
    const equity: { timestamp: Date; value: number }[] = [
      { timestamp: weekStart, value: capital }
    ];

    const cooldowns = new Map<string, Date>();
    let tradesAttempted = 0;

    for (const snapshot of sorted) {
      const resolvedIds = new Set<string>();
      for (const pos of positions) {
        const resolution = resolutions.find(r => r.marketPairId === pos.marketPairId);
        if (resolution && resolution.resolvedAt <= snapshot.timestamp) {
          const trade = this.resolvePosition(pos, resolution);
          trades.push(trade);

          capital += trade.payout;
          exposure -= pos.totalCost;
          resolvedIds.add(pos.id);

          cooldowns.set(pos.marketPairId, new Date(resolution.resolvedAt.getTime() + this.config.cooldownMs));

          equity.push({ timestamp: snapshot.timestamp, value: capital + exposure });
        }
      }

      for (let i = positions.length - 1; i >= 0; i--) {
        if (resolvedIds.has(positions[i].id)) {
          positions.splice(i, 1);
        }
      }

      if (!snapshot.arbitrage.exists || snapshot.arbitrage.profitPercent < this.config.minProfitPercent) {
        continue;
      }

      tradesAttempted++;

      const cooldownEnd = cooldowns.get(snapshot.marketPairId);
      if (cooldownEnd && snapshot.timestamp < cooldownEnd) {
        continue;
      }

      const availableCapital = Math.min(
        capital,
        this.config.maxExposure - exposure
      );

      if (availableCapital < 10) {
        continue;
      }

      const humanDelay = this.randomInRange(this.config.humanDelayMs[0], this.config.humanDelayMs[1]);
      const executionTime = new Date(snapshot.timestamp.getTime() + humanDelay);

      const maxSize = availableCapital * this.config.maxPositionPercent;
      const positionSize = Math.min(maxSize, availableCapital);

      const slippage = this.calculateSlippage(positionSize, snapshot.arbitrage.profitPercent);
      const adjustedCost = snapshot.arbitrage.totalCost * (1 + slippage);

      if (adjustedCost >= 1) {
        continue;
      }

      const position: HistoricalPosition = {
        id: `pos-${snapshot.marketPairId}-${snapshot.timestamp.getTime()}`,
        marketPairId: snapshot.marketPairId,
        entryTime: executionTime,
        direction: snapshot.arbitrage.direction,
        exchange1Side: snapshot.arbitrage.direction === 'EXCHANGE1_YES_EXCHANGE2_NO' ? 'YES' : 'NO',
        exchange2Side: snapshot.arbitrage.direction === 'EXCHANGE1_YES_EXCHANGE2_NO' ? 'NO' : 'YES',
        size: positionSize / adjustedCost,
        totalCost: positionSize,
        exchange1EntryPrice: snapshot.exchange1.yesPrice,
        exchange2EntryPrice: snapshot.exchange2.noPrice,
        slippage
      };

      positions.push(position);
      capital -= positionSize;
      exposure += positionSize;

      equity.push({ timestamp: executionTime, value: capital + exposure });
    }

    for (const pos of positions) {
      trades.push({
        ...pos,
        exitTime: weekEnd,
        payout: pos.totalCost,
        profit: 0,
        profitPercent: 0,
        outcome: 'voided'
      });
      capital += pos.totalCost;
    }

    equity.push({ timestamp: weekEnd, value: capital });

    const wins = trades.filter(t => t.outcome === 'win').length;
    const losses = trades.filter(t => t.outcome === 'loss').length;
    const totalReturn = capital - this.config.initialCapital;
    const returnPercent = (totalReturn / this.config.initialCapital) * 100;

    return {
      weekStart,
      weekEnd,
      tradesAttempted,
      tradesExecuted: trades.filter(t => t.outcome !== 'voided').length,
      wins,
      losses,
      totalReturn,
      returnPercent,
      sharpeRatio: this.calculateSharpe(equity),
      maxDrawdown: this.calculateMaxDrawdown(equity),
      trades,
      equity
    };
  }

  private resolvePosition(
    position: HistoricalPosition,
    resolution: HistoricalResolution
  ): HistoricalTrade {
    const exchange1Wins = resolution.exchange1.outcome === position.exchange1Side;
    const exchange2Wins = resolution.exchange2.outcome === position.exchange2Side;

    const exchange1Payout = exchange1Wins ? position.size : 0;
    const exchange2Payout = exchange2Wins ? position.size : 0;
    const totalPayout = exchange1Payout + exchange2Payout;

    const profit = totalPayout - position.totalCost;
    const profitPercent = (profit / position.totalCost) * 100;

    let outcome: 'win' | 'loss' | 'break_even';
    if (profit > 0.01) {
      outcome = 'win';
    } else if (profit < -0.01) {
      outcome = 'loss';
    } else {
      outcome = 'break_even';
    }

    return {
      ...position,
      exitTime: resolution.resolvedAt,
      payout: totalPayout,
      profit,
      profitPercent,
      outcome,
      resolutionOutcome: {
        exchange1: resolution.exchange1.outcome,
        exchange2: resolution.exchange2.outcome,
        sameOutcome: resolution.sameOutcome
      }
    };
  }

  private calculateSlippage(size: number, profitPercent: number): number {
    const baseSlippage = 0.001;
    const sizeImpact = Math.min(size / 1000, 1) * 0.005;
    const profitImpact = profitPercent > 5 ? 0.002 : 0;

    let total = baseSlippage + sizeImpact + profitImpact;

    switch (this.config.slippageModel) {
      case 'conservative':
        total *= 1.5;
        break;
      case 'optimistic':
        total *= 0.5;
        break;
    }

    return total;
  }

  private calculateSharpe(equity: { timestamp: Date; value: number }[]): number {
    if (equity.length < 2) return 0;

    const returns: number[] = [];
    for (let i = 1; i < equity.length; i++) {
      const ret = (equity[i].value - equity[i - 1].value) / equity[i - 1].value;
      returns.push(ret);
    }

    if (returns.length === 0) return 0;

    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return avgReturn > 0 ? 3 : avgReturn < 0 ? -3 : 0;

    return (avgReturn / stdDev) * Math.sqrt(52);
  }

  private calculateMaxDrawdown(equity: { timestamp: Date; value: number }[]): number {
    if (equity.length === 0) return 0;

    let maxDrawdown = 0;
    let peak = equity[0].value;

    for (const point of equity) {
      if (point.value > peak) {
        peak = point.value;
      }
      const drawdown = (peak - point.value) / peak;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    return maxDrawdown;
  }

  private calculateAggregate(weeks: WeekResult[]): HistoricalBacktestResult['aggregate'] {
    if (weeks.length === 0) {
      return {
        avgWeeklyReturn: 0,
        stdDevReturn: 0,
        annualizedReturn: 0,
        overallWinRate: 0,
        avgSharpe: 0,
        avgMaxDrawdown: 0,
        totalTrades: 0,
        confidence95: [0, 0]
      };
    }

    const returns = weeks.map(w => w.returnPercent);
    const avgWeeklyReturn = returns.reduce((a, b) => a + b, 0) / returns.length;

    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgWeeklyReturn, 2), 0) / returns.length;
    const stdDevReturn = Math.sqrt(variance);

    const annualizedReturn = avgWeeklyReturn * 52;

    const totalWins = weeks.reduce((sum, w) => sum + w.wins, 0);
    const totalExecuted = weeks.reduce((sum, w) => sum + w.tradesExecuted, 0);
    const overallWinRate = totalExecuted > 0 ? totalWins / totalExecuted : 0;

    const avgSharpe = weeks.reduce((sum, w) => sum + w.sharpeRatio, 0) / weeks.length;
    const avgMaxDrawdown = weeks.reduce((sum, w) => sum + w.maxDrawdown, 0) / weeks.length;
    const totalTrades = weeks.reduce((sum, w) => sum + w.tradesExecuted, 0);

    const tValue = 2.0;
    const marginOfError = tValue * (stdDevReturn / Math.sqrt(weeks.length));
    const confidence95: [number, number] = [
      avgWeeklyReturn - marginOfError,
      avgWeeklyReturn + marginOfError
    ];

    return {
      avgWeeklyReturn,
      stdDevReturn,
      annualizedReturn,
      overallWinRate,
      avgSharpe,
      avgMaxDrawdown,
      totalTrades,
      confidence95
    };
  }

  private generateInsights(
    weeks: WeekResult[],
    aggregate: HistoricalBacktestResult['aggregate']
  ): string[] {
    const insights: string[] = [];

    insights.push(`Analyzed ${weeks.length} random weeks`);
    insights.push(`Average weekly return: ${aggregate.avgWeeklyReturn.toFixed(2)}% (+/- ${aggregate.stdDevReturn.toFixed(2)}%)`);
    insights.push(`Annualized return (theoretical): ${aggregate.annualizedReturn.toFixed(1)}%`);
    insights.push(`Overall win rate: ${(aggregate.overallWinRate * 100).toFixed(1)}%`);
    insights.push(`Average Sharpe ratio: ${aggregate.avgSharpe.toFixed(2)}`);

    if (aggregate.avgWeeklyReturn > 2) {
      insights.push('✅ Strong weekly returns suggest viable strategy');
    } else if (aggregate.avgWeeklyReturn < 0) {
      insights.push('⚠️ Negative returns - strategy may not be profitable');
    }

    if (aggregate.overallWinRate > 0.7) {
      insights.push('✅ High win rate indicates reliable opportunities');
    } else if (aggregate.overallWinRate < 0.5) {
      insights.push('⚠️ Low win rate - consider stricter entry criteria');
    }

    if (aggregate.avgMaxDrawdown > 0.1) {
      insights.push('⚠️ High drawdown risk - consider smaller position sizes');
    }

    if (aggregate.stdDevReturn > aggregate.avgWeeklyReturn * 2) {
      insights.push('⚠️ High variance - returns are inconsistent');
    }

    const bestWeek = weeks.reduce((best, w) => w.returnPercent > best.returnPercent ? w : best);
    const worstWeek = weeks.reduce((worst, w) => w.returnPercent < worst.returnPercent ? w : worst);

    insights.push(`Best week: +${bestWeek.returnPercent.toFixed(2)}%`);
    insights.push(`Worst week: ${worstWeek.returnPercent.toFixed(2)}%`);

    return insights;
  }

  private randomInRange(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}
