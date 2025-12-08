/**
 * Recommendation Engine
 *
 * Analyzes arbitrage opportunities and generates ranked recommendations
 * based on profit potential, time-to-resolution, and resolution confidence.
 *
 * Scoring: overall = timeScore × 0.35 + profitScore × 0.35 + confidenceScore × 0.30
 */

import { ArbitrageOpportunity, CrossExchangeArbitrageOpportunity } from '@arb/core';
import { ResolutionRiskPredictor } from './resolution';
import { PatternAnalyzer } from './patterns';
import {
  Recommendation,
  RecommendationReport,
  RecommendationScore,
  RecommendationWeights,
  RecommendationConfig,
  RecommendationFilters,
  ReportSummary,
  CategoryPerformance,
  SimilarOpportunity,
  RiskLevel
} from './types';

type AnyOpportunity = ArbitrageOpportunity | CrossExchangeArbitrageOpportunity;

const DEFAULT_WEIGHTS: RecommendationWeights = {
  time: 0.35,
  profit: 0.35,
  confidence: 0.30
};

const DEFAULT_FILTERS: RecommendationFilters = {
  minScore: 0,
  minProfit: 0,
  maxHoursToResolution: undefined,
  categories: undefined,
  riskLevels: undefined,
  exchanges: undefined
};

const DEFAULT_CONFIG: RecommendationConfig = {
  weights: DEFAULT_WEIGHTS,
  filters: DEFAULT_FILTERS,
  topN: 10,
  includeHistoricalContext: true,
  includeReasoning: true
};

export class RecommendationEngine {
  private readonly resolutionPredictor: ResolutionRiskPredictor;
  private readonly patternAnalyzer: PatternAnalyzer;
  private readonly config: RecommendationConfig;
  private historicalOpportunities: AnyOpportunity[] = [];
  private categoryPerformanceCache: Map<string, CategoryPerformance> = new Map();

