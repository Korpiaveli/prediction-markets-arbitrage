/**
 * MonteCarloSimulator
 *
 * Simulates trading outcomes with true compounding to provide:
 * - Return distribution across many scenarios
 * - Risk metrics (probability of loss, max drawdown)
 * - Confidence intervals for projected returns
 * - Strategy comparison analysis
 */

import {
  MonteCarloConfig,
  MonteCarloResults,
  TurnoverStrategyType,
  DEFAULT_TURNOVER_STRATEGIES
} from './types';

export interface SimulationPath {
  finalCapital: number;
  peakCapital: number;
  maxDrawdown: number;
  trades: number;
  wins: number;
  losses: number;
  dailyReturns: number[];
}

export interface EnhancedMonteCarloConfig extends MonteCarloConfig {
  avgProfitPercent?: number;
  avgDaysToResolution?: number;
  lossPercent?: number;
  customWinRates?: Record<string, number>;
}

export interface StrategyComparison {
  strategy: TurnoverStrategyType;
  results: MonteCarloResults;
  recommendation: string;
}

const DEFAULT_LOSS_PERCENT = 50;

export class MonteCarloSimulator {
  private winRates: Record<string, number>;

  constructor(customWinRates?: Record<string, number>) {
    const defaultRates: Record<string, number> = {
      '95-100': 0.99,
      '85-94': 0.95,
      '75-84': 0.90,
      '<75': 0.80
    };
    this.winRates = customWinRates || defaultRates;
  }

  updateWinRates(rates: Record<string, number>): void {
    this.winRates = { ...this.winRates, ...rates };
  }

  simulate(config: EnhancedMonteCarloConfig): MonteCarloResults {
    const paths: SimulationPath[] = [];
    const strategy = DEFAULT_TURNOVER_STRATEGIES[config.strategy];

    const periodDays = config.period === 'monthly' ? 30 :
                       config.period === 'quarterly' ? 90 : 365;

    const avgDays = config.avgDaysToResolution ?? (strategy.maxDaysToResolution / 2);
    const avgProfit = config.avgProfitPercent ?? ((strategy.minProfitPercent + 3) / 2);
    const lossMagnitude = config.lossPercent ?? DEFAULT_LOSS_PERCENT;
    const winRate = this.getWinRateForStrategy(strategy.minConfidence);

    for (let i = 0; i < config.simulations; i++) {
      const path = this.runSimulation(
        config.capital,
        periodDays,
        avgDays,
        avgProfit,
        winRate,
        lossMagnitude
      );
      paths.push(path);
    }

    return this.aggregateResults(paths, config);
  }

  private runSimulation(
    startCapital: number,
    periodDays: number,
    avgDaysPerTrade: number,
    avgProfitPercent: number,
    winRate: number,
    lossPercent: number
  ): SimulationPath {
    let capital = startCapital;
    let peakCapital = startCapital;
    let maxDrawdown = 0;
    let day = 0;
    let trades = 0;
    let wins = 0;
    let losses = 0;
    const dailyReturns: number[] = [];

    while (day < periodDays) {
      // Random trade duration with some variance
      const tradeDays = Math.max(1, avgDaysPerTrade + (Math.random() - 0.5) * avgDaysPerTrade * 0.5);
      day += tradeDays;

      if (day > periodDays) break;

      // Determine outcome
      const isWin = Math.random() < winRate;
      trades++;

      const prevCapital = capital;
      if (isWin) {
        // Add some variance to profit
        const profitVariance = (Math.random() - 0.5) * 0.5;
        const actualProfit = avgProfitPercent * (1 + profitVariance);
        capital *= (1 + actualProfit / 100);
        wins++;
      } else {
        // Loss with some variance
        const lossVariance = (Math.random() - 0.5) * 0.3;
        const actualLoss = lossPercent * (1 + lossVariance);
        capital *= (1 - actualLoss / 100);
        losses++;
      }

      // Track drawdown
      if (capital > peakCapital) {
        peakCapital = capital;
      }
      const currentDrawdown = (peakCapital - capital) / peakCapital;
      if (currentDrawdown > maxDrawdown) {
        maxDrawdown = currentDrawdown;
      }

      // Record daily return (simplified - actual return at trade conclusion)
      dailyReturns.push((capital - prevCapital) / prevCapital);
    }

    return {
      finalCapital: capital,
      peakCapital,
      maxDrawdown,
      trades,
      wins,
      losses,
      dailyReturns
    };
  }

