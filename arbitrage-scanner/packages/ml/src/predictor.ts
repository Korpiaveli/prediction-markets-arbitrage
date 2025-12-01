/**
 * Opportunity Predictor
 *
 * Forecasts when and where arbitrage opportunities will appear
 * based on historical patterns and market conditions.
 */

import { ArbitrageOpportunity } from '@arb/core';
import { ConfidenceInterval } from './types';

export interface OpportunityForecast {
  category: string;
  expectedCount: number;
  expectedProfitRange: {
    min: number;
    max: number;
    avg: number;
  };
  confidenceInterval: ConfidenceInterval;
  bestScanTimes: Array<{
    hour: number;
    dayOfWeek: number;
    probability: number;
  }>;
  likelyExchangePairs: Array<{
    exchange1: string;
    exchange2: string;
    probability: number;
  }>;
}

export interface TimingPrediction {
  nextOpportunityETA: number; // minutes
  confidence: number; // 0-100
  reasoning: string[];
  marketConditions: {
    volatility: 'low' | 'medium' | 'high';
    volume: 'low' | 'medium' | 'high';
    newsActivity: 'low' | 'medium' | 'high';
  };
}

export class OpportunityPredictor {
  private historicalData: ArbitrageOpportunity[] = [];

  /**
   * Load historical opportunities for training
   */
  loadHistoricalData(opportunities: ArbitrageOpportunity[]): void {
    this.historicalData = opportunities.sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );
  }

  /**
   * Forecast opportunities for a given category
   */
  forecast(category: string, hoursAhead: number = 24): OpportunityForecast {
    const categoryOpps = this.historicalData.filter(
      opp => this.categorizeMarket(opp.marketPair.kalshiMarket.title) === category
    );

    if (categoryOpps.length === 0) {
      return this.getDefaultForecast(category);
    }

    const hourlyRate = this.calculateHourlyRate(categoryOpps);
    const expectedCount = hourlyRate * hoursAhead;

    const profitStats = this.calculateProfitStats(categoryOpps);
    const bestTimes = this.findBestTimes(categoryOpps);

    const stdDev = this.calculateStdDev(categoryOpps.map(o => o.profitPercent));
    const confidenceInterval: ConfidenceInterval = {
      lower: Math.max(0, expectedCount - 1.96 * stdDev),
      upper: expectedCount + 1.96 * stdDev,
      mean: expectedCount,
      stdDev
    };

    return {
      category,
      expectedCount,
      expectedProfitRange: profitStats,
      confidenceInterval,
      bestScanTimes: bestTimes,
      likelyExchangePairs: this.findLikelyPairs(categoryOpps)
    };
  }

  /**
   * Predict when next opportunity will appear
   */
  predictNextOpportunity(currentTime: Date = new Date()): TimingPrediction {
    if (this.historicalData.length < 2) {
      return {
        nextOpportunityETA: 60,
        confidence: 20,
        reasoning: ['Insufficient historical data'],
        marketConditions: {
          volatility: 'medium',
          volume: 'medium',
          newsActivity: 'medium'
        }
      };
    }

    const recentOpps = this.getRecentOpportunities(currentTime, 24);
    const avgGapMinutes = this.calculateAverageGap(this.historicalData);
    const lastOppTime = this.historicalData[this.historicalData.length - 1].timestamp;
    const timeSinceLast = (currentTime.getTime() - lastOppTime.getTime()) / (1000 * 60);

    const hour = currentTime.getHours();
    const dayOfWeek = currentTime.getDay();
    const timeMultiplier = this.getTimeMultiplier(hour, dayOfWeek);

    const adjustedETA = Math.max(5, avgGapMinutes * timeMultiplier - timeSinceLast);

    const confidence = this.calculatePredictionConfidence(recentOpps, avgGapMinutes);

    const reasoning = this.generateReasoning(
      recentOpps.length,
      avgGapMinutes,
      timeSinceLast,
      timeMultiplier
    );

    const marketConditions = this.assessMarketConditions(recentOpps);

    return {
      nextOpportunityETA: Math.round(adjustedETA),
      confidence,
      reasoning,
      marketConditions
    };
  }

  /**
   * Calculate probability of opportunity in next N hours
   */
  probabilityInTimeframe(hours: number): number {
    if (this.historicalData.length < 2) return 0.5;

    const avgGapHours = this.calculateAverageGap(this.historicalData) / 60;
    const lambda = 1 / avgGapHours; // Rate parameter for Poisson

    // Poisson probability: P(X >= 1) = 1 - P(X = 0) = 1 - e^(-lambda*t)
    return (1 - Math.exp(-lambda * hours)) * 100;
  }

  private calculateHourlyRate(opportunities: ArbitrageOpportunity[]): number {
    if (opportunities.length < 2) return 0;

    const firstTime = opportunities[0].timestamp.getTime();
    const lastTime = opportunities[opportunities.length - 1].timestamp.getTime();
    const hoursSpan = (lastTime - firstTime) / (1000 * 60 * 60);

    return hoursSpan > 0 ? opportunities.length / hoursSpan : 0;
  }

  private calculateProfitStats(opportunities: ArbitrageOpportunity[]) {
    const profits = opportunities.map(o => o.profitPercent);
    return {
      min: Math.min(...profits),
      max: Math.max(...profits),
      avg: profits.reduce((a, b) => a + b, 0) / profits.length
    };
  }

  private findBestTimes(opportunities: ArbitrageOpportunity[]) {
    const timeMap = new Map<string, number>();

    for (const opp of opportunities) {
      const hour = opp.timestamp.getHours();
      const day = opp.timestamp.getDay();
      const key = `${day}-${hour}`;
      timeMap.set(key, (timeMap.get(key) || 0) + 1);
    }

    const total = opportunities.length;
    const bestTimes = Array.from(timeMap.entries())
      .map(([key, count]) => {
        const [day, hour] = key.split('-').map(Number);
        return {
          hour,
          dayOfWeek: day,
          probability: (count / total) * 100
        };
      })
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 5);

    return bestTimes;
  }

  private findLikelyPairs(opportunities: ArbitrageOpportunity[]) {
    const pairMap = new Map<string, number>();

    for (const opp of opportunities) {
      const key = `${opp.marketPair.kalshiMarket.exchange}-${opp.marketPair.polymarketMarket.exchange}`;
      pairMap.set(key, (pairMap.get(key) || 0) + 1);
    }

    const total = opportunities.length;
    return Array.from(pairMap.entries())
      .map(([pair, count]) => {
        const [exchange1, exchange2] = pair.split('-');
        return {
          exchange1,
          exchange2,
          probability: (count / total) * 100
        };
      })
      .sort((a, b) => b.probability - a.probability);
  }

  private getRecentOpportunities(currentTime: Date, hours: number): ArbitrageOpportunity[] {
    const cutoff = new Date(currentTime.getTime() - hours * 60 * 60 * 1000);
    return this.historicalData.filter(opp => opp.timestamp >= cutoff);
  }

  private calculateAverageGap(opportunities: ArbitrageOpportunity[]): number {
    if (opportunities.length < 2) return 60; // Default 60 minutes

    const gaps: number[] = [];
    for (let i = 1; i < opportunities.length; i++) {
      const gap = (opportunities[i].timestamp.getTime() - opportunities[i - 1].timestamp.getTime()) / (1000 * 60);
      gaps.push(gap);
    }

    return gaps.reduce((a, b) => a + b, 0) / gaps.length;
  }

  private getTimeMultiplier(hour: number, dayOfWeek: number): number {
    // Weekend (0=Sun, 6=Sat)
    if (dayOfWeek === 0 || dayOfWeek === 6) return 1.5;

    // Off-hours (midnight-6am, 10pm-midnight)
    if (hour < 6 || hour >= 22) return 2.0;

    // Peak trading hours (9am-4pm)
    if (hour >= 9 && hour <= 16) return 0.7;

    return 1.0;
  }

  private calculatePredictionConfidence(
    recentOpps: ArbitrageOpportunity[],
    avgGap: number
  ): number {
    const dataQuality = Math.min(100, (this.historicalData.length / 50) * 100);
    const recency = Math.min(100, (recentOpps.length / 10) * 100);
    const consistency = 100 - Math.min(100, (this.calculateStdDev(
      this.historicalData.map(o => o.profitPercent)
    ) / avgGap) * 100);

    return (dataQuality * 0.4 + recency * 0.3 + consistency * 0.3);
  }

  private generateReasoning(
    recentCount: number,
    avgGap: number,
    timeSinceLast: number,
    timeMultiplier: number
  ): string[] {
    const reasons: string[] = [];

    if (recentCount > 5) {
      reasons.push(`High recent activity (${recentCount} in last 24h)`);
    } else if (recentCount === 0) {
      reasons.push('No recent opportunities detected');
    }

    if (timeSinceLast > avgGap * 1.5) {
      reasons.push('Overdue - longer than average gap');
    } else if (timeSinceLast < avgGap * 0.5) {
      reasons.push('Recent opportunity - wait time expected');
    }

    if (timeMultiplier > 1.2) {
      reasons.push('Off-peak hours - lower opportunity frequency');
    } else if (timeMultiplier < 0.8) {
      reasons.push('Peak trading hours - higher opportunity frequency');
    }

    return reasons;
  }

  private assessMarketConditions(recentOpps: ArbitrageOpportunity[]): {
    volatility: 'low' | 'medium' | 'high';
    volume: 'low' | 'medium' | 'high';
    newsActivity: 'low' | 'medium' | 'high';
  } {
    const profitVariance = this.calculateStdDev(recentOpps.map(o => o.profitPercent));
    const volumeAvg = recentOpps.length / 24; // per hour

    return {
      volatility: (profitVariance > 2 ? 'high' : profitVariance > 1 ? 'medium' : 'low') as 'low' | 'medium' | 'high',
      volume: (volumeAvg > 2 ? 'high' : volumeAvg > 0.5 ? 'medium' : 'low') as 'low' | 'medium' | 'high',
      newsActivity: 'medium' as 'low' | 'medium' | 'high'
    };
  }

  private calculateStdDev(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  private categorizeMarket(title: string): string {
    const lower = title.toLowerCase();
    if (lower.includes('election') || lower.includes('trump') || lower.includes('biden')) {
      return 'politics';
    }
    if (lower.includes('nfl') || lower.includes('nba') || lower.includes('mlb')) {
      return 'sports';
    }
    if (lower.includes('bitcoin') || lower.includes('crypto') || lower.includes('eth')) {
      return 'crypto';
    }
    if (lower.includes('fed') || lower.includes('rate') || lower.includes('inflation')) {
      return 'economy';
    }
    return 'other';
  }

  private getDefaultForecast(category: string): OpportunityForecast {
    return {
      category,
      expectedCount: 0,
      expectedProfitRange: { min: 0, max: 0, avg: 0 },
      confidenceInterval: {
        lower: 0,
        upper: 0,
        mean: 0,
        stdDev: 0
      },
      bestScanTimes: [],
      likelyExchangePairs: []
    };
  }
}
