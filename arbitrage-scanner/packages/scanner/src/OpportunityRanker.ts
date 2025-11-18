import { ArbitrageOpportunity } from '@arb/core';

export interface RankingCriteria {
  profitWeight: number;
  liquidityWeight: number;
  confidenceWeight: number;
  ttlWeight: number;
}

export class OpportunityRanker {
  private criteria: RankingCriteria;

  constructor(criteria?: Partial<RankingCriteria>) {
    this.criteria = {
      profitWeight: 0.4,
      liquidityWeight: 0.3,
      confidenceWeight: 0.2,
      ttlWeight: 0.1,
      ...criteria
    };
  }

  /**
   * Rank opportunities by composite score
   */
  rank(opportunities: ArbitrageOpportunity[]): ArbitrageOpportunity[] {
    const scored = opportunities.map(opp => ({
      opportunity: opp,
      score: this.calculateScore(opp)
    }));

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    return scored.map(item => item.opportunity);
  }

  /**
   * Calculate composite score for an opportunity
   */
  private calculateScore(opp: ArbitrageOpportunity): number {
    const profitScore = this.normalizeProfit(opp.profitPercent);
    const liquidityScore = this.normalizeLiquidity(opp.maxSize);
    const confidenceScore = opp.confidence / 100;
    const ttlScore = this.normalizeTTL(opp.ttl);

    return (
      profitScore * this.criteria.profitWeight +
      liquidityScore * this.criteria.liquidityWeight +
      confidenceScore * this.criteria.confidenceWeight +
      ttlScore * this.criteria.ttlWeight
    );
  }

  /**
   * Normalize profit percentage to 0-1 scale
   */
  private normalizeProfit(profitPercent: number): number {
    // Cap at 10% for normalization
    return Math.min(profitPercent / 10, 1);
  }

  /**
   * Normalize liquidity/size to 0-1 scale
   */
  private normalizeLiquidity(maxSize: number): number {
    // Normalize based on typical max size (e.g., 1000 contracts)
    return Math.min(maxSize / 1000, 1);
  }

  /**
   * Normalize TTL to 0-1 scale (higher is better)
   */
  private normalizeTTL(ttl: number): number {
    // TTL in seconds, normalize based on 60 seconds
    return Math.min(ttl / 60, 1);
  }

  /**
   * Filter opportunities by minimum criteria
   */
  filter(
    opportunities: ArbitrageOpportunity[],
    minProfit: number = 0.1,
    minSize: number = 1,
    minConfidence: number = 50
  ): ArbitrageOpportunity[] {
    return opportunities.filter(opp =>
      opp.profitPercent >= minProfit &&
      opp.maxSize >= minSize &&
      opp.confidence >= minConfidence
    );
  }

  /**
   * Group opportunities by direction
   */
  groupByDirection(
    opportunities: ArbitrageOpportunity[]
  ): Map<string, ArbitrageOpportunity[]> {
    const groups = new Map<string, ArbitrageOpportunity[]>();

    for (const opp of opportunities) {
      const existing = groups.get(opp.direction) || [];
      existing.push(opp);
      groups.set(opp.direction, existing);
    }

    return groups;
  }

  /**
   * Get top N opportunities
   */
  getTop(
    opportunities: ArbitrageOpportunity[],
    n: number = 10
  ): ArbitrageOpportunity[] {
    const ranked = this.rank(opportunities);
    return ranked.slice(0, n);
  }

  /**
   * Calculate aggregate statistics
   */
  getStatistics(opportunities: ArbitrageOpportunity[]): {
    count: number;
    avgProfit: number;
    totalPotentialProfit: number;
    avgConfidence: number;
    depthDistribution: Record<string, number>;
  } {
    if (opportunities.length === 0) {
      return {
        count: 0,
        avgProfit: 0,
        totalPotentialProfit: 0,
        avgConfidence: 0,
        depthDistribution: {}
      };
    }

    const count = opportunities.length;
    const avgProfit = opportunities.reduce((sum, opp) => sum + opp.profitPercent, 0) / count;
    const totalPotentialProfit = opportunities.reduce((sum, opp) => sum + opp.profitDollars, 0);
    const avgConfidence = opportunities.reduce((sum, opp) => sum + opp.confidence, 0) / count;

    const depthDistribution: Record<string, number> = {
      DEEP: 0,
      MEDIUM: 0,
      SHALLOW: 0
    };

    for (const opp of opportunities) {
      depthDistribution[opp.liquidity.depthQuality]++;
    }

    return {
      count,
      avgProfit,
      totalPotentialProfit,
      avgConfidence,
      depthDistribution
    };
  }
}