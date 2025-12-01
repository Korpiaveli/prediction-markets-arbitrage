/**
 * Trading Strategy Evaluator
 *
 * Evaluates trading strategies, calculates position sizing,
 * and provides risk management recommendations.
 */

import { ArbitrageOpportunity } from '@arb/core';
import Decimal from 'decimal.js';

export interface PositionSize {
  kalshiAmount: number;          // USD to invest in Kalshi
  polymarketAmount: number;      // USD to invest in Polymarket
  totalCapital: number;          // Total USD required
  expectedProfit: number;        // Expected profit in USD
  expectedReturn: number;        // Expected return percentage
  riskScore: number;             // 0-100 (0=safe, 100=risky)
  maxLoss: number;               // Maximum potential loss
  recommendation: 'execute' | 'reduce' | 'skip';
  reasoning: string[];
}

export interface RiskMetrics {
  sharpeRatio: number;           // Risk-adjusted return
  maxDrawdown: number;           // Maximum portfolio decline
  winRate: number;               // Percentage of profitable trades
  profitFactor: number;          // Gross profit / gross loss
  averageProfit: number;         // Average profit per trade
  averageLoss: number;           // Average loss per trade
  totalTrades: number;
  consecutiveLosses: number;
  volatility: number;            // Standard deviation of returns
}

export interface StrategySignal {
  action: 'strong_buy' | 'buy' | 'hold' | 'avoid';
  confidence: number;            // 0-100
  positionSize: PositionSize;
  riskMetrics: RiskMetrics;
  timing: {
    immediateExecution: boolean;
    delayMinutes?: number;
    expiryMinutes: number;
  };
  warnings: string[];
}

export interface StrategyConfig {
  maxPositionSize: number;       // Max USD per position
  maxPortfolioRisk: number;      // Max % of portfolio at risk
  minProfitPercent: number;      // Minimum profit threshold
  maxRiskScore: number;          // Maximum acceptable risk score
  kellyFraction: number;         // Kelly criterion fraction (0.25 = quarter Kelly)
  stopLossPercent: number;       // Stop loss threshold
  takeProfitPercent: number;     // Take profit threshold
}

const DEFAULT_CONFIG: StrategyConfig = {
  maxPositionSize: 1000,
  maxPortfolioRisk: 0.02,        // 2% of portfolio
  minProfitPercent: 2.0,
  maxRiskScore: 40,
  kellyFraction: 0.25,           // Conservative quarter-Kelly
  stopLossPercent: -5.0,
  takeProfitPercent: 10.0
};

export class TradingStrategyEvaluator {
  private config: StrategyConfig;
  private historicalTrades: Array<{ profit: number; timestamp: Date }> = [];

