import {
  KellyPositionSize,
  TurnoverStrategyType,
  ConfidenceBucketStats,
  DEFAULT_WIN_RATES
} from './types.js';

/**
 * Position sizing calculator using Kelly Criterion and strategy-appropriate limits.
 *
 * Kelly Criterion: f* = (p * b - q) / b
 * Where:
 *   f* = fraction of bankroll to bet
 *   p = probability of winning
 *   q = probability of losing (1 - p)
 *   b = odds (profit if win / loss if lose)
 */
export class PositionSizer {
  private winRates: ConfidenceBucketStats[];

  constructor(historicalWinRates?: ConfidenceBucketStats[]) {
    this.winRates = historicalWinRates || DEFAULT_WIN_RATES;
  }

  /**
   * Calculate Kelly-based position sizing for an opportunity
   */
  calculate(params: {
    profitPercent: number;
    confidence: number;
    bankroll: number;
    strategy: TurnoverStrategyType;
    lossPercent?: number;  // Default 50% (bad match loses half)
  }): KellyPositionSize {
    const { profitPercent, confidence, bankroll, strategy } = params;
    const lossPercent = params.lossPercent || 50;

    // Get win rate from confidence bucket
    const winRate = this.getWinRateForConfidence(confidence);

    // Kelly Criterion calculation
    const p = winRate;
    const q = 1 - p;
    const b = (profitPercent / 100) / (lossPercent / 100);

    // f* = (p * b - q) / b
    let fullKelly = (p * b - q) / b;

    // Clamp negative Kelly (don't bet)
    fullKelly = Math.max(0, fullKelly);

    // Apply strategy-specific caps
    const maxPercent = this.getMaxPercentForStrategy(strategy);

    const cappedFullKelly = Math.min(fullKelly, maxPercent);
    const halfKelly = cappedFullKelly / 2;
    const quarterKelly = cappedFullKelly / 4;

    // Determine recommended based on strategy
    let recommendedPercent: number;
    let reasoning: string;

    if (strategy === 'conservative') {
      recommendedPercent = quarterKelly;
      reasoning = `Conservative strategy recommends quarter-Kelly (${(quarterKelly * 100).toFixed(1)}% of bankroll). ` +
        `With ${(winRate * 100).toFixed(0)}% expected win rate and ${profitPercent.toFixed(1)}% profit potential, ` +
        `this minimizes drawdown risk while maintaining positive expected value.`;
    } else if (strategy === 'aggressive') {
      recommendedPercent = halfKelly;
      reasoning = `Aggressive strategy recommends half-Kelly (${(halfKelly * 100).toFixed(1)}% of bankroll). ` +
        `With ${(winRate * 100).toFixed(0)}% expected win rate, this maximizes growth while staying below full Kelly risk.`;
    } else {
      // Balanced
      recommendedPercent = halfKelly * 0.75; // 3/8 Kelly for balanced
      reasoning = `Balanced strategy recommends ${((halfKelly * 0.75) * 100).toFixed(1)}% of bankroll (between quarter and half Kelly). ` +
        `This balances growth potential with acceptable drawdown risk.`;
    }

    // Calculate dollar amounts
    const recommendedAmount = bankroll * recommendedPercent;
    const maxRiskAmount = bankroll * cappedFullKelly;

    return {
      fullKellyPercent: Math.round(cappedFullKelly * 10000) / 100,
      halfKellyPercent: Math.round(halfKelly * 10000) / 100,
      quarterKellyPercent: Math.round(quarterKelly * 10000) / 100,
      recommendedPercent: Math.round(recommendedPercent * 10000) / 100,
      recommendedAmount: Math.round(recommendedAmount * 100) / 100,
      maxRiskAmount: Math.round(maxRiskAmount * 100) / 100,
      reasoning
    };
  }

  /**
   * Calculate position sizes for multiple opportunities
   */
  calculateBatch(
    opportunities: Array<{ id: string; profitPercent: number; confidence: number }>,
    bankroll: number,
    strategy: TurnoverStrategyType
  ): Map<string, KellyPositionSize> {
    const results = new Map<string, KellyPositionSize>();

    for (const opp of opportunities) {
      results.set(opp.id, this.calculate({
        profitPercent: opp.profitPercent,
        confidence: opp.confidence,
        bankroll,
        strategy
      }));
    }

    return results;
  }

