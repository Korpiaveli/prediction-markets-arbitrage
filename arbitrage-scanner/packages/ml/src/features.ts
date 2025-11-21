/**
 * Feature Extraction Module
 *
 * Extracts ML features from market pairs for model input.
 * Features are designed to capture the signals that predict:
 * 1. Whether two markets will match (same underlying event)
 * 2. Whether they will resolve identically (low resolution risk)
 */

import { Market, MarketPair } from '@arb/core';
import { FeatureVector } from './types';

export class FeatureExtractor {
  private readonly stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at',
    'to', 'for', 'of', 'with', 'by', 'from', 'will', 'be',
    'is', 'are', 'was', 'were', 'been', 'being', 'have',
    'has', 'had', 'do', 'does', 'did', 'this', 'that'
  ]);

  /**
   * Extract feature vector from a market pair
   */
  extractFeatures(kalshiMarket: Market, polyMarket: Market): FeatureVector {
    const titleSimilarity = this.calculateTitleSimilarity(
      kalshiMarket.title,
      polyMarket.title
    );

    const descriptionSimilarity = this.calculateDescriptionSimilarity(
      kalshiMarket.description,
      polyMarket.description
    );

    const keywordOverlap = this.calculateKeywordOverlap(
      kalshiMarket.title + ' ' + kalshiMarket.description,
      polyMarket.title + ' ' + polyMarket.description
    );

    const categoryMatch = this.checkCategoryMatch(kalshiMarket, polyMarket) ? 1 : 0;
    const timingMatch = this.checkTimingMatch(kalshiMarket, polyMarket) ? 1 : 0;
    const sourcesMatch = this.checkSourcesMatch(kalshiMarket, polyMarket) ? 1 : 0;

    const alignmentScore = this.calculateAlignmentScore(
      kalshiMarket,
      polyMarket,
      sourcesMatch === 1,
      timingMatch === 1
    );

    const volumeRatio = this.calculateVolumeRatio(kalshiMarket, polyMarket);
    const priceCorrelation = this.calculatePriceCorrelation(kalshiMarket, polyMarket);
    const lengthRatio = this.calculateLengthRatio(kalshiMarket, polyMarket);
    const avgWordCount = this.calculateAvgWordCount(kalshiMarket, polyMarket);

    return {
      titleSimilarity,
      descriptionSimilarity,
      keywordOverlap,
      categoryMatch,
      timingMatch,
      sourcesMatch,
      alignmentScore,
      volumeRatio,
      priceCorrelation,
      lengthRatio,
      avgWordCount
    };
  }

  /**
   * Extract features from a MarketPair object
   */
  extractFeaturesFromPair(pair: MarketPair): FeatureVector {
    return this.extractFeatures(pair.kalshiMarket, pair.polymarketMarket);
  }

  /**
   * Calculate title similarity using Levenshtein distance and word overlap
   */
  private calculateTitleSimilarity(title1: string, title2: string): number {
    const t1 = this.normalize(title1);
    const t2 = this.normalize(title2);

    if (t1 === t2) return 100;

    const distance = this.levenshteinDistance(t1, t2);
    const maxLen = Math.max(t1.length, t2.length);
    const similarity = maxLen > 0 ? (1 - distance / maxLen) * 100 : 0;

    const words1 = new Set(t1.split(/\s+/));
    const words2 = new Set(t2.split(/\s+/));
    const commonWords = [...words1].filter(w => words2.has(w)).length;
    const totalWords = Math.max(words1.size, words2.size);
    const wordOverlap = totalWords > 0 ? (commonWords / totalWords) * 100 : 0;

    return Math.max(similarity, wordOverlap);
  }

  /**
   * Calculate description similarity
   */
  private calculateDescriptionSimilarity(desc1: string, desc2: string): number {
    const d1 = this.normalize(desc1);
    const d2 = this.normalize(desc2);

    const phrases1 = new Set(d1.split(/\s+/).filter(w => w.length >= 3));
    const phrases2 = new Set(d2.split(/\s+/).filter(w => w.length >= 3));

    const common = [...phrases1].filter(p => phrases2.has(p)).length;
    const total = Math.max(phrases1.size, phrases2.size);

    return total > 0 ? (common / total) * 100 : 0;
  }

  /**
   * Calculate keyword overlap
   */
  private calculateKeywordOverlap(text1: string, text2: string): number {
    const keywords1 = this.extractKeywords(text1);
    const keywords2 = this.extractKeywords(text2);

    const common = keywords1.filter(k => keywords2.includes(k)).length;
    const total = Math.max(keywords1.length, keywords2.length);

    return total > 0 ? (common / total) * 100 : 0;
  }

  /**
   * Extract keywords from text
   */
  private extractKeywords(text: string): string[] {
    return this.normalize(text)
      .split(/\W+/)
      .filter(word => word.length > 2 && !this.stopWords.has(word));
  }

  /**
   * Check if markets share a category
   */
  private checkCategoryMatch(market1: Market, market2: Market): boolean {
    const categories1 = this.extractCategories(market1);
    const categories2 = this.extractCategories(market2);
    return categories1.some(c => categories2.includes(c));
  }

  /**
   * Extract categories from market
   */
  private extractCategories(market: Market): string[] {
    const categories: string[] = [];
    const text = (market.title + ' ' + market.description).toLowerCase();

    if (/\b(nfl|nba|mlb|nhl|soccer|football|basketball|baseball|hockey)\b/.test(text)) {
      categories.push('sports');
    }
    if (/\b(election|vote|president|senate|congress|democrat|republican)\b/.test(text)) {
      categories.push('politics');
    }
    if (/\b(bitcoin|ethereum|crypto|btc|eth|blockchain)\b/.test(text)) {
      categories.push('crypto');
    }
    if (/\b(fed|rate|inflation|gdp|recession|economy)\b/.test(text)) {
      categories.push('economy');
    }
    if (/\b(ai|gpt|openai|tech|software|google|apple|microsoft)\b/.test(text)) {
      categories.push('technology');
    }

    return categories;
  }

  /**
   * Check if timing matches
   */
  private checkTimingMatch(market1: Market, market2: Market): boolean {
    if (!market1.closeTime || !market2.closeTime) return false;
    const diff = Math.abs(market1.closeTime.getTime() - market2.closeTime.getTime());
    const daysDiff = diff / (1000 * 60 * 60 * 24);
    return daysDiff <= 7;
  }

  /**
   * Check if resolution sources match
   */
  private checkSourcesMatch(market1: Market, market2: Market): boolean {
    const source1 = (market1.metadata?.source || market1.description || '').toLowerCase();
    const source2 = (market2.metadata?.source || market2.description || '').toLowerCase();

    const commonSources = [
      'associated press', 'ap', 'fox news', 'fox', 'nbc', 'cnn', 'abc',
      'official', 'state certification', 'media consensus', 'media calls'
    ];

    for (const source of commonSources) {
      if (source1.includes(source) && source2.includes(source)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Calculate alignment score (simplified ResolutionAnalyzer logic)
   */
  private calculateAlignmentScore(
    market1: Market,
    market2: Market,
    sourcesMatch: boolean,
    timingMatch: boolean
  ): number {
    let score = 100;

    if (!sourcesMatch) score -= 40;
    if (!timingMatch) score -= 20;

    const len1 = (market1.title + market1.description).length;
    const len2 = (market2.title + market2.description).length;
    const lengthRatio = Math.min(len1, len2) / Math.max(len1, len2);
    if (lengthRatio < 0.3) score -= 15;

    return Math.max(0, score);
  }

  /**
   * Calculate volume ratio
   */
  private calculateVolumeRatio(market1: Market, market2: Market): number {
    const v1 = market1.volume24h || 1;
    const v2 = market2.volume24h || 1;
    return Math.min(v1, v2) / Math.max(v1, v2);
  }

  /**
   * Calculate price correlation (simple)
   * Uses metadata.lastPrice if available, otherwise defaults to 0.5
   */
  private calculatePriceCorrelation(market1: Market, market2: Market): number {
    const p1 = market1.metadata?.lastPrice ?? 0.5;
    const p2 = market2.metadata?.lastPrice ?? 0.5;
    return 1 - Math.abs(p1 - p2);
  }

  /**
   * Calculate length ratio
   */
  private calculateLengthRatio(market1: Market, market2: Market): number {
    const len1 = (market1.title + market1.description).length;
    const len2 = (market2.title + market2.description).length;
    return Math.min(len1, len2) / Math.max(len1, len2);
  }

  /**
   * Calculate average word count
   */
  private calculateAvgWordCount(market1: Market, market2: Market): number {
    const words1 = market1.title.split(/\s+/).length;
    const words2 = market2.title.split(/\s+/).length;
    return (words1 + words2) / 2;
  }

  /**
   * Normalize text
   */
  private normalize(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Calculate Levenshtein distance
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;
    const dp: number[][] = Array(m + 1)
      .fill(0)
      .map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
    }

    return dp[m][n];
  }

  /**
   * Convert feature vector to array for model input
   */
  toArray(features: FeatureVector): number[] {
    return [
      features.titleSimilarity / 100,
      features.descriptionSimilarity / 100,
      features.keywordOverlap / 100,
      features.categoryMatch,
      features.timingMatch,
      features.sourcesMatch,
      features.alignmentScore / 100,
      features.volumeRatio,
      features.priceCorrelation,
      features.lengthRatio,
      features.avgWordCount / 20
    ];
  }

  /**
   * Get feature names
   */
  getFeatureNames(): string[] {
    return [
      'title_similarity',
      'description_similarity',
      'keyword_overlap',
      'category_match',
      'timing_match',
      'sources_match',
      'alignment_score',
      'volume_ratio',
      'price_correlation',
      'length_ratio',
      'avg_word_count'
    ];
  }
}
