/**
 * Market Correlation Detection
 *
 * Identifies correlated markets to:
 * - Find indirect arbitrage opportunities
 * - Detect market inefficiencies
 * - Build hedging strategies
 * - Understand market relationships
 */

import { Market } from '@arb/core';

export interface MarketCorrelation {
  market1: Market;
  market2: Market;
  correlation: number; // -1 to 1
  confidence: number; // 0-100
  relationship: 'direct' | 'inverse' | 'conditional' | 'independent';
  strength: 'strong' | 'moderate' | 'weak' | 'none';
  insights: string[];
}

export interface CorrelationCluster {
  markets: Market[];
  avgCorrelation: number;
  theme: string;
  opportunities: string[];
}

export interface PriceHistory {
  marketId: string;
  timestamp: Date;
  price: number;
}

export class CorrelationDetector {
  private readonly STRONG_THRESHOLD = 0.7;
  private readonly MODERATE_THRESHOLD = 0.4;
  private readonly WEAK_THRESHOLD = 0.2;

  /**
   * Calculate correlation between two markets based on price history
   */
  calculateCorrelation(
    market1: Market,
    market2: Market,
    history1: PriceHistory[],
    history2: PriceHistory[]
  ): MarketCorrelation {
    // Align time series
    const aligned = this.alignTimeSeries(history1, history2);

    if (aligned.length < 10) {
      return this.createLowConfidenceResult(market1, market2, 'Insufficient data');
    }

    // Calculate Pearson correlation
    const correlation = this.pearsonCorrelation(
      aligned.map(a => a.price1),
      aligned.map(a => a.price2)
    );

    const confidence = this.calculateConfidence(aligned.length, correlation);
    const relationship = this.determineRelationship(correlation);
    const strength = this.determineStrength(Math.abs(correlation));
    const insights = this.generateCorrelationInsights(market1, market2, correlation, aligned);

    return {
      market1,
      market2,
      correlation,
      confidence,
      relationship,
      strength,
      insights
    };
  }

  /**
   * Find all significant correlations in a set of markets
   */
  findCorrelations(
    markets: Market[],
    priceHistories: Map<string, PriceHistory[]>,
    minConfidence: number = 70
  ): MarketCorrelation[] {
    const correlations: MarketCorrelation[] = [];

    for (let i = 0; i < markets.length; i++) {
      for (let j = i + 1; j < markets.length; j++) {
        const history1 = priceHistories.get(markets[i].id);
        const history2 = priceHistories.get(markets[j].id);

        if (!history1 || !history2) continue;

        const corr = this.calculateCorrelation(markets[i], markets[j], history1, history2);

        if (corr.confidence >= minConfidence && corr.strength !== 'none') {
          correlations.push(corr);
        }
      }
    }

    return correlations.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
  }

  /**
   * Cluster markets by correlation
   */
  clusterMarkets(
    correlations: MarketCorrelation[],
    minClusterSize: number = 3
  ): CorrelationCluster[] {
    const clusters: CorrelationCluster[] = [];
    const processed = new Set<string>();

    for (const corr of correlations) {
      if (processed.has(corr.market1.id) || corr.strength === 'weak') continue;

      const cluster = this.buildCluster(corr.market1, correlations, processed);

      if (cluster.markets.length >= minClusterSize) {
        clusters.push(cluster);
      }
    }

    return clusters.sort((a, b) => b.avgCorrelation - a.avgCorrelation);
  }

  /**
   * Detect arbitrage opportunities using correlated markets
   */
  findCorrelationArbitrage(
    correlations: MarketCorrelation[],
    currentPrices: Map<string, number>
  ): {
    market1: Market;
    market2: Market;
    expectedPrice: number;
    actualPrice: number;
    divergence: number;
    opportunity: string;
  }[] {
    const opportunities: any[] = [];

    for (const corr of correlations) {
      if (corr.relationship !== 'direct' && corr.relationship !== 'inverse') continue;
      if (corr.strength === 'weak' || corr.strength === 'none') continue;

      const price1 = currentPrices.get(corr.market1.id);
      const price2 = currentPrices.get(corr.market2.id);

      if (!price1 || !price2) continue;

      // For direct correlation, prices should move together
      // For inverse, they should move opposite
      const expectedPrice2 = corr.relationship === 'direct'
        ? price1
        : 1 - price1;

      const divergence = Math.abs(price2 - expectedPrice2);

      if (divergence > 0.1) { // 10% divergence
        opportunities.push({
          market1: corr.market1,
          market2: corr.market2,
          expectedPrice: expectedPrice2,
          actualPrice: price2,
          divergence,
          opportunity: this.describeOpportunity(corr, price1, price2, expectedPrice2)
        });
      }
    }

    return opportunities.sort((a, b) => b.divergence - a.divergence);
  }

  private alignTimeSeries(
    history1: PriceHistory[],
    history2: PriceHistory[]
  ): { timestamp: Date; price1: number; price2: number }[] {
    const aligned: { timestamp: Date; price1: number; price2: number }[] = [];

    const map2 = new Map(history2.map(h => [h.timestamp.getTime(), h.price]));

    for (const h1 of history1) {
      const price2 = map2.get(h1.timestamp.getTime());
      if (price2 !== undefined) {
        aligned.push({
          timestamp: h1.timestamp,
          price1: h1.price,
          price2
        });
      }
    }

    return aligned;
  }

  private pearsonCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    if (n === 0) return 0;

    const meanX = x.reduce((sum, v) => sum + v, 0) / n;
    const meanY = y.reduce((sum, v) => sum + v, 0) / n;

    let numerator = 0;
    let denomX = 0;
    let denomY = 0;

