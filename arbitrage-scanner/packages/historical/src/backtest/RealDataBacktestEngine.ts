import { MarketOutcome } from '@arb/core';
import { HistoricalStore } from '../storage/HistoricalStore.js';
import { ResolutionTracker } from '../resolution/ResolutionTracker.js';
import {
  RealBacktestConfig,
  RealBacktestResult,
  RealBacktestSummary,
  BacktestUserConfig,
  BacktestExecutionConfig,
  RealHistoricalSnapshot,
  RealResolution,
  SimulatedTrade,
  SimulatedPosition,
  CapitalPathPoint,
  TradeOutcome,
  DEFAULT_EXECUTION_CONFIG,
  SLIPPAGE_FACTORS
} from '../types.js';
import { IntervalReporter } from '../reporting/IntervalReporter.js';
import { differenceInDays, addDays, subDays, subWeeks, subMonths, subYears } from 'date-fns';

export class RealDataBacktestEngine {
  private store: HistoricalStore;
  private reporter: IntervalReporter;

  constructor(options: {
    store: HistoricalStore;
    resolutionTracker: ResolutionTracker;
  }) {
    this.store = options.store;
    // ResolutionTracker available for live resolution checking if needed
    void options.resolutionTracker;
    this.reporter = new IntervalReporter();
  }

  async run(config: RealBacktestConfig): Promise<RealBacktestResult> {
    const { userConfig, executionConfig } = config;
    const mergedExecutionConfig = { ...DEFAULT_EXECUTION_CONFIG, ...executionConfig };

    const { startDate, endDate } = this.resolveDateRange(userConfig);

    console.log(`[RealDataBacktestEngine] Running backtest from ${startDate.toISOString()} to ${endDate.toISOString()}`);

    const snapshots = await this.store.getSnapshots({ start: startDate, end: endDate });
    console.log(`[RealDataBacktestEngine] Loaded ${snapshots.length} historical snapshots`);

    const marketPairIds = [...new Set(snapshots.map(s => s.marketPairId))];
    const resolutions = await this.store.getResolutions(marketPairIds);
    const resolutionMap = new Map(resolutions.map(r => [r.marketPairId, r]));
    console.log(`[RealDataBacktestEngine] Loaded ${resolutions.length} resolutions`);

    const { trades, capitalPath, warnings } = await this.simulate(
      snapshots,
      resolutionMap,
      userConfig.capitalAvailable,
      mergedExecutionConfig
    );

    const reports = this.reporter.generate(
      trades,
      userConfig.reportingIntervals,
      startDate,
      endDate,
      userConfig.capitalAvailable
    );

    const summary = this.calculateSummary(trades, capitalPath, userConfig, startDate, endDate);

    return {
      generatedAt: new Date(),
      config,
      summary,
      trades,
      reports,
      capitalPath,
      warnings
    };
  }

  private resolveDateRange(config: BacktestUserConfig): { startDate: Date; endDate: Date } {
    let endDate = config.endDate || new Date();
    let startDate: Date;

    if (config.startDate) {
      startDate = config.startDate;
    } else {
      const { type, value } = config.simulationDuration;
      switch (type) {
        case 'days':
          startDate = subDays(endDate, value);
          break;
        case 'weeks':
          startDate = subWeeks(endDate, value);
          break;
        case 'months':
          startDate = subMonths(endDate, value);
          break;
        case 'years':
          startDate = subYears(endDate, value);
          break;
        default:
          startDate = subMonths(endDate, 1);
      }
    }

    return { startDate, endDate };
  }

  private async simulate(
    snapshots: RealHistoricalSnapshot[],
    resolutionMap: Map<string, RealResolution>,
    initialCapital: number,
    config: BacktestExecutionConfig
  ): Promise<{
    trades: SimulatedTrade[];
    capitalPath: CapitalPathPoint[];
    warnings: string[];
  }> {
    const trades: SimulatedTrade[] = [];
    const capitalPath: CapitalPathPoint[] = [];
    const warnings: string[] = [];

    let capital = initialCapital;
    let availableCapital = initialCapital;
    const openPositions: Map<string, SimulatedPosition> = new Map();
    const cooldowns: Map<string, Date> = new Map();

    const sortedSnapshots = [...snapshots].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );

    let lastCapitalUpdate = sortedSnapshots[0]?.timestamp || new Date();

