/**
 * Historical Pattern Analysis
 *
 * Analyzes historical arbitrage opportunities to identify:
 * - Temporal patterns (time of day, day of week, seasonality)
 * - Market category patterns (which categories have most opportunities)
 * - Profit distribution and outliers
 * - Opportunity duration and decay rates
 * - Success/failure patterns
 */

import { ArbitrageOpportunity } from '@arb/core';

export interface TemporalPattern {
  hourOfDay: Map<number, PatternStats>;
  dayOfWeek: Map<number, PatternStats>;
  monthOfYear: Map<number, PatternStats>;
}

export interface CategoryPattern {
  category: string;
  count: number;
  avgProfit: number;
  medianProfit: number;
  maxProfit: number;
  avgDuration: number;
  successRate: number;
}

export interface PatternStats {
  count: number;
  avgProfit: number;
  medianProfit: number;
  stdDevProfit: number;
  minProfit: number;
  maxProfit: number;
  avgDuration?: number;
}

export interface ProfitDistribution {
  bins: { min: number; max: number; count: number }[];
  percentiles: {
    p25: number;
    p50: number;
    p75: number;
    p90: number;
    p95: number;
    p99: number;
  };
  outliers: ArbitrageOpportunity[];
}

export interface DurationPattern {
  avgDurationMinutes: number;
  medianDurationMinutes: number;
  decayRate: number; // Profit decrease per minute
  halfLife: number; // Minutes until profit halves
}

export interface PatternAnalysisResult {
  totalOpportunities: number;
  dateRange: { start: Date; end: Date };
  temporal: TemporalPattern;
  categories: CategoryPattern[];
  profitDistribution: ProfitDistribution;
  duration: DurationPattern;
  insights: string[];
}

export class PatternAnalyzer {
  /**
   * Analyze historical arbitrage opportunities
   */
  analyze(opportunities: ArbitrageOpportunity[]): PatternAnalysisResult {
    if (opportunities.length === 0) {
      throw new Error('No opportunities to analyze');
    }

    const sorted = [...opportunities].sort((a, b) =>
      a.timestamp.getTime() - b.timestamp.getTime()
    );

    return {
      totalOpportunities: opportunities.length,
      dateRange: {
        start: sorted[0].timestamp,
        end: sorted[sorted.length - 1].timestamp
      },
      temporal: this.analyzeTemporalPatterns(opportunities),
      categories: this.analyzeCategoryPatterns(opportunities),
      profitDistribution: this.analyzeProfitDistribution(opportunities),
      duration: this.analyzeDurationPatterns(opportunities),
      insights: this.generateInsights(opportunities)
    };
  }

  private analyzeTemporalPatterns(opportunities: ArbitrageOpportunity[]): TemporalPattern {
    const hourMap = new Map<number, ArbitrageOpportunity[]>();
    const dayMap = new Map<number, ArbitrageOpportunity[]>();
    const monthMap = new Map<number, ArbitrageOpportunity[]>();

    for (const opp of opportunities) {
      const hour = opp.timestamp.getHours();
      const day = opp.timestamp.getDay();
      const month = opp.timestamp.getMonth();

      if (!hourMap.has(hour)) hourMap.set(hour, []);
      if (!dayMap.has(day)) dayMap.set(day, []);
      if (!monthMap.has(month)) monthMap.set(month, []);

      hourMap.get(hour)!.push(opp);
      dayMap.get(day)!.push(opp);
      monthMap.get(month)!.push(opp);
    }

    return {
      hourOfDay: new Map(
        Array.from(hourMap.entries()).map(([hour, opps]) =>
          [hour, this.calculateStats(opps)]
        )
      ),
      dayOfWeek: new Map(
        Array.from(dayMap.entries()).map(([day, opps]) =>
          [day, this.calculateStats(opps)]
        )
      ),
      monthOfYear: new Map(
        Array.from(monthMap.entries()).map(([month, opps]) =>
          [month, this.calculateStats(opps)]
        )
      )
    };
  }

  private analyzeCategoryPatterns(opportunities: ArbitrageOpportunity[]): CategoryPattern[] {
    const categoryMap = new Map<string, ArbitrageOpportunity[]>();

    for (const opp of opportunities) {
      const category = opp.marketPair.kalshiMarket.metadata?.category || 'unknown';
      if (!categoryMap.has(category)) {
        categoryMap.set(category, []);
      }
      categoryMap.get(category)!.push(opp);
    }

    return Array.from(categoryMap.entries())
      .map(([category, opps]) => {
        const stats = this.calculateStats(opps);
        return {
          category,
          count: stats.count,
          avgProfit: stats.avgProfit,
          medianProfit: stats.medianProfit,
          maxProfit: stats.maxProfit,
          avgDuration: stats.avgDuration || 0,
          successRate: opps.filter(o => o.valid).length / opps.length
        };
      })
      .sort((a, b) => b.count - a.count);
  }

  private analyzeProfitDistribution(opportunities: ArbitrageOpportunity[]): ProfitDistribution {
    const profits = opportunities.map(o => o.profitPercent).sort((a, b) => a - b);

    const bins = this.createBins(profits, 10);
    const percentiles = this.calculatePercentiles(profits);
    const outliers = this.findOutliers(opportunities, percentiles.p99);

    return { bins, percentiles, outliers };
  }

