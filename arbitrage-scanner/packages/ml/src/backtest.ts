/**
 * Backtesting Engine
 *
 * Simulates trading strategies on historical data to:
 * - Validate arbitrage detection accuracy
 * - Test execution strategies
 * - Measure risk-adjusted returns
 * - Optimize parameters
 */

import { ArbitrageOpportunity } from '@arb/core';

export interface BacktestConfig {
  startDate: Date;
  endDate: Date;
  initialCapital: number;
  maxPositionSize: number;
  minProfitPercent: number;
  slippageModel: 'conservative' | 'realistic' | 'optimistic';
  executionDelay: number; // Seconds between detection and execution
}

export interface Trade {
  id: string;
  timestamp: Date;
  opportunity: ArbitrageOpportunity;
  executed: boolean;
  entryPrice: { kalshi: number; polymarket: number };
  exitPrice?: { kalshi: number; polymarket: number };
  investmentSize: number;
  actualProfit: number;
  actualProfitPercent: number;
  fees: number;
  slippage: number;
  outcome: 'win' | 'loss' | 'break_even' | 'pending';
  executionNotes: string[];
}

export interface BacktestResult {
  config: BacktestConfig;
  period: { start: Date; end: Date };
  totalTrades: number;
  executedTrades: number;
  skippedTrades: number;
  wins: number;
  losses: number;
  breakEven: number;
  totalProfit: number;
  totalFees: number;
  totalSlippage: number;
  finalCapital: number;
  returnPercent: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  avgProfit: number;
  avgLoss: number;
  profitFactor: number;
  trades: Trade[];
  equity: { timestamp: Date; value: number }[];
  insights: string[];
}

export interface StrategyParams {
  minProfit: number;
  maxRisk: number;
  requireResolutionAlignment: boolean;
  minResolutionScore?: number;
  minLiquidityScore?: number;
}

export class BacktestEngine {
  constructor() {
    // Future: integrate liquidity analyzer
  }

  /**
   * Run backtest on historical opportunities
   */
  run(
    opportunities: ArbitrageOpportunity[],
    config: BacktestConfig,
    strategyParams?: StrategyParams
  ): BacktestResult {
    const filtered = this.filterOpportunities(opportunities, config);
    const trades: Trade[] = [];
    const equity: { timestamp: Date; value: number }[] = [];

    let capital = config.initialCapital;
    equity.push({ timestamp: config.startDate, value: capital });

    for (const opp of filtered) {
      // Apply strategy filters
      if (strategyParams && !this.passesStrategy(opp, strategyParams)) {
        const reason = strategyParams.minProfit ? `Profit below ${strategyParams.minProfit}%` : 'Strategy filter';
        trades.push(this.createSkippedTrade(opp, reason));
        continue;
      }

      // Check liquidity
      const liquidityCheck = this.checkLiquidity(opp, config.maxPositionSize);
      if (!liquidityCheck.canExecute) {
        trades.push(this.createSkippedTrade(opp, liquidityCheck.reason || 'Liquidity check failed'));
        continue;
      }

      // Execute trade
      const trade = this.executeTrade(opp, capital, config, liquidityCheck.maxSize);
      trades.push(trade);

      if (trade.executed) {
        capital += trade.actualProfit - trade.fees;
        equity.push({ timestamp: trade.timestamp, value: capital });
      }
    }

    return this.calculateResults(trades, equity, config);
  }

  /**
   * Optimize strategy parameters using historical data
   */
  optimizeParameters(
    opportunities: ArbitrageOpportunity[],
    config: BacktestConfig,
    paramRanges: {
      minProfit: number[];
      maxRisk: number[];
      minResolutionScore: number[];
    }
  ): { params: StrategyParams; result: BacktestResult }[] {
    const results: { params: StrategyParams; result: BacktestResult }[] = [];

    for (const minProfit of paramRanges.minProfit) {
      for (const maxRisk of paramRanges.maxRisk) {
        for (const minResolutionScore of paramRanges.minResolutionScore) {
          const params: StrategyParams = {
            minProfit,
            maxRisk,
            requireResolutionAlignment: true,
            minResolutionScore
          };

          const result = this.run(opportunities, config, params);
          results.push({ params, result });
        }
      }
    }

    return results.sort((a, b) => b.result.sharpeRatio - a.result.sharpeRatio);
  }