    for (const snapshot of sortedSnapshots) {
      const closedTrades = this.checkResolutions(
        snapshot.timestamp,
        openPositions,
        resolutionMap,
        config
      );

      for (const trade of closedTrades) {
        trades.push(trade);
        availableCapital += trade.payout || 0;
        capital = availableCapital;
        openPositions.delete(trade.marketPairId);
        cooldowns.set(trade.marketPairId, addDays(snapshot.timestamp, config.cooldownMs / 86400000));
      }

      if (snapshot.arbitrage.exists &&
          snapshot.arbitrage.profitPercent >= config.minProfitPercent) {

        if (openPositions.has(snapshot.marketPairId)) {
          continue;
        }

        const cooldownEnd = cooldowns.get(snapshot.marketPairId);
        if (cooldownEnd && snapshot.timestamp < cooldownEnd) {
          continue;
        }

        const resolution = resolutionMap.get(snapshot.marketPairId);
        if (config.requireResolutionAlignment && !resolution) {
          warnings.push(`No resolution data for ${snapshot.marketPairId}`);
          continue;
        }

        const maxPosition = availableCapital * config.maxPositionPercent;
        if (maxPosition < 10) {
          continue;
        }

        const positionSize = Math.min(maxPosition, availableCapital * 0.5);
        const slippage = this.calculateSlippage(
          positionSize,
          snapshot.arbitrage.profitPercent,
          config.slippageModel
        );

        const isYesNo = snapshot.arbitrage.direction === 'EXCHANGE1_YES_EXCHANGE2_NO';
        const exchange1Side: MarketOutcome = isYesNo ? 'YES' : 'NO';
        const exchange2Side: MarketOutcome = isYesNo ? 'NO' : 'YES';
        const exchange1EntryPrice = isYesNo ? snapshot.exchange1.yesPrice : snapshot.exchange1.noPrice;
        const exchange2EntryPrice = isYesNo ? snapshot.exchange2.noPrice : snapshot.exchange2.yesPrice;

        const position: SimulatedPosition = {
          id: `pos_${snapshot.marketPairId}_${snapshot.timestamp.getTime()}`,
          marketPairId: snapshot.marketPairId,
          marketPairDescription: snapshot.marketPairId,
          openedAt: snapshot.timestamp,
          direction: snapshot.arbitrage.direction,
          exchange1Side,
          exchange2Side,
          exchange1EntryPrice,
          exchange2EntryPrice,
          positionSize,
          entryProfitPercent: snapshot.arbitrage.profitPercent - slippage * 100,
          cost: positionSize,
          status: 'open'
        };

        openPositions.set(snapshot.marketPairId, position);
        availableCapital -= positionSize;
      }

      if (differenceInDays(snapshot.timestamp, lastCapitalUpdate) >= 1) {
        capitalPath.push({
          date: snapshot.timestamp,
          capital,
          openPositions: openPositions.size,
          availableCapital
        });
        lastCapitalUpdate = snapshot.timestamp;
      }
    }

    for (const [pairId, position] of openPositions) {
      trades.push({
        id: `trade_${position.id}`,
        marketPairId: pairId,
        marketPairDescription: position.marketPairDescription,
        entryDate: position.openedAt,
        direction: position.direction,
        entryProfitPercent: position.entryProfitPercent,
        positionSize: position.positionSize,
        cost: position.cost,
        outcome: 'pending',
        slippage: 0,
        fees: 0,
        notes: ['Position still open at end of simulation period']
      });
    }