  private aggregateResults(
    paths: SimulationPath[],
    config: MonteCarloConfig
  ): MonteCarloResults {
    const finals = paths.map(p => p.finalCapital).sort((a, b) => a - b);
    const drawdowns = paths.map(p => p.maxDrawdown).sort((a, b) => a - b);
    const returns = paths.map(p => (p.finalCapital - config.capital) / config.capital);

    const mean = finals.reduce((sum, f) => sum + f, 0) / finals.length;
    const median = finals[Math.floor(finals.length / 2)];
    const min = finals[0];
    const max = finals[finals.length - 1];

    const variance = finals.reduce((sum, f) => sum + Math.pow(f - mean, 2), 0) / finals.length;
    const stdDev = Math.sqrt(variance);

    const percentiles: Record<number, number> = {
      1: finals[Math.floor(finals.length * 0.01)],
      5: finals[Math.floor(finals.length * 0.05)],
      10: finals[Math.floor(finals.length * 0.10)],
      25: finals[Math.floor(finals.length * 0.25)],
      50: median,
      75: finals[Math.floor(finals.length * 0.75)],
      90: finals[Math.floor(finals.length * 0.90)],
      95: finals[Math.floor(finals.length * 0.95)],
      99: finals[Math.floor(finals.length * 0.99)]
    };

    // Risk metrics
    const probabilityOfLoss = paths.filter(p => p.finalCapital < config.capital).length / paths.length;
    const probabilityOfDoubling = paths.filter(p => p.finalCapital >= config.capital * 2).length / paths.length;
    const expectedMaxDrawdown = drawdowns.reduce((sum, d) => sum + d, 0) / drawdowns.length;
    const worstDrawdown = drawdowns[drawdowns.length - 1];

    // Sharpe ratio approximation
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const returnStdDev = Math.sqrt(
      returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
    );
    const riskFreeRate = 0.05; // Assume 5% risk-free rate
    const periodMultiplier = config.period === 'monthly' ? 12 :
                             config.period === 'quarterly' ? 4 : 1;
    const sharpeRatio = returnStdDev > 0
      ? (avgReturn * periodMultiplier - riskFreeRate) / (returnStdDev * Math.sqrt(periodMultiplier))
      : 0;

    // Trade metrics
    const avgTrades = paths.reduce((sum, p) => sum + p.trades, 0) / paths.length;
    const avgWinRate = paths.reduce((sum, p) => sum + (p.trades > 0 ? p.wins / p.trades : 0), 0) / paths.length;
    const avgProfitPerTrade = avgTrades > 0 ? avgReturn / avgTrades : 0;

    return {
      config,
      profitDistribution: {
        min: Math.round(min * 100) / 100,
        max: Math.round(max * 100) / 100,
        mean: Math.round(mean * 100) / 100,
        median: Math.round(median * 100) / 100,
        stdDev: Math.round(stdDev * 100) / 100,
        percentiles: Object.fromEntries(
          Object.entries(percentiles).map(([k, v]) => [k, Math.round(v * 100) / 100])
        )
      },
      riskMetrics: {
        probabilityOfLoss: Math.round(probabilityOfLoss * 1000) / 1000,
        probabilityOfDoubling: Math.round(probabilityOfDoubling * 1000) / 1000,
        expectedMaxDrawdown: Math.round(expectedMaxDrawdown * 10000) / 100,
        worstDrawdown: Math.round(worstDrawdown * 10000) / 100,
        sharpeRatio: Math.round(sharpeRatio * 100) / 100
      },
      tradeMetrics: {
        avgTradesPerPeriod: Math.round(avgTrades * 10) / 10,
        avgWinRate: Math.round(avgWinRate * 1000) / 1000,
        avgProfitPerTrade: Math.round(avgProfitPerTrade * 10000) / 100
      }
    };
  }

  compareStrategies(
    capital: number,
    period: MonteCarloConfig['period'],
    simulations: number = 1000
  ): StrategyComparison[] {
    const strategies: TurnoverStrategyType[] = ['conservative', 'balanced', 'aggressive'];
    const comparisons: StrategyComparison[] = [];

    for (const strategy of strategies) {
      const config: EnhancedMonteCarloConfig = {
        simulations,
        period,
        capital,
        strategy,
        useHistoricalWinRates: true
      };

      const results = this.simulate(config);
      const recommendation = this.generateRecommendation(results, strategy);

      comparisons.push({ strategy, results, recommendation });
    }

    return comparisons.sort((a, b) =>
      b.results.riskMetrics.sharpeRatio - a.results.riskMetrics.sharpeRatio
    );
  }

  private generateRecommendation(results: MonteCarloResults, _strategy: TurnoverStrategyType): string {
    const recs: string[] = [];

    if (results.riskMetrics.probabilityOfLoss < 0.05) {
      recs.push('Very low risk of loss.');
    } else if (results.riskMetrics.probabilityOfLoss < 0.15) {
      recs.push('Moderate risk profile.');
    } else {
      recs.push('Higher risk - consider smaller positions.');
    }

    if (results.riskMetrics.sharpeRatio > 2) {
      recs.push('Excellent risk-adjusted returns.');
    } else if (results.riskMetrics.sharpeRatio > 1) {
      recs.push('Good risk-adjusted returns.');
    } else {
      recs.push('Risk-adjusted returns below market standards.');
    }

    if (results.riskMetrics.expectedMaxDrawdown > 30) {
      recs.push(`Expect ~${results.riskMetrics.expectedMaxDrawdown}% drawdown - ensure capital stability.`);
    }

    const expectedReturn = ((results.profitDistribution.median - results.config.capital) /
                           results.config.capital * 100).toFixed(1);
    recs.push(`Median return: ${expectedReturn}%.`);

    return recs.join(' ');
  }

