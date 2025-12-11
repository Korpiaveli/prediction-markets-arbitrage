/**
 * ConfidenceTracker
 *
 * Tracks historical performance by confidence bucket to provide:
 * - Actual win rates vs expected win rates
 * - Average profit per confidence level
 * - Resolution time patterns
 * - Calibration metrics (how well confidence predicts outcomes)
 */

import { CrossExchangeArbitrageOpportunity } from '@arb/core';

export interface ConfidenceBucket {
  range: string;
  minConfidence: number;
  maxConfidence: number;
  expectedWinRate: number;
}

export interface BucketPerformance {
  bucket: ConfidenceBucket;
  totalTrades: number;
  wins: number;
  losses: number;
  pending: number;
  actualWinRate: number;
  calibrationError: number; // Expected - Actual
  avgProfitPercent: number;
  avgDaysToResolution: number;
  totalProfit: number;
  categories: Record<string, number>;
}

export interface TrackedTrade {
  id: string;
  opportunityId: string;
  confidence: number;
  confidenceBucket: string;
  profitPercent: number;
  daysToResolution: number;
  category?: string;
  outcome: 'win' | 'loss' | 'pending';
  entryDate: Date;
  resolutionDate?: Date;
  actualProfit?: number;
}

export interface CalibrationMetrics {
  overallCalibration: number; // 0 = perfect, positive = overconfident, negative = underconfident
  brierScore: number; // Lower is better (0-1)
  bucketCalibrations: Record<string, number>;
  recommendations: string[];
}

export interface PerformanceSummary {
  totalTracked: number;
  resolved: number;
  pending: number;
  overallWinRate: number;
  weightedAvgProfit: number;
  bestPerformingBucket: string;
  worstPerformingBucket: string;
  calibration: CalibrationMetrics;
  bucketPerformance: BucketPerformance[];
}

const DEFAULT_BUCKETS: ConfidenceBucket[] = [
  { range: '95-100', minConfidence: 95, maxConfidence: 100, expectedWinRate: 0.99 },
  { range: '85-94', minConfidence: 85, maxConfidence: 94, expectedWinRate: 0.95 },
  { range: '75-84', minConfidence: 75, maxConfidence: 84, expectedWinRate: 0.90 },
  { range: '65-74', minConfidence: 65, maxConfidence: 74, expectedWinRate: 0.85 },
  { range: '<65', minConfidence: 0, maxConfidence: 64, expectedWinRate: 0.75 }
];

export class ConfidenceTracker {
  private trades: Map<string, TrackedTrade> = new Map();
  private buckets: ConfidenceBucket[];

  constructor(customBuckets?: ConfidenceBucket[]) {
    this.buckets = customBuckets || DEFAULT_BUCKETS;
  }

  getBucket(confidence: number): ConfidenceBucket {
    for (const bucket of this.buckets) {
      if (confidence >= bucket.minConfidence && confidence <= bucket.maxConfidence) {
        return bucket;
      }
    }
    return this.buckets[this.buckets.length - 1];
  }