    return { trades, capitalPath, warnings };
  }

  private checkResolutions(
    currentTime: Date,
    openPositions: Map<string, SimulatedPosition>,
    resolutionMap: Map<string, RealResolution>,
    config: BacktestExecutionConfig
  ): SimulatedTrade[] {
    const closedTrades: SimulatedTrade[] = [];

    for (const [pairId, position] of openPositions) {
      const resolution = resolutionMap.get(pairId);
      if (!resolution) continue;

      const resolvedAt1 = resolution.exchange1.resolvedAt;
      const resolvedAt2 = resolution.exchange2.resolvedAt;

      if (!resolvedAt1 && !resolvedAt2) continue;

      const resolvedAt = resolvedAt1 && resolvedAt2
        ? new Date(Math.max(resolvedAt1.getTime(), resolvedAt2.getTime()))
        : resolvedAt1 || resolvedAt2;

      if (!resolvedAt || currentTime < resolvedAt) continue;

      const trade = this.closePosition(position, resolution, config);
      closedTrades.push(trade);
    }

    return closedTrades;
  }

  private closePosition(
    position: SimulatedPosition,
    resolution: RealResolution,
    _config: BacktestExecutionConfig
  ): SimulatedTrade {
    const { exchange1, exchange2 } = resolution;

    if (exchange1.outcome === 'VOIDED' || exchange2.outcome === 'VOIDED') {
      return {
        id: `trade_${position.id}`,
        marketPairId: position.marketPairId,
        marketPairDescription: position.marketPairDescription,
        entryDate: position.openedAt,
        exitDate: resolution.exchange1.resolvedAt || resolution.exchange2.resolvedAt,
        direction: position.direction,
        entryProfitPercent: position.entryProfitPercent,
        positionSize: position.positionSize,
        cost: position.cost,
        payout: position.cost,
        profit: 0,
        actualProfitPercent: 0,
        outcome: 'voided',
        exchange1Resolution: exchange1.outcome,
        exchange2Resolution: exchange2.outcome,
        slippage: 0,
        fees: 0,
        notes: ['Market was voided - capital returned']
      };
    }

    if (exchange1.outcome === 'PENDING' || exchange2.outcome === 'PENDING') {
      return {
        id: `trade_${position.id}`,
        marketPairId: position.marketPairId,
        marketPairDescription: position.marketPairDescription,
        entryDate: position.openedAt,
        direction: position.direction,
        entryProfitPercent: position.entryProfitPercent,
        positionSize: position.positionSize,
        cost: position.cost,
        outcome: 'pending',
        exchange1Resolution: exchange1.outcome,
        exchange2Resolution: exchange2.outcome,
        slippage: 0,
        fees: 0,
        notes: ['Resolution still pending']
      };
    }

    // Arbitrage payout calculation:
    // Position is split evenly across two exchanges
    // On each exchange: contracts = (positionSize/2) / entryPrice
    // Payout = $1 per contract if side matches outcome, $0 otherwise

    const halfPosition = position.positionSize / 2;

    // Exchange 1: Buy exchange1Side at exchange1EntryPrice
    const exchange1Contracts = halfPosition / position.exchange1EntryPrice;
    const exchange1Won = position.exchange1Side === exchange1.outcome;
    const exchange1Payout = exchange1Won ? exchange1Contracts : 0;

    // Exchange 2: Buy exchange2Side at exchange2EntryPrice
    const exchange2Contracts = halfPosition / position.exchange2EntryPrice;
    const exchange2Won = position.exchange2Side === exchange2.outcome;
    const exchange2Payout = exchange2Won ? exchange2Contracts : 0;

    const totalPayout = exchange1Payout + exchange2Payout;
    const profit = totalPayout - position.cost;
    const actualProfitPercent = (profit / position.cost) * 100;

    let outcome: TradeOutcome;
    if (profit > 0.01) {
      outcome = 'win';
    } else if (profit < -0.01) {
      outcome = 'loss';
    } else {
      outcome = 'break_even';
    }

    const notes: string[] = [];
    if (resolution.sameOutcome === false) {
      notes.push(`DIVERGENT OUTCOME: Exchange 1=${exchange1.outcome}, Exchange 2=${exchange2.outcome}`);
    }

    return {
      id: `trade_${position.id}`,
      marketPairId: position.marketPairId,
      marketPairDescription: position.marketPairDescription,
      entryDate: position.openedAt,
      exitDate: resolution.exchange1.resolvedAt || resolution.exchange2.resolvedAt,
      direction: position.direction,
      entryProfitPercent: position.entryProfitPercent,
      actualProfitPercent,
      positionSize: position.positionSize,
      cost: position.cost,
      payout: totalPayout,
      profit,
      outcome,
      exchange1Resolution: exchange1.outcome,
      exchange2Resolution: exchange2.outcome,
      slippage: 0,
      fees: 0,
      notes
    };
  }

  private calculateSlippage(
    positionSize: number,
    profitPercent: number,
    model: string
  ): number {
    const factors = SLIPPAGE_FACTORS[model as keyof typeof SLIPPAGE_FACTORS] || SLIPPAGE_FACTORS.realistic;

    const baseSlippage = factors.base;
    const sizeImpact = (positionSize / 1000) * factors.sizeImpact;
    const profitImpact = (profitPercent / 10) * factors.profitImpact;

    return baseSlippage + sizeImpact + profitImpact;
  }

  private calculateSummary(
    trades: SimulatedTrade[],
    capitalPath: CapitalPathPoint[],
    config: BacktestUserConfig,
    startDate: Date,
    endDate: Date
  ): RealBacktestSummary {
    const closedTrades = trades.filter(t => t.outcome !== 'pending');
    const wins = closedTrades.filter(t => t.outcome === 'win').length;
    const losses = closedTrades.filter(t => t.outcome === 'loss').length;
    const pending = trades.filter(t => t.outcome === 'pending').length;

    const totalProfit = closedTrades.reduce((sum, t) => sum + (t.profit || 0), 0);
    const finalCapital = config.capitalAvailable + totalProfit;

    const durationDays = differenceInDays(endDate, startDate) || 1;
    const totalReturn = (totalProfit / config.capitalAvailable) * 100;
    const annualizedReturn = (totalReturn / durationDays) * 365;

    const returns = closedTrades.map(t => t.actualProfitPercent || 0);
    const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const variance = returns.length > 1
      ? returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1)
      : 0;
    const volatility = Math.sqrt(variance);

    const sharpeRatio = volatility > 0 ? (avgReturn / volatility) * Math.sqrt(52) : 0;

    const negativeReturns = returns.filter(r => r < 0);
    const downsideVariance = negativeReturns.length > 0
      ? negativeReturns.reduce((sum, r) => sum + r * r, 0) / negativeReturns.length
      : 0;
    const downsideDeviation = Math.sqrt(downsideVariance);
    const sortinoRatio = downsideDeviation > 0 ? (avgReturn / downsideDeviation) * Math.sqrt(52) : sharpeRatio;

    let maxDrawdown = 0;
    let maxDrawdownPercent = 0;
    let peak = config.capitalAvailable;
    for (const point of capitalPath) {
      if (point.capital > peak) {
        peak = point.capital;
      }
      const drawdown = peak - point.capital;
      const drawdownPercent = (drawdown / peak) * 100;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
        maxDrawdownPercent = drawdownPercent;
      }
    }

    const calmarRatio = maxDrawdownPercent > 0 ? annualizedReturn / maxDrawdownPercent : annualizedReturn;

    const resolutionTimes = closedTrades
      .filter(t => t.exitDate)
      .map(t => differenceInDays(t.exitDate!, t.entryDate));
    const avgResolutionTime = resolutionTimes.length > 0
      ? resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length
      : 0;

    const sameOutcomeCount = closedTrades.filter(t =>
      t.exchange1Resolution === t.exchange2Resolution &&
      t.exchange1Resolution !== 'VOIDED'
    ).length;
    const divergentCount = closedTrades.filter(t =>
      t.exchange1Resolution !== t.exchange2Resolution &&
      t.exchange1Resolution !== 'VOIDED' &&
      t.exchange2Resolution !== 'VOIDED'
    ).length;
    const voidedCount = closedTrades.filter(t => t.outcome === 'voided').length;

    return {
      config,
      period: {
        start: startDate,
        end: endDate,
        durationDays
      },
      performance: {
        initialCapital: config.capitalAvailable,
        finalCapital,
        netProfit: totalProfit,
        totalReturn,
        annualizedReturn
      },
      trading: {
        totalTrades: trades.length,
        wins,
        losses,
        pending,
        winRate: closedTrades.length > 0 ? (wins / closedTrades.length) * 100 : 0,
        avgProfitPerTrade: closedTrades.length > 0 ? totalProfit / closedTrades.length : 0,
        avgDaysToResolution: avgResolutionTime
      },
      risk: {
        sharpeRatio,
        sortinoRatio,
        calmarRatio,
        maxDrawdown,
        maxDrawdownPercent,
        volatility
      },
      resolution: {
        sameOutcomeRate: closedTrades.length > 0 ? (sameOutcomeCount / closedTrades.length) * 100 : 0,
        avgResolutionTime,
        voidedMarkets: voidedCount,
        divergentOutcomes: divergentCount
      }
    };
  }
}

export function createRealDataBacktestEngine(options: {
  store: HistoricalStore;
  resolutionTracker: ResolutionTracker;
}): RealDataBacktestEngine {
  return new RealDataBacktestEngine(options);
}
