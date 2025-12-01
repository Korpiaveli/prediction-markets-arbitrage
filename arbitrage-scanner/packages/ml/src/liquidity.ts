/**
 * Liquidity Depth Analysis
 *
 * Analyzes order book depth to assess execution feasibility:
 * - Available liquidity at current prices
 * - Price impact of large orders
 * - Market depth score (0-100)
 * - Optimal execution size
 */

import { Quote } from '@arb/core';

export interface LiquidityAnalysis {
  marketId: string;
  exchange: string;
  timestamp: Date;
  yesLiquidity: LiquiditySide;
  noLiquidity: LiquiditySide;
  depthScore: number; // 0-100, higher is better
  optimalSize: number; // Recommended max position size
  priceImpact: PriceImpactEstimate;
  quality: 'excellent' | 'good' | 'fair' | 'poor';
}

export interface LiquiditySide {
  bidDepth: number; // Total $ available at bid
  askDepth: number; // Total $ available at ask
  bidAskSpread: number; // Spread in %
  depthRatio: number; // bid/ask ratio
}

export interface PriceImpactEstimate {
  small: number; // Impact for $100 order (%)
  medium: number; // Impact for $1000 order (%)
  large: number; // Impact for $10000 order (%)
}

export interface ExecutionFeasibility {
  canExecute: boolean;
  maxSize: number;
  estimatedSlippage: number;
  warnings: string[];
  recommendation: 'execute' | 'reduce_size' | 'skip';
}

export class LiquidityAnalyzer {
  private readonly MIN_DEPTH_EXCELLENT = 10000; // $10k
  private readonly MIN_DEPTH_GOOD = 5000; // $5k
  private readonly MIN_DEPTH_FAIR = 1000; // $1k
  private readonly MAX_SPREAD_EXCELLENT = 0.01; // 1%
  private readonly MAX_SPREAD_GOOD = 0.02; // 2%
  private readonly MAX_SPREAD_FAIR = 0.05; // 5%

  /**
   * Analyze liquidity from quote data
   */
  analyze(quote: Quote): LiquidityAnalysis {
    const yesLiquidity = this.analyzeSide(quote.yes);
    const noLiquidity = this.analyzeSide(quote.no);

    const depthScore = this.calculateDepthScore(yesLiquidity, noLiquidity);
    const optimalSize = this.calculateOptimalSize(yesLiquidity, noLiquidity);
    const priceImpact = this.estimatePriceImpact(yesLiquidity, noLiquidity);
    const quality = this.assessQuality(depthScore, yesLiquidity, noLiquidity);

    return {
      marketId: quote.marketId,
      exchange: quote.exchange,
      timestamp: quote.timestamp,
      yesLiquidity,
      noLiquidity,
      depthScore,
      optimalSize,
      priceImpact,
      quality
    };
  }

  /**
   * Assess execution feasibility for a trade
   */
  assessExecution(
    analysis: LiquidityAnalysis,
    targetSize: number,
    side: 'yes' | 'no'
  ): ExecutionFeasibility {
    const liquidity = side === 'yes' ? analysis.yesLiquidity : analysis.noLiquidity;
    const availableDepth = liquidity.askDepth; // Buying, so look at ask
    const warnings: string[] = [];

    let canExecute = true;
    let maxSize = targetSize;
    let estimatedSlippage = 0;
    let recommendation: ExecutionFeasibility['recommendation'] = 'execute';

    if (targetSize > availableDepth) {
      canExecute = false;
      maxSize = availableDepth;
      warnings.push(`Insufficient liquidity: requested ${targetSize}, available ${availableDepth}`);
      recommendation = 'skip';
    } else if (targetSize > availableDepth * 0.5) {
      warnings.push('Large order relative to available depth - expect slippage');
      estimatedSlippage = this.estimateSlippage(targetSize, availableDepth);
      recommendation = 'reduce_size';
    }

    if (liquidity.bidAskSpread > this.MAX_SPREAD_FAIR) {
      warnings.push(`Wide spread: ${(liquidity.bidAskSpread * 100).toFixed(2)}%`);
      if (recommendation === 'execute') {
        recommendation = 'reduce_size';
      }
    }

    if (analysis.quality === 'poor') {
      warnings.push('Poor market quality');
      if (recommendation === 'execute') {
        recommendation = 'reduce_size';
      }
    }

    return {
      canExecute,
      maxSize,
      estimatedSlippage,
      warnings,
      recommendation
    };
  }

