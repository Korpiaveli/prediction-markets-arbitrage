import {
  CrossExchangeArbitrageOpportunity,
  PositionSizing
} from '@arb/core';

export type TurnoverStrategy = 'conservative' | 'balanced' | 'aggressive';

export interface TurnoverWeights {
  confidence: number;
  time: number;
  profit: number;
}

export interface StrategyConfig {
  name: TurnoverStrategy;
  weights: TurnoverWeights;
  minConfidence: number;
  maxDaysToResolution: number;
  minProfitPercent: number;
}

export const STRATEGY_PRESETS: Record<TurnoverStrategy, StrategyConfig> = {
  conservative: {
    name: 'conservative',
    weights: { confidence: 0.50, time: 0.30, profit: 0.20 },
    minConfidence: 90,
    maxDaysToResolution: 30,
    minProfitPercent: 1.5
  },
  balanced: {
    name: 'balanced',
    weights: { confidence: 0.40, time: 0.35, profit: 0.25 },
    minConfidence: 80,
    maxDaysToResolution: 60,
    minProfitPercent: 1.0
  },
  aggressive: {
    name: 'aggressive',
    weights: { confidence: 0.30, time: 0.45, profit: 0.25 },
    minConfidence: 70,
    maxDaysToResolution: 14,
    minProfitPercent: 0.5
  }
};

export interface RankedOpportunity {
  opportunity: CrossExchangeArbitrageOpportunity;
  turnoverScore: TurnoverScore;
  meetsStrategyRequirements: boolean;
  category: 'short_term' | 'medium_term' | 'long_term';
}

export interface TurnoverScore {
  overall: number;
  confidenceScore: number;
  timeScore: number;
  profitScore: number;
  annualizedReturn: number;
  turnsPerYear: number;
  expectedWinRate: number;
  compoundingFactor: number;
  daysToResolution: number;
}

export interface CompoundingProjection {
  startingCapital: number;
  endingCapital: number;
  totalReturn: number;
  returnPercent: number;
  expectedTrades: number;
  expectedWins: number;
  expectedLosses: number;
  confidenceInterval: {
    low: number;
    high: number;
  };
  period: 'monthly' | 'quarterly' | 'annual';
  strategy: TurnoverStrategy;
}

const WIN_RATE_BY_CONFIDENCE: { minConf: number; winRate: number }[] = [
  { minConf: 95, winRate: 0.99 },
  { minConf: 85, winRate: 0.95 },
  { minConf: 75, winRate: 0.90 },
  { minConf: 0, winRate: 0.80 }
];

const LOSS_MAGNITUDE = 0.50; // Assume 50% loss on bad matches

export class CapitalTurnoverRanker {
  private strategy: StrategyConfig;
  private customWeights?: TurnoverWeights;

  constructor(config: {
    strategy?: TurnoverStrategy;
    customWeights?: TurnoverWeights;
    capital?: number;
  } = {}) {
    this.strategy = STRATEGY_PRESETS[config.strategy || 'balanced'];
    this.customWeights = config.customWeights;
  }

  private getWeights(): TurnoverWeights {
    if (this.customWeights) {
      const total = this.customWeights.confidence + this.customWeights.time + this.customWeights.profit;
      return {
        confidence: this.customWeights.confidence / total,
        time: this.customWeights.time / total,
        profit: this.customWeights.profit / total
      };
    }
    return this.strategy.weights;
  }

  rank(opportunities: CrossExchangeArbitrageOpportunity[]): RankedOpportunity[] {
    const ranked = opportunities
      .map(opp => this.scoreOpportunity(opp))
      .sort((a, b) => b.turnoverScore.overall - a.turnoverScore.overall);

    return ranked;
  }

  rankFiltered(opportunities: CrossExchangeArbitrageOpportunity[]): RankedOpportunity[] {
    return this.rank(opportunities).filter(r => r.meetsStrategyRequirements);
  }

  getShortTermOpportunities(opportunities: CrossExchangeArbitrageOpportunity[]): RankedOpportunity[] {
    return this.rank(opportunities).filter(r => r.category === 'short_term');
  }