    for (let i = 0; i < n; i++) {
      const dx = x[i] - meanX;
      const dy = y[i] - meanY;
      numerator += dx * dy;
      denomX += dx * dx;
      denomY += dy * dy;
    }

    if (denomX === 0 || denomY === 0) return 0;

    return numerator / Math.sqrt(denomX * denomY);
  }

  private calculateConfidence(sampleSize: number, correlation: number): number {
    // Confidence based on sample size and correlation strength
    const sizeScore = Math.min(100, (sampleSize / 100) * 50);
    const strengthScore = Math.abs(correlation) * 50;
    return Math.min(100, sizeScore + strengthScore);
  }

  private determineRelationship(correlation: number): MarketCorrelation['relationship'] {
    if (correlation > 0.5) return 'direct';
    if (correlation < -0.5) return 'inverse';
    if (Math.abs(correlation) > 0.2) return 'conditional';
    return 'independent';
  }

  private determineStrength(absCorrelation: number): MarketCorrelation['strength'] {
    if (absCorrelation >= this.STRONG_THRESHOLD) return 'strong';
    if (absCorrelation >= this.MODERATE_THRESHOLD) return 'moderate';
    if (absCorrelation >= this.WEAK_THRESHOLD) return 'weak';
    return 'none';
  }

  private createLowConfidenceResult(
    market1: Market,
    market2: Market,
    reason: string
  ): MarketCorrelation {
    return {
      market1,
      market2,
      correlation: 0,
      confidence: 0,
      relationship: 'independent',
      strength: 'none',
      insights: [reason]
    };
  }

  private generateCorrelationInsights(
    market1: Market,
    market2: Market,
    correlation: number,
    aligned: { timestamp: Date; price1: number; price2: number }[]
  ): string[] {
    const insights: string[] = [];

    insights.push(`Correlation: ${(correlation * 100).toFixed(1)}%`);
    insights.push(`Sample size: ${aligned.length} data points`);

    if (Math.abs(correlation) > this.STRONG_THRESHOLD) {
      insights.push('✅ Strong relationship - high confidence for trading');
    } else if (Math.abs(correlation) > this.MODERATE_THRESHOLD) {
      insights.push('📊 Moderate relationship - use with caution');
    }

    const category1 = market1.metadata?.category || 'unknown';
    const category2 = market2.metadata?.category || 'unknown';

    if (category1 === category2) {
      insights.push(`Same category: ${category1}`);
    }

    if (correlation > 0.8) {
      insights.push('💡 Markets move nearly identically - possible arbitrage');
    } else if (correlation < -0.8) {
      insights.push('💡 Strong inverse relationship - hedging opportunity');
    }

    return insights;
  }

  private buildCluster(
    seed: Market,
    correlations: MarketCorrelation[],
    processed: Set<string>
  ): CorrelationCluster {
    const cluster: Market[] = [seed];
    processed.add(seed.id);

    const related = correlations.filter(c =>
      (c.market1.id === seed.id || c.market2.id === seed.id) &&
      c.strength !== 'weak' &&
      c.strength !== 'none'
    );

    for (const corr of related) {
      const other = corr.market1.id === seed.id ? corr.market2 : corr.market1;
      if (!processed.has(other.id)) {
        cluster.push(other);
        processed.add(other.id);
      }
    }

    const avgCorrelation = related.length > 0
      ? related.reduce((sum, c) => sum + Math.abs(c.correlation), 0) / related.length
      : 0;

    const theme = this.detectClusterTheme(cluster);
    const opportunities = this.identifyClusterOpportunities(cluster, related);

    return {
      markets: cluster,
      avgCorrelation,
      theme,
      opportunities
    };
  }

  private detectClusterTheme(markets: Market[]): string {
    const categories = markets.map(m => m.metadata?.category || 'unknown');
    const commonCategory = this.mostCommon(categories);

    if (commonCategory && commonCategory !== 'unknown') {
      return commonCategory;
    }

    const keywords = markets.flatMap(m =>
      m.title.toLowerCase().split(/\s+/).filter(w => w.length > 4)
    );
    const commonKeyword = this.mostCommon(keywords);

    return commonKeyword || 'Mixed markets';
  }

  private identifyClusterOpportunities(markets: Market[], correlations: MarketCorrelation[]): string[] {
    const opportunities: string[] = [];

    if (markets.length >= 3) {
      opportunities.push('Multi-market arbitrage possible');
    }

    const hasInverse = correlations.some(c => c.relationship === 'inverse');
    if (hasInverse) {
      opportunities.push('Hedging strategies available');
    }

    const strongCount = correlations.filter(c => c.strength === 'strong').length;
    if (strongCount >= 3) {
      opportunities.push('Cluster-based trading strategies');
    }

    return opportunities;
  }

  private describeOpportunity(
    corr: MarketCorrelation,
    _price1: number,
    price2: number,
    expectedPrice2: number
  ): string {
    if (price2 < expectedPrice2) {
      return `${corr.market2.title} underpriced - expected ${(expectedPrice2 * 100).toFixed(1)}%, actual ${(price2 * 100).toFixed(1)}%`;
    } else {
      return `${corr.market2.title} overpriced - expected ${(expectedPrice2 * 100).toFixed(1)}%, actual ${(price2 * 100).toFixed(1)}%`;
    }
  }

  private mostCommon<T>(items: T[]): T | null {
    if (items.length === 0) return null;

    const counts = new Map<T, number>();
    for (const item of items) {
      counts.set(item, (counts.get(item) || 0) + 1);
    }

    let max = 0;
    let common: T | null = null;
    for (const [item, count] of counts) {
      if (count > max) {
        max = count;
        common = item;
      }
    }

    return common;
  }
}