  constructor(config: Partial<StrategyConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Evaluate an opportunity and generate trading signal
   */
  evaluateOpportunity(
    opportunity: ArbitrageOpportunity,
    availableCapital: number,
    currentRisk: number = 0
  ): StrategySignal {
    const positionSize = this.calculatePositionSize(
      opportunity,
      availableCapital,
      currentRisk
    );

    const riskMetrics = this.calculateRiskMetrics();

    const timing = this.determineExecutionTiming(opportunity, riskMetrics);

    const { action, confidence, warnings } = this.generateSignal(
      opportunity,
      positionSize,
      riskMetrics
    );

    return {
      action,
      confidence,
      positionSize,
      riskMetrics,
      timing,
      warnings
    };
  }

  /**
   * Calculate optimal position size using Kelly Criterion
   */
  calculatePositionSize(
    opportunity: ArbitrageOpportunity,
    availableCapital: number,
    currentRisk: number
  ): PositionSize {
    const profitPercent = opportunity.profitPercent;
    const riskScore = this.assessRiskScore(opportunity);

    // Kelly Criterion: f = (bp - q) / b
    // where b = odds (profit/loss ratio), p = win probability, q = loss probability
    const winProbability = Math.max(0.5, (100 - riskScore) / 100);
    const lossProbability = 1 - winProbability;
    const oddsRatio = profitPercent / 100; // Simplified

    const kellyFraction = (oddsRatio * winProbability - lossProbability) / oddsRatio;
    const adjustedKelly = Math.max(0, kellyFraction * this.config.kellyFraction);

    // Calculate base position size
    let baseSize = availableCapital * adjustedKelly;

    // Apply constraints
    baseSize = Math.min(baseSize, this.config.maxPositionSize);
    baseSize = Math.min(baseSize, availableCapital * (this.config.maxPortfolioRisk - currentRisk));

    // Adjust for risk score
    const riskMultiplier = 1 - (riskScore / 100) * 0.5;
    const finalSize = baseSize * riskMultiplier;

    // Split between exchanges based on prices
    const kalshiPrice = opportunity.quotePair.kalshi.yes.mid;
    const polyPrice = opportunity.quotePair.polymarket.yes.mid;
    const totalPrice = kalshiPrice + polyPrice;

    const kalshiAmount = (finalSize * polyPrice) / totalPrice;
    const polymarketAmount = (finalSize * kalshiPrice) / totalPrice;

    const expectedProfit = finalSize * (profitPercent / 100);
    const maxLoss = this.estimateMaxLoss(finalSize, riskScore);

    const recommendation = this.getRecommendation(
      finalSize,
      profitPercent,
      riskScore,
      maxLoss
    );

    const reasoning = this.generateReasoning(
      finalSize,
      availableCapital,
      profitPercent,
      riskScore,
      winProbability
    );

    return {
      kalshiAmount: new Decimal(kalshiAmount).toDecimalPlaces(2).toNumber(),
      polymarketAmount: new Decimal(polymarketAmount).toDecimalPlaces(2).toNumber(),
      totalCapital: new Decimal(finalSize).toDecimalPlaces(2).toNumber(),
      expectedProfit: new Decimal(expectedProfit).toDecimalPlaces(2).toNumber(),
      expectedReturn: new Decimal(profitPercent).toDecimalPlaces(2).toNumber(),
      riskScore,
      maxLoss: new Decimal(maxLoss).toDecimalPlaces(2).toNumber(),
      recommendation,
      reasoning
    };
  }

  /**
   * Assess risk score for an opportunity
   */
  private assessRiskScore(opportunity: ArbitrageOpportunity): number {
    let riskScore = 0;

    // Market liquidity risk
    const minVolume = Math.min(
      opportunity.marketPair.kalshiMarket.volume24h || 0,
      opportunity.marketPair.polymarketMarket.volume24h || 0
    );
    if (minVolume < 1000) riskScore += 25;
    else if (minVolume < 10000) riskScore += 15;
    else if (minVolume < 50000) riskScore += 5;

    // Price deviation risk
    const kalshiPrice = opportunity.quotePair.kalshi.yes.mid;
    const polyPrice = opportunity.quotePair.polymarket.yes.mid;
    const priceDiff = Math.abs(kalshiPrice - polyPrice);
    if (priceDiff > 30) riskScore += 20;
    else if (priceDiff > 20) riskScore += 10;
    else if (priceDiff > 10) riskScore += 5;

    // Confidence risk (if available)
    const confidence = (opportunity as any).confidence || 70;
    if (confidence < 50) riskScore += 30;
    else if (confidence < 70) riskScore += 15;
    else if (confidence < 85) riskScore += 5;

    // Time to expiration risk
    if (opportunity.marketPair.kalshiMarket.closeTime) {
      const hoursToClose = (opportunity.marketPair.kalshiMarket.closeTime.getTime() - Date.now()) / (1000 * 60 * 60);
      if (hoursToClose < 1) riskScore += 30;
      else if (hoursToClose < 6) riskScore += 15;
      else if (hoursToClose < 24) riskScore += 5;
    }

    return Math.min(100, riskScore);
  }

  /**
   * Estimate maximum potential loss
   */
  private estimateMaxLoss(positionSize: number, riskScore: number): number {
    // Base loss from slippage and fees
    const baseLoss = positionSize * 0.02; // 2% slippage + fees

    // Risk-adjusted loss (higher risk = higher potential loss)
    const riskMultiplier = 1 + (riskScore / 100);

    return baseLoss * riskMultiplier;
  }

  /**
   * Get position recommendation
   */
  private getRecommendation(
    positionSize: number,
    profitPercent: number,
    riskScore: number,
    maxLoss: number
  ): 'execute' | 'reduce' | 'skip' {
    if (positionSize < 10) return 'skip';
    if (profitPercent < this.config.minProfitPercent) return 'skip';
    if (riskScore > this.config.maxRiskScore) return 'skip';
    if (maxLoss > positionSize * 0.1) return 'reduce';

    return 'execute';
  }

  /**
   * Generate reasoning for position size
   */
  private generateReasoning(
    positionSize: number,
    availableCapital: number,
    profitPercent: number,
    riskScore: number,
    winProbability: number
  ): string[] {
    const reasons: string[] = [];

    const percentOfCapital = (positionSize / availableCapital) * 100;
    reasons.push(`Position: ${percentOfCapital.toFixed(1)}% of available capital`);

    reasons.push(`Win probability: ${(winProbability * 100).toFixed(0)}%`);

    if (riskScore < 20) {
      reasons.push('Low risk - safe to execute');
    } else if (riskScore < 40) {
      reasons.push('Moderate risk - proceed with caution');
    } else {
      reasons.push('High risk - consider reducing position');
    }

    if (profitPercent > 5) {
      reasons.push('High profit potential');
    } else if (profitPercent > 3) {
      reasons.push('Good profit potential');
    } else {
      reasons.push('Minimal profit - consider waiting for better opportunity');
    }

    return reasons;
  }

  /**
   * Calculate comprehensive risk metrics
   */
  calculateRiskMetrics(): RiskMetrics {
    if (this.historicalTrades.length === 0) {
      return {
        sharpeRatio: 0,
        maxDrawdown: 0,
        winRate: 0,
        profitFactor: 0,
        averageProfit: 0,
        averageLoss: 0,
        totalTrades: 0,
        consecutiveLosses: 0,
        volatility: 0
      };
    }

    const profits = this.historicalTrades.map(t => t.profit);
    const wins = profits.filter(p => p > 0);
    const losses = profits.filter(p => p < 0);

    const totalProfit = wins.reduce((sum, p) => sum + p, 0);
    const totalLoss = Math.abs(losses.reduce((sum, p) => sum + p, 0));

    const avgProfit = wins.length > 0 ? totalProfit / wins.length : 0;
    const avgLoss = losses.length > 0 ? totalLoss / losses.length : 0;

    const winRate = (wins.length / profits.length) * 100;
    const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? Infinity : 0;

    const avgReturn = profits.reduce((sum, p) => sum + p, 0) / profits.length;
    const variance = profits.reduce((sum, p) => sum + Math.pow(p - avgReturn, 2), 0) / profits.length;
    const volatility = Math.sqrt(variance);

    const sharpeRatio = volatility > 0 ? avgReturn / volatility : 0;

    const maxDrawdown = this.calculateMaxDrawdown(profits);
    const consecutiveLosses = this.calculateConsecutiveLosses(profits);

    return {
      sharpeRatio: new Decimal(sharpeRatio).toDecimalPlaces(2).toNumber(),
      maxDrawdown: new Decimal(maxDrawdown).toDecimalPlaces(2).toNumber(),
      winRate: new Decimal(winRate).toDecimalPlaces(1).toNumber(),
      profitFactor: new Decimal(profitFactor).toDecimalPlaces(2).toNumber(),
      averageProfit: new Decimal(avgProfit).toDecimalPlaces(2).toNumber(),
      averageLoss: new Decimal(avgLoss).toDecimalPlaces(2).toNumber(),
      totalTrades: profits.length,
      consecutiveLosses,
      volatility: new Decimal(volatility).toDecimalPlaces(2).toNumber()
    };
  }

  /**
   * Determine optimal execution timing
   */
  private determineExecutionTiming(
    opportunity: ArbitrageOpportunity,
    metrics: RiskMetrics
  ) {
    const closeTime = opportunity.marketPair.kalshiMarket.closeTime;
    const minutesToClose = closeTime
      ? (closeTime.getTime() - Date.now()) / (1000 * 60)
      : Infinity;

    // Immediate execution if:
    // 1. High profit and low risk
    // 2. Close to expiration
    // 3. Good recent performance
    const highProfit = opportunity.profitPercent > 4;
    const nearExpiry = minutesToClose < 60;
    const goodPerformance = metrics.winRate > 70 && metrics.sharpeRatio > 1;

    const immediateExecution = highProfit || nearExpiry || goodPerformance;

    return {
      immediateExecution,
      delayMinutes: immediateExecution ? 0 : 5,
      expiryMinutes: Math.min(minutesToClose, 120)
    };
  }

  /**
   * Generate trading signal
   */
  private generateSignal(
    opportunity: ArbitrageOpportunity,
    positionSize: PositionSize,
    metrics: RiskMetrics
  ): { action: StrategySignal['action']; confidence: number; warnings: string[] } {
    const warnings: string[] = [];
    let action: StrategySignal['action'] = 'hold';
    let confidence = 50;

    if (positionSize.recommendation === 'skip') {
      action = 'avoid';
      confidence = 20;
      warnings.push('Position size too small or risk too high');
      return { action, confidence, warnings };
    }

    if (opportunity.profitPercent > 5 && positionSize.riskScore < 30) {
      action = 'strong_buy';
      confidence = 90;
    } else if (opportunity.profitPercent > 3 && positionSize.riskScore < 50) {
      action = 'buy';
      confidence = 70;
    } else if (opportunity.profitPercent > this.config.minProfitPercent) {
      action = 'buy';
      confidence = 55;
    } else {
      action = 'avoid';
      confidence = 30;
      warnings.push('Profit below minimum threshold');
    }

    if (metrics.consecutiveLosses >= 3) {
      warnings.push(`${metrics.consecutiveLosses} consecutive losses - consider pause`);
      confidence = Math.max(20, confidence - 20);
    }

    if (metrics.winRate < 50 && metrics.totalTrades > 10) {
      warnings.push('Historical win rate below 50%');
      confidence = Math.max(20, confidence - 15);
    }

    if (positionSize.riskScore > 60) {
      warnings.push('High risk score - reduce position or skip');
      action = action === 'strong_buy' ? 'buy' : action === 'buy' ? 'hold' : action;
      confidence = Math.max(20, confidence - 25);
    }

    return { action, confidence, warnings };
  }

  /**
   * Calculate maximum drawdown
   */
  private calculateMaxDrawdown(profits: number[]): number {
    let peak = 0;
    let maxDrawdown = 0;
    let cumulative = 0;

    for (const profit of profits) {
      cumulative += profit;
      if (cumulative > peak) {
        peak = cumulative;
      }
      const drawdown = peak - cumulative;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    return maxDrawdown;
  }

  /**
   * Calculate consecutive losses
   */
  private calculateConsecutiveLosses(profits: number[]): number {
    let maxConsecutive = 0;
    let currentConsecutive = 0;

    for (let i = profits.length - 1; i >= 0; i--) {
      if (profits[i] < 0) {
        currentConsecutive++;
        maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
      } else {
        break;
      }
    }

    return currentConsecutive;
  }

  /**
   * Record a completed trade
   */
  recordTrade(profit: number, timestamp: Date = new Date()): void {
    this.historicalTrades.push({ profit, timestamp });

    // Keep only last 100 trades
    if (this.historicalTrades.length > 100) {
      this.historicalTrades = this.historicalTrades.slice(-100);
    }
  }

  /**
   * Get current strategy configuration
   */
  getConfig(): StrategyConfig {
    return { ...this.config };
  }

  /**
   * Update strategy configuration
   */
  updateConfig(updates: Partial<StrategyConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}