  getLongTermOpportunities(opportunities: CrossExchangeArbitrageOpportunity[]): RankedOpportunity[] {
    return this.rank(opportunities).filter(r => r.category === 'long_term');
  }

  private scoreOpportunity(opp: CrossExchangeArbitrageOpportunity): RankedOpportunity {
    const daysToRes = this.getDaysToResolution(opp);
    const confidenceScore = this.calculateConfidenceScore(opp);
    const timeScore = this.calculateTimeScore(daysToRes);
    const profitScore = this.calculateProfitScore(opp.profitPercent);

    const weights = this.getWeights();
    const overall =
      confidenceScore * weights.confidence +
      timeScore * weights.time +
      profitScore * weights.profit;

    const winRate = this.getExpectedWinRate(confidenceScore);
    const turnsPerYear = 365 / Math.max(1, daysToRes);
    const annualizedReturn = this.calculateAnnualizedReturn(
      opp.profitPercent, winRate, turnsPerYear
    );
    const compoundingFactor = this.calculateCompoundingFactor(
      opp.profitPercent, winRate, turnsPerYear
    );

    const category = this.categorizeByResolutionTime(daysToRes);

    return {
      opportunity: opp,
      turnoverScore: {
        overall,
        confidenceScore,
        timeScore,
        profitScore,
        annualizedReturn,
        turnsPerYear,
        expectedWinRate: winRate,
        compoundingFactor,
        daysToResolution: daysToRes
      },
      meetsStrategyRequirements: this.checkRequirements(opp, daysToRes, confidenceScore),
      category
    };
  }

  private getDaysToResolution(opp: CrossExchangeArbitrageOpportunity): number {
    const closeTime1 = opp.marketPair.market1.closeTime;
    const closeTime2 = opp.marketPair.market2.closeTime;

    if (!closeTime1 && !closeTime2) {
      return 365; // Default to 1 year if unknown
    }

    const now = new Date();
    let earliestClose: Date;

    if (closeTime1 && closeTime2) {
      earliestClose = new Date(Math.min(
        new Date(closeTime1).getTime(),
        new Date(closeTime2).getTime()
      ));
    } else {
      earliestClose = new Date(closeTime1 || closeTime2!);
    }

    const msPerDay = 1000 * 60 * 60 * 24;
    const days = Math.max(0, (earliestClose.getTime() - now.getTime()) / msPerDay);

    return Math.max(1, Math.round(days * 10) / 10); // Min 1 day, round to 0.1
  }

  private calculateConfidenceScore(opp: CrossExchangeArbitrageOpportunity): number {
    let score = opp.confidence;

    if (opp.resolutionAlignment) {
      if (opp.resolutionAlignment.sourcesMatch) score += 10;
      if (opp.resolutionAlignment.conditionsMatch) score += 10;
      if (opp.resolutionAlignment.temporalDistance !== undefined &&
          opp.resolutionAlignment.temporalDistance < 3) {
        score += 5;
      }
    }

    return Math.min(100, Math.max(0, score));
  }

  private calculateTimeScore(daysToResolution: number): number {
    // Exponential decay with 7-day half-life
    // 0 days = 100, 7 days = 36.8, 14 days = 13.5, 30 days = 1.4
    const score = 100 * Math.exp(-daysToResolution / 7);
    return Math.max(1, score); // Floor at 1 for very long-dated
  }

  private calculateProfitScore(profitPercent: number): number {
    // Normalize: 10% profit = 100 score
    return Math.min(100, profitPercent * 10);
  }

  private getExpectedWinRate(confidenceScore: number): number {
    for (const { minConf, winRate } of WIN_RATE_BY_CONFIDENCE) {
      if (confidenceScore >= minConf) return winRate;
    }
    return 0.80;
  }