  simulateWithEquityCurve(
    config: EnhancedMonteCarloConfig,
    numPaths: number = 100
  ): {
    results: MonteCarloResults;
    samplePaths: { day: number; capital: number }[][];
    confidenceBands: { day: number; p5: number; p25: number; p50: number; p75: number; p95: number }[];
  } {
    const periodDays = config.period === 'monthly' ? 30 :
                       config.period === 'quarterly' ? 90 : 365;
    const strategy = DEFAULT_TURNOVER_STRATEGIES[config.strategy];
    const avgDays = config.avgDaysToResolution ?? (strategy.maxDaysToResolution / 2);
    const avgProfit = config.avgProfitPercent ?? ((strategy.minProfitPercent + 3) / 2);
    const lossMagnitude = config.lossPercent ?? DEFAULT_LOSS_PERCENT;
    const winRate = this.getWinRateForStrategy(strategy.minConfidence);

    // Generate daily capital paths
    const dailyPaths: number[][] = [];

    for (let i = 0; i < config.simulations; i++) {
      const path = this.runDailySimulation(
        config.capital,
        periodDays,
        avgDays,
        avgProfit,
        winRate,
        lossMagnitude
      );
      dailyPaths.push(path);
    }

    // Sample paths for visualization
    const samplePaths = dailyPaths.slice(0, numPaths).map(path =>
      path.map((capital, day) => ({ day, capital }))
    );

    // Calculate confidence bands
    const confidenceBands: { day: number; p5: number; p25: number; p50: number; p75: number; p95: number }[] = [];

    for (let day = 0; day <= periodDays; day++) {
      const values = dailyPaths.map(p => p[Math.min(day, p.length - 1)]).sort((a, b) => a - b);
      confidenceBands.push({
        day,
        p5: values[Math.floor(values.length * 0.05)],
        p25: values[Math.floor(values.length * 0.25)],
        p50: values[Math.floor(values.length * 0.50)],
        p75: values[Math.floor(values.length * 0.75)],
        p95: values[Math.floor(values.length * 0.95)]
      });
    }

    // Run standard simulation for results
    const results = this.simulate(config);

    return { results, samplePaths, confidenceBands };
  }

  private runDailySimulation(
    startCapital: number,
    periodDays: number,
    avgDaysPerTrade: number,
    avgProfitPercent: number,
    winRate: number,
    lossPercent: number
  ): number[] {
    const dailyCapital: number[] = [startCapital];
    let capital = startCapital;
    let day = 0;
    let nextTradeDay = Math.random() * avgDaysPerTrade;

    for (let d = 1; d <= periodDays; d++) {
      day = d;

      if (day >= nextTradeDay) {
        const isWin = Math.random() < winRate;
        if (isWin) {
          const profitVariance = (Math.random() - 0.5) * 0.5;
          capital *= (1 + avgProfitPercent * (1 + profitVariance) / 100);
        } else {
          const lossVariance = (Math.random() - 0.5) * 0.3;
          capital *= (1 - lossPercent * (1 + lossVariance) / 100);
        }
        nextTradeDay = day + avgDaysPerTrade + (Math.random() - 0.5) * avgDaysPerTrade * 0.5;
      }

      dailyCapital.push(capital);
    }

    return dailyCapital;
  }

  getWinRateForStrategy(minConfidence: number): number {
    if (minConfidence >= 95) return this.winRates['95-100'] || 0.99;
    if (minConfidence >= 85) return this.winRates['85-94'] || 0.95;
    if (minConfidence >= 75) return this.winRates['75-84'] || 0.90;
    return this.winRates['<75'] || 0.80;
  }

  calculateBreakEvenProbability(
    config: EnhancedMonteCarloConfig,
    targetReturn: number = 0
  ): number {
    const results = this.simulate(config);
    const targetCapital = config.capital * (1 + targetReturn);

    // Use percentile interpolation
    const percentiles = results.profitDistribution.percentiles;
    const sortedPercentiles = Object.entries(percentiles)
      .sort(([a], [b]) => Number(a) - Number(b));

    for (let i = 0; i < sortedPercentiles.length - 1; i++) {
      const [pctLow, valLow] = sortedPercentiles[i];
      const [pctHigh, valHigh] = sortedPercentiles[i + 1];

      if (valLow <= targetCapital && targetCapital <= valHigh) {
        const ratio = (targetCapital - valLow) / (valHigh - valLow);
        return 1 - ((Number(pctLow) + ratio * (Number(pctHigh) - Number(pctLow))) / 100);
      }
    }

    return targetCapital < results.profitDistribution.min ? 1 :
           targetCapital > results.profitDistribution.max ? 0 : 0.5;
  }
}