  /**
   * Analyze both sides of an arbitrage trade
   */
  assessArbitrage(
    kalshiAnalysis: LiquidityAnalysis,
    polymarketAnalysis: LiquidityAnalysis,
    targetInvestment: number
  ): {
    feasible: boolean;
    maxInvestment: number;
    totalSlippage: number;
    warnings: string[];
  } {
    const warnings: string[] = [];

    // Determine which side to buy on each exchange
    // This is simplified - real implementation would depend on arbitrage direction
    const kalshiExec = this.assessExecution(kalshiAnalysis, targetInvestment, 'yes');
    const polyExec = this.assessExecution(polymarketAnalysis, targetInvestment, 'no');

    const feasible = kalshiExec.canExecute && polyExec.canExecute;
    const maxInvestment = Math.min(kalshiExec.maxSize, polyExec.maxSize);
    const totalSlippage = kalshiExec.estimatedSlippage + polyExec.estimatedSlippage;

    warnings.push(...kalshiExec.warnings.map(w => `Kalshi: ${w}`));
    warnings.push(...polyExec.warnings.map(w => `Polymarket: ${w}`));

    if (!feasible) {
      warnings.push('⚠️ Insufficient liquidity on one or both exchanges');
    }

    if (totalSlippage > 0.02) {
      warnings.push(`⚠️ High combined slippage: ${(totalSlippage * 100).toFixed(2)}%`);
    }

    return {
      feasible,
      maxInvestment,
      totalSlippage,
      warnings
    };
  }

  private analyzeSide(priceLevel: Quote['yes']): LiquiditySide {
    const bidDepth = priceLevel.liquidity || 0;
    const askDepth = priceLevel.liquidity || 0;
    const spread = priceLevel.ask - priceLevel.bid;
    const bidAskSpread = priceLevel.mid > 0 ? spread / priceLevel.mid : 0;
    const depthRatio = askDepth > 0 ? bidDepth / askDepth : 0;

    return {
      bidDepth,
      askDepth,
      bidAskSpread,
      depthRatio
    };
  }

  private calculateDepthScore(yes: LiquiditySide, no: LiquiditySide): number {
    const avgDepth = (yes.askDepth + no.askDepth) / 2;
    const avgSpread = (yes.bidAskSpread + no.bidAskSpread) / 2;

    let score = 0;

    // Depth component (0-60 points)
    if (avgDepth >= this.MIN_DEPTH_EXCELLENT) {
      score += 60;
    } else if (avgDepth >= this.MIN_DEPTH_GOOD) {
      score += 45;
    } else if (avgDepth >= this.MIN_DEPTH_FAIR) {
      score += 30;
    } else {
      score += (avgDepth / this.MIN_DEPTH_FAIR) * 30;
    }

    // Spread component (0-40 points)
    if (avgSpread <= this.MAX_SPREAD_EXCELLENT) {
      score += 40;
    } else if (avgSpread <= this.MAX_SPREAD_GOOD) {
      score += 30;
    } else if (avgSpread <= this.MAX_SPREAD_FAIR) {
      score += 20;
    } else {
      score += Math.max(0, 20 - (avgSpread - this.MAX_SPREAD_FAIR) * 200);
    }

    return Math.min(100, Math.max(0, score));
  }

  private calculateOptimalSize(yes: LiquiditySide, no: LiquiditySide): number {
    const minDepth = Math.min(yes.askDepth, no.askDepth);
    // Conservative: use 30% of available depth to minimize slippage
    return minDepth * 0.3;
  }

  private estimatePriceImpact(yes: LiquiditySide, no: LiquiditySide): PriceImpactEstimate {
    const avgDepth = (yes.askDepth + no.askDepth) / 2;

    return {
      small: this.calculateImpact(100, avgDepth),
      medium: this.calculateImpact(1000, avgDepth),
      large: this.calculateImpact(10000, avgDepth)
    };
  }

  private calculateImpact(orderSize: number, availableDepth: number): number {
    if (availableDepth === 0) return 1.0; // 100% impact

    const utilization = orderSize / availableDepth;

    // Simplified quadratic price impact model
    // Real implementation would use actual order book data
    return Math.min(1.0, utilization * utilization * 0.1);
  }

  private estimateSlippage(orderSize: number, availableDepth: number): number {
    return this.calculateImpact(orderSize, availableDepth);
  }

  private assessQuality(
    score: number,
    yes: LiquiditySide,
    no: LiquiditySide
  ): LiquidityAnalysis['quality'] {
    const avgDepth = (yes.askDepth + no.askDepth) / 2;
    const avgSpread = (yes.bidAskSpread + no.bidAskSpread) / 2;

    if (score >= 75 && avgDepth >= this.MIN_DEPTH_GOOD && avgSpread <= this.MAX_SPREAD_GOOD) {
      return 'excellent';
    } else if (score >= 50 && avgDepth >= this.MIN_DEPTH_FAIR) {
      return 'good';
    } else if (score >= 25) {
      return 'fair';
    } else {
      return 'poor';
    }
  }
}