  private calculateAnnualizedReturn(
    profitPercent: number,
    winRate: number,
    turnsPerYear: number
  ): number {
    // Expected profit per trade accounting for losses
    // Win: gain profitPercent, Loss: lose LOSS_MAGNITUDE (50%)
    const expectedProfitPerTrade =
      (profitPercent / 100 * winRate) - (LOSS_MAGNITUDE * (1 - winRate));

    // Compound over turnsPerYear
    const compoundingFactor = Math.pow(1 + expectedProfitPerTrade, turnsPerYear);
    return (compoundingFactor - 1) * 100;
  }

  private calculateCompoundingFactor(
    profitPercent: number,
    winRate: number,
    turnsPerYear: number
  ): number {
    const expectedProfitPerTrade =
      (profitPercent / 100 * winRate) - (LOSS_MAGNITUDE * (1 - winRate));
    return Math.pow(1 + expectedProfitPerTrade, turnsPerYear);
  }

  private checkRequirements(
    opp: CrossExchangeArbitrageOpportunity,
    daysToRes: number,
    confidenceScore: number
  ): boolean {
    return (
      confidenceScore >= this.strategy.minConfidence &&
      daysToRes <= this.strategy.maxDaysToResolution &&
      opp.profitPercent >= this.strategy.minProfitPercent &&
      opp.valid
    );
  }

  private categorizeByResolutionTime(days: number): 'short_term' | 'medium_term' | 'long_term' {
    if (days <= 14) return 'short_term';
    if (days <= 90) return 'medium_term';
    return 'long_term';
  }

  projectReturns(
    capital: number,
    period: 'monthly' | 'quarterly' | 'annual',
    opportunities: RankedOpportunity[]
  ): CompoundingProjection {
    const qualified = opportunities.filter(o => o.meetsStrategyRequirements);

    if (qualified.length === 0) {
      return {
        startingCapital: capital,
        endingCapital: capital,
        totalReturn: 0,
        returnPercent: 0,
        expectedTrades: 0,
        expectedWins: 0,
        expectedLosses: 0,
        confidenceInterval: { low: capital, high: capital },
        period,
        strategy: this.strategy.name
      };
    }

    // Calculate average metrics from qualified opportunities
    const avgProfitPercent = qualified.reduce((sum, o) => sum + o.opportunity.profitPercent, 0) / qualified.length;
    const avgWinRate = qualified.reduce((sum, o) => sum + o.turnoverScore.expectedWinRate, 0) / qualified.length;
    const avgDaysToRes = qualified.reduce((sum, o) => sum + o.turnoverScore.daysToResolution, 0) / qualified.length;

    const periodDays = period === 'monthly' ? 30 : period === 'quarterly' ? 90 : 365;
    const expectedTrades = Math.floor(periodDays / avgDaysToRes);

    const expectedWins = Math.round(expectedTrades * avgWinRate);
    const expectedLosses = expectedTrades - expectedWins;

    // Calculate expected ending capital
    let expectedCapital = capital;
    for (let i = 0; i < expectedWins; i++) {
      expectedCapital *= (1 + avgProfitPercent / 100);
    }
    for (let i = 0; i < expectedLosses; i++) {
      expectedCapital *= (1 - LOSS_MAGNITUDE);
    }

    // Calculate confidence interval (simple approximation)
    // Pessimistic: 20% more losses
    // Optimistic: 20% fewer losses
    const pessimisticLosses = Math.min(expectedTrades, Math.round(expectedLosses * 1.5));
    const pessimisticWins = expectedTrades - pessimisticLosses;
    let lowCapital = capital;
    for (let i = 0; i < pessimisticWins; i++) {
      lowCapital *= (1 + avgProfitPercent / 100);
    }
    for (let i = 0; i < pessimisticLosses; i++) {
      lowCapital *= (1 - LOSS_MAGNITUDE);
    }

    const optimisticLosses = Math.max(0, Math.round(expectedLosses * 0.5));
    const optimisticWins = expectedTrades - optimisticLosses;
    let highCapital = capital;
    for (let i = 0; i < optimisticWins; i++) {
      highCapital *= (1 + avgProfitPercent / 100);
    }
    for (let i = 0; i < optimisticLosses; i++) {
      highCapital *= (1 - LOSS_MAGNITUDE);
    }

    return {
      startingCapital: capital,
      endingCapital: Math.round(expectedCapital * 100) / 100,
      totalReturn: Math.round((expectedCapital - capital) * 100) / 100,
      returnPercent: Math.round((expectedCapital / capital - 1) * 10000) / 100,
      expectedTrades,
      expectedWins,
      expectedLosses,
      confidenceInterval: {
        low: Math.round(lowCapital * 100) / 100,
        high: Math.round(highCapital * 100) / 100
      },
      period,
      strategy: this.strategy.name
    };
  }