  trackEntry(
    opportunity: CrossExchangeArbitrageOpportunity,
    daysToResolution?: number
  ): TrackedTrade {
    const confidence = opportunity.confidence ||
      (opportunity.resolutionAlignment?.score || 70);
    const bucket = this.getBucket(confidence);

    const closeTime = opportunity.marketPair.market1.closeTime ||
                      opportunity.marketPair.market2.closeTime;
    const days = daysToResolution ?? (closeTime
      ? Math.max(1, (new Date(closeTime).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : 30);

    const trade: TrackedTrade = {
      id: `track-${opportunity.id}-${Date.now()}`,
      opportunityId: opportunity.id,
      confidence,
      confidenceBucket: bucket.range,
      profitPercent: opportunity.profitPercent,
      daysToResolution: Math.round(days),
      category: this.extractCategory(opportunity),
      outcome: 'pending',
      entryDate: new Date()
    };

    this.trades.set(trade.id, trade);
    return trade;
  }

  recordOutcome(
    tradeId: string,
    outcome: 'win' | 'loss',
    actualProfit?: number
  ): boolean {
    const trade = this.trades.get(tradeId);
    if (!trade) return false;

    trade.outcome = outcome;
    trade.resolutionDate = new Date();
    trade.actualProfit = actualProfit;

    return true;
  }

  recordOutcomeByOpportunityId(
    opportunityId: string,
    outcome: 'win' | 'loss',
    actualProfit?: number
  ): boolean {
    const trade = Array.from(this.trades.values())
      .find(t => t.opportunityId === opportunityId && t.outcome === 'pending');

    if (!trade) return false;

    trade.outcome = outcome;
    trade.resolutionDate = new Date();
    trade.actualProfit = actualProfit;

    return true;
  }

  getBucketPerformance(bucketRange: string): BucketPerformance | null {
    const bucket = this.buckets.find(b => b.range === bucketRange);
    if (!bucket) return null;

    const bucketTrades = Array.from(this.trades.values())
      .filter(t => t.confidenceBucket === bucketRange);

    const resolved = bucketTrades.filter(t => t.outcome !== 'pending');
    const wins = resolved.filter(t => t.outcome === 'win');
    const losses = resolved.filter(t => t.outcome === 'loss');

    const actualWinRate = resolved.length > 0 ? wins.length / resolved.length : 0;
    const avgProfit = resolved.length > 0
      ? resolved.reduce((sum, t) => sum + t.profitPercent, 0) / resolved.length
      : 0;
    const avgDays = bucketTrades.length > 0
      ? bucketTrades.reduce((sum, t) => sum + t.daysToResolution, 0) / bucketTrades.length
      : 0;
    const totalProfit = wins.reduce((sum, t) => sum + (t.actualProfit || t.profitPercent), 0) -
      losses.reduce((sum, t) => sum + Math.abs(t.actualProfit || t.profitPercent * 0.5), 0);

    const categories: Record<string, number> = {};
    bucketTrades.forEach(t => {
      const cat = t.category || 'unknown';
      categories[cat] = (categories[cat] || 0) + 1;
    });

    return {
      bucket,
      totalTrades: bucketTrades.length,
      wins: wins.length,
      losses: losses.length,
      pending: bucketTrades.filter(t => t.outcome === 'pending').length,
      actualWinRate,
      calibrationError: bucket.expectedWinRate - actualWinRate,
      avgProfitPercent: Math.round(avgProfit * 100) / 100,
      avgDaysToResolution: Math.round(avgDays),
      totalProfit: Math.round(totalProfit * 100) / 100,
      categories
    };
  }

  getCalibrationMetrics(): CalibrationMetrics {
    const bucketCalibrations: Record<string, number> = {};
    let totalCalibrationError = 0;
    let totalBrierScore = 0;
    let resolvedCount = 0;

    for (const bucket of this.buckets) {
      const perf = this.getBucketPerformance(bucket.range);
      if (!perf || perf.totalTrades - perf.pending === 0) {
        bucketCalibrations[bucket.range] = 0;
        continue;
      }

      const resolved = perf.totalTrades - perf.pending;
      bucketCalibrations[bucket.range] = perf.calibrationError;
      totalCalibrationError += perf.calibrationError * resolved;

      // Brier score: mean squared error between predicted probability and outcome
      const brierContrib = Math.pow(bucket.expectedWinRate - perf.actualWinRate, 2);
      totalBrierScore += brierContrib * resolved;
      resolvedCount += resolved;
    }

    const overallCalibration = resolvedCount > 0 ? totalCalibrationError / resolvedCount : 0;
    const brierScore = resolvedCount > 0 ? totalBrierScore / resolvedCount : 0;

    const recommendations = this.generateCalibrationRecommendations(bucketCalibrations, overallCalibration);

    return {
      overallCalibration: Math.round(overallCalibration * 1000) / 1000,
      brierScore: Math.round(brierScore * 1000) / 1000,
      bucketCalibrations,
      recommendations
    };
  }

  private generateCalibrationRecommendations(
    bucketCalibrations: Record<string, number>,
    overall: number
  ): string[] {
    const recommendations: string[] = [];

    if (overall > 0.1) {
      recommendations.push('System is overconfident - actual win rates below predictions. Consider lowering confidence scores or using stricter filters.');
    } else if (overall < -0.1) {
      recommendations.push('System is underconfident - actual win rates exceed predictions. May have room for more aggressive trading.');
    } else {
      recommendations.push('Calibration is good - predictions align well with outcomes.');
    }

    for (const [bucket, error] of Object.entries(bucketCalibrations)) {
      if (Math.abs(error) > 0.15) {
        if (error > 0) {
          recommendations.push(`${bucket} bucket: Overconfident by ${(error * 100).toFixed(1)}%. Recommend stricter matching criteria.`);
        } else {
          recommendations.push(`${bucket} bucket: Underconfident by ${(Math.abs(error) * 100).toFixed(1)}%. These opportunities may be undervalued.`);
        }
      }
    }

    return recommendations;
  }

  getPerformanceSummary(): PerformanceSummary {
    const allTrades = Array.from(this.trades.values());
    const resolved = allTrades.filter(t => t.outcome !== 'pending');
    const wins = resolved.filter(t => t.outcome === 'win');

    const bucketPerformance = this.buckets
      .map(b => this.getBucketPerformance(b.range))
      .filter((p): p is BucketPerformance => p !== null);

    const bestBucket = bucketPerformance
      .filter(p => p.totalTrades - p.pending >= 5) // Min 5 resolved trades
      .sort((a, b) => b.actualWinRate - a.actualWinRate)[0];

    const worstBucket = bucketPerformance
      .filter(p => p.totalTrades - p.pending >= 5)
      .sort((a, b) => a.actualWinRate - b.actualWinRate)[0];

    const weightedProfit = resolved.length > 0
      ? resolved.reduce((sum, t) => {
          const profit = t.outcome === 'win'
            ? (t.actualProfit || t.profitPercent)
            : -(t.actualProfit || t.profitPercent * 0.5);
          return sum + profit;
        }, 0) / resolved.length
      : 0;

    return {
      totalTracked: allTrades.length,
      resolved: resolved.length,
      pending: allTrades.length - resolved.length,
      overallWinRate: resolved.length > 0 ? wins.length / resolved.length : 0,
      weightedAvgProfit: Math.round(weightedProfit * 100) / 100,
      bestPerformingBucket: bestBucket?.bucket.range || 'N/A',
      worstPerformingBucket: worstBucket?.bucket.range || 'N/A',
      calibration: this.getCalibrationMetrics(),
      bucketPerformance
    };
  }

  getExpectedWinRate(confidence: number): number {
    return this.getBucket(confidence).expectedWinRate;
  }

  getAdjustedWinRate(confidence: number): number {
    const bucket = this.getBucket(confidence);
    const perf = this.getBucketPerformance(bucket.range);

    if (!perf || perf.totalTrades - perf.pending < 10) {
      return bucket.expectedWinRate;
    }

    // Weight towards actual performance as sample size increases
    const sampleWeight = Math.min(1, (perf.totalTrades - perf.pending) / 50);
    return bucket.expectedWinRate * (1 - sampleWeight) + perf.actualWinRate * sampleWeight;
  }

  exportData(): {
    trades: TrackedTrade[];
    summary: PerformanceSummary;
  } {
    return {
      trades: Array.from(this.trades.values()),
      summary: this.getPerformanceSummary()
    };
  }

  importTrades(trades: TrackedTrade[]): void {
    for (const trade of trades) {
      this.trades.set(trade.id, trade);
    }
  }

  clear(): void {
    this.trades.clear();
  }

  private extractCategory(opportunity: CrossExchangeArbitrageOpportunity): string {
    const title = opportunity.marketPair.market1.title.toLowerCase();

    if (title.includes('president') || title.includes('election') || title.includes('vote')) {
      return 'politics';
    }
    if (title.includes('fed') || title.includes('interest') || title.includes('inflation')) {
      return 'economics';
    }
    if (title.includes('bitcoin') || title.includes('crypto') || title.includes('eth')) {
      return 'crypto';
    }
    if (title.includes('championship') || title.includes('game') || title.includes('match')) {
      return 'sports';
    }
    if (title.includes('weather') || title.includes('temperature') || title.includes('hurricane')) {
      return 'weather';
    }

    return 'other';
  }
}
