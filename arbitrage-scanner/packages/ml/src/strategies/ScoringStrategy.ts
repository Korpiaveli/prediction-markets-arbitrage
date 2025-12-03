import { FeatureVector } from '../types.js';
import { Market } from '@arb/core';

/**
 * Scoring strategy for market matching
 *
 * Different exchange pairs require different matching strategies:
 * - Kalshi-Polymarket: Cross-platform (different writing styles)
 * - Kalshi-Kalshi: Same platform (expect high similarity)
 * - Polymarket-Polymarket: Same platform (expect high similarity)
 *
 * Each strategy defines:
 * - Feature weights (how important each feature is)
 * - Thresholds (minimum scores for matching)
 * - Normalization (how to interpret scores across platforms)
 */
export interface FeatureWeights {
  titleSimilarity: number;
  descriptionSimilarity: number;
  keywordOverlap: number;
  categoryMatch: number;
  timingMatch: number;
  sourcesMatch: number;
  alignmentScore: number;
  volumeRatio: number;
  priceCorrelation: number;
  lengthRatio: number;
  avgWordCount: number;
  embeddingSimilarity: number;
  temporalDistance: number;
  outcomeMatch: number;
}

export interface ScoringThresholds {
  minMatchScore: number;          // Minimum score to consider a match (0-100)
  minConfidence: number;           // Minimum confidence for features (0-1)
  strictMode: boolean;             // Require all critical features to pass
}

export interface ScoringStrategy {
  /**
   * Name of the strategy (e.g., "kalshi-polymarket")
   */
  readonly name: string;

  /**
   * Description of the strategy
   */
  readonly description: string;

  /**
   * Feature weights for this strategy
   * Weights should sum to 1.0
   */
  readonly weights: FeatureWeights;

  /**
   * Scoring thresholds
   */
  readonly thresholds: ScoringThresholds;

  /**
   * Calculate match score from feature vector
   *
   * @param features - Extracted features
   * @param market1 - First market (for context-aware scoring)
   * @param market2 - Second market (for context-aware scoring)
   * @returns Match score (0-100)
   */
  calculateScore(features: FeatureVector, market1: Market, market2: Market): number;

  /**
   * Check if two markets match based on this strategy
   *
   * @param features - Extracted features
   * @param market1 - First market
   * @param market2 - Second market
   * @returns True if markets match
   */
  isMatch(features: FeatureVector, market1: Market, market2: Market): boolean;
}

/**
 * Base implementation of scoring strategy
 */
export abstract class BaseScoringStrategy implements ScoringStrategy {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly weights: FeatureWeights;
  abstract readonly thresholds: ScoringThresholds;

  /**
   * Default score calculation: weighted sum with confidence adjustment
   */
  calculateScore(features: FeatureVector, _market1: Market, _market2: Market): number {
    let totalScore = 0;
    let totalWeight = 0;
    const skippedFeatures: string[] = [];

    const featureEntries: Array<[keyof FeatureWeights, number]> = [
      ['titleSimilarity', features.titleSimilarity],
      ['descriptionSimilarity', features.descriptionSimilarity],
      ['keywordOverlap', features.keywordOverlap],
      ['categoryMatch', features.categoryMatch * 100],
      ['timingMatch', features.timingMatch * 100],
      ['sourcesMatch', features.sourcesMatch * 100],
      ['alignmentScore', features.alignmentScore],
      ['volumeRatio', features.volumeRatio * 100],
      ['priceCorrelation', features.priceCorrelation * 100],
      ['lengthRatio', features.lengthRatio * 100],
      ['avgWordCount', Math.min(features.avgWordCount / 20 * 100, 100)],
      ['embeddingSimilarity', features.embeddingSimilarity]
    ];

    for (const [key, value] of featureEntries) {
      const weight = this.weights[key];
      const confidence = features.featureConfidence[key];

      if (confidence < this.thresholds.minConfidence) {
        skippedFeatures.push(`${key}(conf:${confidence.toFixed(2)})`);
        continue;
      }

      const adjustedWeight = weight * confidence;
      totalScore += value * adjustedWeight;
      totalWeight += adjustedWeight;
    }

    const finalScore = totalWeight > 0 ? totalScore / totalWeight : 0;

    // Diagnostic logging for score calculation
    console.log(`[DEBUG Score] final: ${finalScore.toFixed(1)}%, totalWeight: ${totalWeight.toFixed(3)}, skipped: [${skippedFeatures.join(', ')}]`);

    return finalScore;
  }

  /**
   * Default match check: score above threshold
   */
  isMatch(features: FeatureVector, market1: Market, market2: Market): boolean {
    const score = this.calculateScore(features, market1, market2);
    return score >= this.thresholds.minMatchScore;
  }

  /**
   * Validate that weights sum to ~1.0
   */
  protected validateWeights(): void {
    const sum = Object.values(this.weights).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1.0) > 0.01) {
      console.warn(`[${this.name}] Weights sum to ${sum.toFixed(3)}, expected 1.0`);
    }
  }
}