  calculatePositionSizing(
    opportunity: CrossExchangeArbitrageOpportunity,
    bankroll: number
  ): PositionSizing {
    const scored = this.scoreOpportunity(opportunity);
    const winRate = scored.turnoverScore.expectedWinRate;
    const profitPercent = opportunity.profitPercent / 100;

    // Kelly Criterion: f* = (p * b - q) / b
    // p = win probability, q = 1-p, b = win/loss ratio
    const p = winRate;
    const q = 1 - winRate;
    const b = profitPercent / LOSS_MAGNITUDE; // profit if win / loss if lose

    const kellyPercent = Math.max(0, (p * b - q) / b);
    const halfKellyPercent = kellyPercent / 2;

    // Cap at strategy-appropriate levels
    const maxPercent = this.strategy.name === 'conservative' ? 0.05 :
                       this.strategy.name === 'balanced' ? 0.10 : 0.15;

    const cappedKelly = Math.min(kellyPercent, maxPercent);
    const cappedHalfKelly = Math.min(halfKellyPercent, maxPercent / 2);

    return {
      kellyPercent: Math.round(cappedKelly * 10000) / 100,
      halfKellyPercent: Math.round(cappedHalfKelly * 10000) / 100,
      recommendedAmount: Math.round(bankroll * cappedHalfKelly * 100) / 100,
      maxRiskAmount: Math.round(bankroll * cappedKelly * 100) / 100
    };
  }

  enrichOpportunityWithMetrics(
    opp: CrossExchangeArbitrageOpportunity,
    bankroll?: number
  ): CrossExchangeArbitrageOpportunity {
    const scored = this.scoreOpportunity(opp);
    const positionSizing = bankroll
      ? this.calculatePositionSizing(opp, bankroll)
      : undefined;

    return {
      ...opp,
      turnoverMetrics: {
        daysToResolution: scored.turnoverScore.daysToResolution,
        turnsPerYear: scored.turnoverScore.turnsPerYear,
        annualizedReturn: Math.round(scored.turnoverScore.annualizedReturn * 100) / 100,
        capitalTurnoverScore: Math.round(scored.turnoverScore.overall * 100) / 100,
        expectedWinRate: scored.turnoverScore.expectedWinRate,
        positionSizing
      }
    };
  }

  getStatistics(opportunities: CrossExchangeArbitrageOpportunity[]): {
    totalOpportunities: number;
    shortTerm: number;
    mediumTerm: number;
    longTerm: number;
    avgAnnualizedReturn: number;
    avgDaysToResolution: number;
    avgConfidence: number;
    qualifiedCount: number;
  } {
    const ranked = this.rank(opportunities);
    const qualified = ranked.filter(r => r.meetsStrategyRequirements);

    return {
      totalOpportunities: opportunities.length,
      shortTerm: ranked.filter(r => r.category === 'short_term').length,
      mediumTerm: ranked.filter(r => r.category === 'medium_term').length,
      longTerm: ranked.filter(r => r.category === 'long_term').length,
      avgAnnualizedReturn: ranked.length > 0
        ? ranked.reduce((sum, r) => sum + r.turnoverScore.annualizedReturn, 0) / ranked.length
        : 0,
      avgDaysToResolution: ranked.length > 0
        ? ranked.reduce((sum, r) => sum + r.turnoverScore.daysToResolution, 0) / ranked.length
        : 0,
      avgConfidence: ranked.length > 0
        ? ranked.reduce((sum, r) => sum + r.turnoverScore.confidenceScore, 0) / ranked.length
        : 0,
      qualifiedCount: qualified.length
    };
  }
}