  /**
   * Calculate optimal allocation across multiple simultaneous opportunities
   * Uses fractional Kelly to avoid over-allocation
   */
  calculatePortfolioAllocation(
    opportunities: Array<{ id: string; profitPercent: number; confidence: number }>,
    bankroll: number,
    strategy: TurnoverStrategyType,
    maxTotalExposure: number = 0.5  // Max 50% of bankroll deployed at once
  ): Array<{ id: string; allocation: number; percent: number }> {
    // Calculate individual Kelly fractions
    const kellySizes = this.calculateBatch(opportunities, bankroll, strategy);

    // Sum all recommended percentages
    let totalKelly = 0;
    for (const [, size] of kellySizes) {
      totalKelly += size.recommendedPercent / 100;
    }

    // Scale factor to keep total within maxTotalExposure
    const scaleFactor = totalKelly > maxTotalExposure
      ? maxTotalExposure / totalKelly
      : 1;

    // Apply scaling
    const allocations: Array<{ id: string; allocation: number; percent: number }> = [];

    for (const opp of opportunities) {
      const size = kellySizes.get(opp.id)!;
      const scaledPercent = (size.recommendedPercent / 100) * scaleFactor;
      allocations.push({
        id: opp.id,
        allocation: Math.round(bankroll * scaledPercent * 100) / 100,
        percent: Math.round(scaledPercent * 10000) / 100
      });
    }

    return allocations.sort((a, b) => b.allocation - a.allocation);
  }

  /**
   * Get expected win rate for a given confidence score
   */
  private getWinRateForConfidence(confidence: number): number {
    for (const bucket of this.winRates) {
      if (confidence >= bucket.minConfidence && confidence <= bucket.maxConfidence) {
        return bucket.winRate;
      }
    }
    // Default fallback
    return 0.80;
  }

  /**
   * Get maximum position size percentage for a strategy
   */
  private getMaxPercentForStrategy(strategy: TurnoverStrategyType): number {
    switch (strategy) {
      case 'conservative':
        return 0.05;  // Max 5% per position
      case 'balanced':
        return 0.10;  // Max 10% per position
      case 'aggressive':
        return 0.15;  // Max 15% per position
      default:
        return 0.10;
    }
  }

  /**
   * Update win rates from historical data
   */
  updateWinRates(newRates: ConfidenceBucketStats[]): void {
    this.winRates = newRates;
  }

  /**
   * Get current win rate configuration
   */
  getWinRates(): ConfidenceBucketStats[] {
    return [...this.winRates];
  }

  /**
   * Calculate expected value for an opportunity
   */
  calculateExpectedValue(
    profitPercent: number,
    confidence: number,
    positionSize: number,
    lossPercent: number = 50
  ): { ev: number; evPercent: number } {
    const winRate = this.getWinRateForConfidence(confidence);
    const winAmount = positionSize * (profitPercent / 100);
    const lossAmount = positionSize * (lossPercent / 100);

    const ev = (winRate * winAmount) - ((1 - winRate) * lossAmount);
    const evPercent = (ev / positionSize) * 100;

    return {
      ev: Math.round(ev * 100) / 100,
      evPercent: Math.round(evPercent * 100) / 100
    };
  }

  /**
   * Calculate risk of ruin (probability of losing X% of bankroll)
   */
  calculateRiskOfRuin(
    confidence: number,
    profitPercent: number,
    positionPercent: number,
    ruinThreshold: number = 0.5,  // 50% loss = "ruin"
    maxTrades: number = 100
  ): number {
    const winRate = this.getWinRateForConfidence(confidence);
    const lossPercent = 50;

    // Monte Carlo simulation for risk of ruin
    const simulations = 10000;
    let ruinCount = 0;

    for (let sim = 0; sim < simulations; sim++) {
      let capital = 1.0;  // Normalized to 1

      for (let trade = 0; trade < maxTrades && capital > ruinThreshold; trade++) {
        const isWin = Math.random() < winRate;
        if (isWin) {
          capital *= (1 + (profitPercent / 100) * positionPercent);
        } else {
          capital *= (1 - (lossPercent / 100) * positionPercent);
        }
      }

      if (capital <= ruinThreshold) {
        ruinCount++;
      }
    }

    return ruinCount / simulations;
  }
}