  constructor(config: Partial<RecommendationConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      weights: { ...DEFAULT_WEIGHTS, ...config.weights },
      filters: { ...DEFAULT_FILTERS, ...config.filters }
    };
    this.resolutionPredictor = new ResolutionRiskPredictor();
    this.resolutionPredictor.useDefaultModel();
    this.patternAnalyzer = new PatternAnalyzer();
  }

  /**
   * Get pattern analyzer for advanced analysis
   */
  getPatternAnalyzer(): PatternAnalyzer {
    return this.patternAnalyzer;
  }

  /**
   * Ensure timestamp is a Date object
   */
  private ensureDate(value: Date | string | number): Date {
    if (value instanceof Date) return value;
    return new Date(value);
  }

  /**
   * Get timestamp from opportunity, handling string timestamps from JSON
   */
  private getTimestamp(opportunity: AnyOpportunity): Date {
    return this.ensureDate(opportunity.timestamp);
  }

  /**
   * Load historical opportunities for context analysis
   */
  loadHistoricalData(opportunities: AnyOpportunity[]): void {
    this.historicalOpportunities = opportunities;
    this.buildCategoryPerformanceCache();
  }

  /**
   * Generate ranked recommendations from opportunities
   */
  generateRecommendations(opportunities: AnyOpportunity[]): Recommendation[] {
    const scored = opportunities
      .map((opp, index) => this.createRecommendation(opp, index))
      .filter(rec => this.passesFilters(rec))
      .sort((a, b) => b.score.overall - a.score.overall);

    return scored.slice(0, this.config.topN).map((rec, index) => ({
      ...rec,
      rank: index + 1
    }));
  }

  /**
   * Generate complete recommendation report
   */
  generateReport(opportunities: AnyOpportunity[]): RecommendationReport {
    const recommendations = this.generateRecommendations(opportunities);
    const summary = this.generateSummary(recommendations, opportunities.length);

    return {
      generatedAt: new Date(),
      totalOpportunities: opportunities.length,
      totalRecommended: recommendations.length,
      recommendations,
      summary,
      filters: this.config.filters,
      config: this.config
    };
  }

  /**
   * Score a single opportunity
   */
  scoreOpportunity(opportunity: AnyOpportunity): RecommendationScore {
    const hoursToResolution = this.getHoursToResolution(opportunity);
    const timeScore = this.calculateTimeScore(hoursToResolution);
    const profitScore = this.calculateProfitScore(opportunity.profitPercent);
    const confidenceScore = this.calculateConfidenceScore(opportunity);

    const overall =
      timeScore * this.config.weights.time +
      profitScore * this.config.weights.profit +
      confidenceScore * this.config.weights.confidence;

    return {
      overall: Math.round(overall * 100) / 100,
      timeScore: Math.round(timeScore * 100) / 100,
      profitScore: Math.round(profitScore * 100) / 100,
      confidenceScore: Math.round(confidenceScore * 100) / 100,
      weights: this.config.weights
    };
  }

  /**
   * Get historical context for an opportunity
   */
  getHistoricalContext(opportunity: AnyOpportunity): {
    categoryPerformance: CategoryPerformance | null;
    similarOpportunities: SimilarOpportunity[];
  } {
    const category = this.getCategory(opportunity);
    const categoryPerformance = this.categoryPerformanceCache.get(category) || null;
    const similarOpportunities = this.findSimilarOpportunities(opportunity);

    return { categoryPerformance, similarOpportunities };
  }

  /**
   * Calculate time score (faster resolution = higher)
   * Uses exponential decay with 168h (1 week) half-life
   */
  private calculateTimeScore(hoursToResolution: number | null): number {
    if (hoursToResolution === null || hoursToResolution < 0) {
      return 50; // Unknown = neutral score
    }
    // timeScore = 100 × e^(-hours / 168)
    return 100 * Math.exp(-hoursToResolution / 168);
  }

  /**
   * Calculate profit score
   * profitScore = min(100, profitPercent × 10)
   */
  private calculateProfitScore(profitPercent: number): number {
    return Math.min(100, Math.max(0, profitPercent * 10));
  }

  /**
   * Calculate confidence score based on resolution alignment
   */
  private calculateConfidenceScore(opportunity: AnyOpportunity): number {
    let baseScore = 70; // Default confidence

    if (opportunity.resolutionAlignment) {
      baseScore = opportunity.resolutionAlignment.score;

      if (opportunity.resolutionAlignment.sourcesMatch) {
        baseScore += 10;
      }
      if (opportunity.resolutionAlignment.conditionsMatch) {
        baseScore += 10;
      }
    }

    // Use ML predictor for additional adjustment
    if (opportunity.confidence) {
      const confidenceAdjustment = (opportunity.confidence - 70) * 0.2;
      baseScore += confidenceAdjustment;
    }

    return Math.min(100, Math.max(0, baseScore));
  }

  /**
   * Get hours until market resolution
   */
  private getHoursToResolution(opportunity: AnyOpportunity): number | null {
    const closeTime = this.getCloseTime(opportunity);
    if (!closeTime) return null;

    const now = Date.now();
    const closeMs = closeTime.getTime();
    if (closeMs <= now) return 0;

    return (closeMs - now) / (1000 * 60 * 60);
  }

  /**
   * Get close time from opportunity (handles both types)
   */
  private getCloseTime(opportunity: AnyOpportunity): Date | null {
    const pair = opportunity.marketPair as any;

    // CrossExchangePair uses market1/market2
    if (pair.market1?.closeTime) {
      return new Date(pair.market1.closeTime);
    }
    // MarketPair uses kalshiMarket/polymarketMarket
    if (pair.kalshiMarket?.closeTime) {
      return new Date(pair.kalshiMarket.closeTime);
    }

    return null;
  }

  /**
   * Get category from opportunity
   */
  private getCategory(opportunity: AnyOpportunity): string {
    const pair = opportunity.marketPair as any;
    return pair.market1?.metadata?.category ||
           pair.kalshiMarket?.metadata?.category ||
           'unknown';
  }

  /**
   * Get market titles
   */
  private getMarketTitles(opportunity: AnyOpportunity): { market1: string; market2: string } {
    const pair = opportunity.marketPair as any;

    if (pair.market1 && pair.market2) {
      return {
        market1: pair.market1.title || pair.market1.question || 'Unknown',
        market2: pair.market2.title || pair.market2.question || 'Unknown'
      };
    }

    return {
      market1: pair.kalshiMarket?.title || pair.kalshiMarket?.question || 'Unknown',
      market2: pair.polymarketMarket?.title || pair.polymarketMarket?.question || 'Unknown'
    };
  }

  /**
   * Get exchange names
   */
  private getExchangeNames(opportunity: AnyOpportunity): { exchange1: string; exchange2: string } {
    const pair = opportunity.marketPair as any;

    if (pair.exchange1Name && pair.exchange2Name) {
      return {
        exchange1: pair.exchange1Name,
        exchange2: pair.exchange2Name
      };
    }

    return {
      exchange1: 'Kalshi',
      exchange2: 'Polymarket'
    };
  }

  /**
   * Determine risk level from risk score
   */
  private getRiskLevel(riskScore: number): RiskLevel {
    if (riskScore < 15) return 'low';
    if (riskScore < 30) return 'medium';
    if (riskScore < 50) return 'high';
    return 'critical';
  }

  /**
   * Get risk factors for an opportunity
   */
  private getRiskFactors(opportunity: AnyOpportunity): string[] {
    const factors: string[] = [];

    if (!opportunity.resolutionAlignment) {
      factors.push('No resolution alignment data');
    } else {
      if (!opportunity.resolutionAlignment.sourcesMatch) {
        factors.push('Different resolution sources');
      }
      if (opportunity.resolutionAlignment.score < 70) {
        factors.push('Low alignment score');
      }
    }

    if (opportunity.confidence && opportunity.confidence < 70) {
      factors.push('Low match confidence');
    }

    const hoursToRes = this.getHoursToResolution(opportunity);
    if (hoursToRes !== null && hoursToRes < 24) {
      factors.push('Close to resolution - limited time to execute');
    }

    if (opportunity.liquidity) {
      const liq = opportunity.liquidity as any;
      if (liq.depthQuality === 'SHALLOW') {
        factors.push('Shallow liquidity');
      }
    }

    return factors;
  }

  /**
   * Generate reasoning explanations
   */
  private generateReasoning(
    opportunity: AnyOpportunity,
    score: RecommendationScore,
    hoursToRes: number | null,
    categoryPerf: CategoryPerformance | null
  ): string[] {
    const reasons: string[] = [];

    // Profit reasoning
    if (opportunity.profitPercent >= 5) {
      reasons.push(`High profit (${opportunity.profitPercent.toFixed(1)}%) with excellent potential`);
    } else if (opportunity.profitPercent >= 3) {
      reasons.push(`Good profit (${opportunity.profitPercent.toFixed(1)}%) above average`);
    } else {
      reasons.push(`Modest profit (${opportunity.profitPercent.toFixed(1)}%)`);
    }

    // Time reasoning
    if (hoursToRes !== null) {
      if (hoursToRes < 24) {
        reasons.push(`Fast resolution (~${Math.round(hoursToRes)}h) - quick capital turnover`);
      } else if (hoursToRes < 168) {
        reasons.push(`Resolution within 1 week (~${Math.round(hoursToRes / 24)}d)`);
      } else {
        reasons.push(`Longer resolution time (~${Math.round(hoursToRes / 24)}d)`);
      }
    }

    // Confidence reasoning
    if (score.confidenceScore >= 85) {
      reasons.push('High resolution confidence - sources match');
    } else if (score.confidenceScore >= 70) {
      reasons.push('Good resolution confidence');
    } else {
      reasons.push('Lower resolution confidence - verify manually');
    }

    // Category performance
    if (categoryPerf && categoryPerf.totalOpportunities >= 5) {
      reasons.push(`${categoryPerf.category} category has ${(categoryPerf.historicalWinRate * 100).toFixed(0)}% historical win rate`);
    }

    return reasons;
  }

  /**
   * Generate action items
   */
  private generateActionItems(
    _opportunity: AnyOpportunity,
    score: RecommendationScore,
    riskLevel: RiskLevel
  ): string[] {
    const actions: string[] = [];

    if (score.overall >= 80 && riskLevel === 'low') {
      actions.push('Execute immediately');
    } else if (score.overall >= 60) {
      actions.push('Strong candidate - execute after verification');
    } else {
      actions.push('Lower priority - consider if other opportunities scarce');
    }

    // Position sizing
    const maxPosition = riskLevel === 'low' ? 500 : riskLevel === 'medium' ? 300 : 150;
    actions.push(`Max position: $${maxPosition}`);

    if (riskLevel === 'high' || riskLevel === 'critical') {
      actions.push('Manual review required before execution');
    }

    return actions;
  }

  /**
   * Create a recommendation from an opportunity
   */
  private createRecommendation(opportunity: AnyOpportunity, index: number): Recommendation {
    const score = this.scoreOpportunity(opportunity);
    const hoursToRes = this.getHoursToResolution(opportunity);
    const closeTime = this.getCloseTime(opportunity);
    const titles = this.getMarketTitles(opportunity);
    const exchanges = this.getExchangeNames(opportunity);
    const category = this.getCategory(opportunity);

    const riskScore = 100 - score.confidenceScore;
    const riskLevel = this.getRiskLevel(riskScore);
    const riskFactors = this.getRiskFactors(opportunity);

    let categoryPerformance: CategoryPerformance | null = null;
    let similarOpportunities: SimilarOpportunity[] = [];

    if (this.config.includeHistoricalContext) {
      const context = this.getHistoricalContext(opportunity);
      categoryPerformance = context.categoryPerformance;
      similarOpportunities = context.similarOpportunities;
    }

    const reasoning = this.config.includeReasoning
      ? this.generateReasoning(opportunity, score, hoursToRes, categoryPerformance)
      : [];

    const actionItems = this.config.includeReasoning
      ? this.generateActionItems(opportunity, score, riskLevel)
      : [];

    return {
      id: `rec-${Date.now()}-${index}`,
      rank: 0, // Will be set after sorting
      opportunityId: opportunity.id,
      timestamp: new Date(),
      score,
      market1Title: titles.market1,
      market2Title: titles.market2,
      exchange1: exchanges.exchange1,
      exchange2: exchanges.exchange2,
      profitPercent: opportunity.profitPercent,
      hoursUntilResolution: hoursToRes,
      resolutionDate: closeTime,
      capitalTurnoverDays: hoursToRes !== null ? hoursToRes / 24 : null,
      resolutionConfidence: score.confidenceScore,
      riskLevel,
      riskFactors,
      category,
      categoryPerformance,
      similarPastOpportunities: similarOpportunities,
      reasoning,
      actionItems
    };
  }

  /**
   * Check if recommendation passes configured filters
   */
  private passesFilters(rec: Recommendation): boolean {
    const f = this.config.filters;

    if (f.minScore !== undefined && rec.score.overall < f.minScore) return false;
    if (f.minProfit !== undefined && rec.profitPercent < f.minProfit) return false;
    if (f.maxHoursToResolution !== undefined &&
        rec.hoursUntilResolution !== null &&
        rec.hoursUntilResolution > f.maxHoursToResolution) return false;
    if (f.categories?.length && !f.categories.includes(rec.category)) return false;
    if (f.riskLevels?.length && !f.riskLevels.includes(rec.riskLevel)) return false;
    if (f.exchanges?.length &&
        !f.exchanges.includes(rec.exchange1) &&
        !f.exchanges.includes(rec.exchange2)) return false;

    return true;
  }

  /**
   * Build category performance cache from historical data
   */
  private buildCategoryPerformanceCache(): void {
    this.categoryPerformanceCache.clear();

    if (this.historicalOpportunities.length === 0) return;

    const categoryGroups = new Map<string, AnyOpportunity[]>();

    for (const opp of this.historicalOpportunities) {
      const category = this.getCategory(opp);
      if (!categoryGroups.has(category)) {
        categoryGroups.set(category, []);
      }
      categoryGroups.get(category)!.push(opp);
    }

    for (const [category, opps] of categoryGroups) {
      const validOpps = opps.filter(o => o.valid);
      const profits = opps.map(o => o.profitPercent);
      const avgProfit = profits.reduce((a, b) => a + b, 0) / profits.length;

      const durations = opps
        .map(o => this.getHoursToResolution(o))
        .filter((h): h is number => h !== null);
      const avgDuration = durations.length > 0
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : 0;

      // Determine trend from recent vs older opportunities
      const sorted = [...opps].sort((a, b) =>
        this.getTimestamp(a).getTime() - this.getTimestamp(b).getTime()
      );
      const midpoint = Math.floor(sorted.length / 2);
      const olderAvg = sorted.slice(0, midpoint)
        .reduce((s, o) => s + o.profitPercent, 0) / midpoint || 0;
      const recentAvg = sorted.slice(midpoint)
        .reduce((s, o) => s + o.profitPercent, 0) / (sorted.length - midpoint) || 0;

      let trend: 'improving' | 'stable' | 'declining' = 'stable';
      if (recentAvg > olderAvg * 1.1) trend = 'improving';
      else if (recentAvg < olderAvg * 0.9) trend = 'declining';

      this.categoryPerformanceCache.set(category, {
        category,
        historicalWinRate: validOpps.length / opps.length,
        avgProfit,
        avgDurationHours: avgDuration,
        totalOpportunities: opps.length,
        recentTrend: trend
      });
    }
  }

  /**
   * Find similar past opportunities
   */
  private findSimilarOpportunities(opportunity: AnyOpportunity): SimilarOpportunity[] {
    if (this.historicalOpportunities.length === 0) return [];

    const category = this.getCategory(opportunity);
    const similar = this.historicalOpportunities
      .filter(o => this.getCategory(o) === category && o.id !== opportunity.id)
      .map(o => {
        const hoursToRes = this.getHoursToResolution(o);
        const profitDiff = Math.abs(o.profitPercent - opportunity.profitPercent);
        const similarity = Math.max(0, 100 - profitDiff * 10);
        const outcome: 'win' | 'loss' | 'pending' = o.valid ? 'win' : 'loss';

        return {
          id: o.id,
          title: this.getMarketTitles(o).market1,
          profitPercent: o.profitPercent,
          outcome,
          durationHours: hoursToRes || 0,
          similarity
        };
      })
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5);

    return similar;
  }

  /**
   * Generate summary statistics
   */
  private generateSummary(recommendations: Recommendation[], _totalOpps: number): ReportSummary {
    if (recommendations.length === 0) {
      return {
        avgScore: 0,
        avgProfit: 0,
        avgHoursToResolution: null,
        categoryBreakdown: {},
        riskDistribution: { low: 0, medium: 0, high: 0, critical: 0 },
        topCategory: null,
        totalPotentialProfit: 0
      };
    }

    const avgScore = recommendations.reduce((s, r) => s + r.score.overall, 0) / recommendations.length;
    const avgProfit = recommendations.reduce((s, r) => s + r.profitPercent, 0) / recommendations.length;

    const hoursValues = recommendations
      .map(r => r.hoursUntilResolution)
      .filter((h): h is number => h !== null);
    const avgHoursToResolution = hoursValues.length > 0
      ? hoursValues.reduce((a, b) => a + b, 0) / hoursValues.length
      : null;

    const categoryBreakdown: Record<string, number> = {};
    const riskDistribution: Record<RiskLevel, number> = { low: 0, medium: 0, high: 0, critical: 0 };

    for (const rec of recommendations) {
      categoryBreakdown[rec.category] = (categoryBreakdown[rec.category] || 0) + 1;
      riskDistribution[rec.riskLevel]++;
    }

    const topCategory = Object.entries(categoryBreakdown)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    // Estimate total potential profit (assuming $100 per opportunity)
    const totalPotentialProfit = recommendations.reduce((s, r) => s + r.profitPercent, 0);

    return {
      avgScore: Math.round(avgScore * 100) / 100,
      avgProfit: Math.round(avgProfit * 100) / 100,
      avgHoursToResolution: avgHoursToResolution !== null
        ? Math.round(avgHoursToResolution * 10) / 10
        : null,
      categoryBreakdown,
      riskDistribution,
      topCategory,
      totalPotentialProfit: Math.round(totalPotentialProfit * 100) / 100
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<RecommendationConfig>): void {
    if (config.weights) {
      this.config.weights = { ...this.config.weights, ...config.weights };
    }
    if (config.filters) {
      this.config.filters = { ...this.config.filters, ...config.filters };
    }
    if (config.topN !== undefined) this.config.topN = config.topN;
    if (config.includeHistoricalContext !== undefined) {
      this.config.includeHistoricalContext = config.includeHistoricalContext;
    }
    if (config.includeReasoning !== undefined) {
      this.config.includeReasoning = config.includeReasoning;
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): RecommendationConfig {
    return { ...this.config };
  }
}