  private filterOpportunities(
    opportunities: ArbitrageOpportunity[],
    config: BacktestConfig
  ): ArbitrageOpportunity[] {
    return opportunities
      .filter(o =>
        o.timestamp >= config.startDate &&
        o.timestamp <= config.endDate &&
        o.profitPercent >= config.minProfitPercent
      )
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  private passesStrategy(opp: ArbitrageOpportunity, params: StrategyParams): boolean {
    if (opp.profitPercent < params.minProfit) return false;

    if (params.requireResolutionAlignment) {
      if (!opp.resolutionAlignment) return false;
      const alignmentScore = opp.resolutionAlignment?.score ?? 0;
      if (params.minResolutionScore && alignmentScore < params.minResolutionScore) {
        return false;
      }
    }

    return true;
  }

  private checkLiquidity(
    opp: ArbitrageOpportunity,
    maxSize: number
  ): { canExecute: boolean; maxSize: number; reason?: string } {
    // Simplified - in reality would use actual quote data
    const available = opp.maxSize || 1000;

    if (available < 100) {
      return { canExecute: false, maxSize: 0, reason: 'Insufficient liquidity' };
    }

    return {
      canExecute: true,
      maxSize: Math.min(maxSize, available)
    };
  }

  private executeTrade(
    opp: ArbitrageOpportunity,
    availableCapital: number,
    config: BacktestConfig,
    maxSize: number
  ): Trade {
    const investmentSize = Math.min(maxSize, availableCapital * 0.5); // Max 50% of capital per trade

    if (investmentSize < 100) {
      return this.createSkippedTrade(opp, 'Insufficient capital');
    }

    const slippage = this.calculateSlippage(opp, investmentSize, config.slippageModel);
    const fees = opp.fees.totalFees;
    const grossProfit = (opp.profitPercent / 100) * investmentSize;
    const actualProfit = grossProfit - fees - slippage * investmentSize;
    const actualProfitPercent = (actualProfit / investmentSize) * 100;

    return {
      id: `trade-${opp.id}`,
      timestamp: new Date(opp.timestamp.getTime() + config.executionDelay * 1000),
      opportunity: opp,
      executed: true,
      entryPrice: {
        kalshi: opp.quotePair.kalshi.yes.ask,
        polymarket: opp.quotePair.polymarket.no.ask
      },
      investmentSize,
      actualProfit,
      actualProfitPercent,
      fees,
      slippage: slippage * investmentSize,
      outcome: actualProfit > 0.01 ? 'win' : actualProfit < -0.01 ? 'loss' : 'break_even',
      executionNotes: [`Slippage: ${(slippage * 100).toFixed(3)}%`]
    };
  }

  private createSkippedTrade(opp: ArbitrageOpportunity, reason: string): Trade {
    return {
      id: `trade-${opp.id}`,
      timestamp: opp.timestamp,
      opportunity: opp,
      executed: false,
      entryPrice: {
        kalshi: opp.quotePair.kalshi.yes.ask,
        polymarket: opp.quotePair.polymarket.no.ask
      },
      investmentSize: 0,
      actualProfit: 0,
      actualProfitPercent: 0,
      fees: 0,
      slippage: 0,
      outcome: 'pending',
      executionNotes: [`Skipped: ${reason}`]
    };
  }

  private calculateSlippage(
    opp: ArbitrageOpportunity,
    size: number,
    model: BacktestConfig['slippageModel']
  ): number {
    const maxSlippage = opp.maxSize || 1000;
    const utilization = size / maxSlippage;

    let baseSlippage = utilization * 0.01; // 1% per full utilization

    switch (model) {
      case 'conservative':
        return baseSlippage * 1.5;
      case 'realistic':
        return baseSlippage;
      case 'optimistic':
        return baseSlippage * 0.5;
    }
  }

  private calculateResults(
    trades: Trade[],
    equity: { timestamp: Date; value: number }[],
    config: BacktestConfig
  ): BacktestResult {
    const executed = trades.filter(t => t.executed);
    const wins = executed.filter(t => t.outcome === 'win');
    const losses = executed.filter(t => t.outcome === 'loss');
    const breakEven = executed.filter(t => t.outcome === 'break_even');

    const totalProfit = executed.reduce((sum, t) => sum + t.actualProfit, 0);
    const totalFees = executed.reduce((sum, t) => sum + t.fees, 0);
    const totalSlippage = executed.reduce((sum, t) => sum + t.slippage, 0);

    const finalCapital = equity[equity.length - 1].value;
    const returnPercent = ((finalCapital - config.initialCapital) / config.initialCapital) * 100;

    const returns = equity.slice(1).map((e, i) =>
      (e.value - equity[i].value) / equity[i].value
    );
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const stdReturn = Math.sqrt(
      returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
    );
    const sharpeRatio = stdReturn > 0 ? avgReturn / stdReturn : 0;

    const maxDrawdown = this.calculateMaxDrawdown(equity);
    const winRate = executed.length > 0 ? wins.length / executed.length : 0;

    const avgProfit = wins.length > 0
      ? wins.reduce((sum, t) => sum + t.actualProfit, 0) / wins.length
      : 0;
    const avgLoss = losses.length > 0
      ? Math.abs(losses.reduce((sum, t) => sum + t.actualProfit, 0) / losses.length)
      : 0;
    const profitFactor = avgLoss > 0 ? (wins.length * avgProfit) / (losses.length * avgLoss) : 0;

    const insights = this.generateInsights({
      totalTrades: trades.length,
      executedTrades: executed.length,
      winRate,
      returnPercent,
      sharpeRatio,
      maxDrawdown,
      totalFees,
      totalSlippage
    });

    return {
      config,
      period: { start: config.startDate, end: config.endDate },
      totalTrades: trades.length,
      executedTrades: executed.length,
      skippedTrades: trades.length - executed.length,
      wins: wins.length,
      losses: losses.length,
      breakEven: breakEven.length,
      totalProfit,
      totalFees,
      totalSlippage,
      finalCapital,
      returnPercent,
      sharpeRatio: sharpeRatio * Math.sqrt(252), // Annualized
      maxDrawdown,
      winRate,
      avgProfit,
      avgLoss,
      profitFactor,
      trades,
      equity,
      insights
    };
  }

  private calculateMaxDrawdown(equity: { timestamp: Date; value: number }[]): number {
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

  private generateInsights(stats: {
    totalTrades: number;
    executedTrades: number;
    winRate: number;
    returnPercent: number;
    sharpeRatio: number;
    maxDrawdown: number;
    totalFees: number;
    totalSlippage: number;
  }): string[] {
    const insights: string[] = [];

    insights.push(`Executed ${stats.executedTrades} of ${stats.totalTrades} opportunities`);
    insights.push(`Win rate: ${(stats.winRate * 100).toFixed(1)}%`);
    insights.push(`Total return: ${stats.returnPercent.toFixed(2)}%`);
    insights.push(`Sharpe ratio: ${stats.sharpeRatio.toFixed(2)}`);
    insights.push(`Max drawdown: ${(stats.maxDrawdown * 100).toFixed(2)}%`);

    if (stats.winRate < 0.5) {
      insights.push('⚠️ Low win rate - consider stricter filtering');
    }

    if (stats.sharpeRatio < 1) {
      insights.push('⚠️ Low risk-adjusted returns');
    } else if (stats.sharpeRatio > 2) {
      insights.push('✅ Excellent risk-adjusted returns');
    }

    if (stats.maxDrawdown > 0.2) {
      insights.push('⚠️ High drawdown - reduce position sizes');
    }

    const feeImpact = (stats.totalFees / (stats.totalFees + stats.totalSlippage + Math.abs(stats.returnPercent))) * 100;
    if (feeImpact > 30) {
      insights.push(`⚠️ Fees represent ${feeImpact.toFixed(1)}% of costs - significant drag`);
    }

    return insights;
  }
}