  private analyzeDurationPatterns(opportunities: ArbitrageOpportunity[]): DurationPattern {
    const durations = opportunities
      .filter(o => o.ttl > 0)
      .map(o => o.ttl / 60); // Convert to minutes

    if (durations.length === 0) {
      return {
        avgDurationMinutes: 0,
        medianDurationMinutes: 0,
        decayRate: 0,
        halfLife: 0
      };
    }

    const sorted = [...durations].sort((a, b) => a - b);
    const avg = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    const median = sorted[Math.floor(sorted.length / 2)];

    // Estimate decay rate (simplified - would need time series for accurate calc)
    const decayRate = this.estimateDecayRate(opportunities);
    const halfLife = decayRate > 0 ? Math.log(2) / decayRate : 0;

    return {
      avgDurationMinutes: avg,
      medianDurationMinutes: median,
      decayRate,
      halfLife
    };
  }

  private calculateStats(opportunities: ArbitrageOpportunity[]): PatternStats {
    if (opportunities.length === 0) {
      return {
        count: 0,
        avgProfit: 0,
        medianProfit: 0,
        stdDevProfit: 0,
        minProfit: 0,
        maxProfit: 0,
        avgDuration: 0
      };
    }

    const profits = opportunities.map(o => o.profitPercent).sort((a, b) => a - b);
    const durations = opportunities.filter(o => o.ttl > 0).map(o => o.ttl);

    const avg = profits.reduce((sum, p) => sum + p, 0) / profits.length;
    const median = profits[Math.floor(profits.length / 2)];

    const variance = profits.reduce((sum, p) => sum + Math.pow(p - avg, 2), 0) / profits.length;
    const stdDev = Math.sqrt(variance);

    return {
      count: opportunities.length,
      avgProfit: avg,
      medianProfit: median,
      stdDevProfit: stdDev,
      minProfit: profits[0],
      maxProfit: profits[profits.length - 1],
      avgDuration: durations.length > 0
        ? durations.reduce((sum, d) => sum + d, 0) / durations.length
        : undefined
    };
  }

  private createBins(values: number[], binCount: number): { min: number; max: number; count: number }[] {
    if (values.length === 0) return [];

    const min = values[0];
    const max = values[values.length - 1];
    const binSize = (max - min) / binCount;

    const bins: { min: number; max: number; count: number }[] = [];
    for (let i = 0; i < binCount; i++) {
      const binMin = min + i * binSize;
      const binMax = min + (i + 1) * binSize;
      const count = values.filter(v => v >= binMin && v < binMax).length;
      bins.push({ min: binMin, max: binMax, count });
    }

    return bins;
  }

  private calculatePercentiles(values: number[]): ProfitDistribution['percentiles'] {
    const getPercentile = (p: number) => {
      const index = Math.floor(values.length * p);
      return values[Math.min(index, values.length - 1)];
    };

    return {
      p25: getPercentile(0.25),
      p50: getPercentile(0.50),
      p75: getPercentile(0.75),
      p90: getPercentile(0.90),
      p95: getPercentile(0.95),
      p99: getPercentile(0.99)
    };
  }

  private findOutliers(opportunities: ArbitrageOpportunity[], threshold: number): ArbitrageOpportunity[] {
    return opportunities
      .filter(o => o.profitPercent > threshold)
      .sort((a, b) => b.profitPercent - a.profitPercent)
      .slice(0, 10); // Top 10 outliers
  }

  private estimateDecayRate(opportunities: ArbitrageOpportunity[]): number {
    // Simplified decay estimation
    // In reality, would track same opportunity over time
    const withTTL = opportunities.filter(o => o.ttl > 0);
    if (withTTL.length === 0) return 0;

    const avgTTL = withTTL.reduce((sum, o) => sum + o.ttl, 0) / withTTL.length;
    return avgTTL > 0 ? 1 / avgTTL : 0;
  }

  private generateInsights(opportunities: ArbitrageOpportunity[]): string[] {
    const insights: string[] = [];
    const stats = this.calculateStats(opportunities);

    insights.push(`Average profit: ${stats.avgProfit.toFixed(2)}%`);
    insights.push(`Median profit: ${stats.medianProfit.toFixed(2)}%`);
    insights.push(`Profit range: ${stats.minProfit.toFixed(2)}% - ${stats.maxProfit.toFixed(2)}%`);

    if (stats.avgProfit > 5) {
      insights.push('⚠️ High average profits may indicate rare opportunities or data quality issues');
    }

    if (stats.stdDevProfit > stats.avgProfit) {
      insights.push('📊 High profit variance - opportunities vary significantly');
    }

    const validRate = opportunities.filter(o => o.valid).length / opportunities.length;
    insights.push(`Valid opportunity rate: ${(validRate * 100).toFixed(1)}%`);

    if (validRate < 0.5) {
      insights.push('⚠️ Low valid rate - check market matching quality');
    }

    return insights;
  }

  /**
   * Find best times to scan for opportunities
   */
  findBestScanTimes(result: PatternAnalysisResult): { hour: number; score: number }[] {
    const scores: { hour: number; score: number }[] = [];

    for (const [hour, stats] of result.temporal.hourOfDay.entries()) {
      // Score based on count and average profit
      const score = stats.count * stats.avgProfit;
      scores.push({ hour, score });
    }

    return scores.sort((a, b) => b.score - a.score);
  }

  /**
   * Identify most profitable categories
   */
  findBestCategories(result: PatternAnalysisResult, minCount: number = 5): CategoryPattern[] {
    return result.categories
      .filter(c => c.count >= minCount)
      .sort((a, b) => b.avgProfit - a.avgProfit);
  }
}
