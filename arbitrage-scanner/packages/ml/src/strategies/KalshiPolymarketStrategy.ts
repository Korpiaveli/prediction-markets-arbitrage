import { BaseScoringStrategy, FeatureWeights, ScoringThresholds } from './ScoringStrategy.js';

/**
 * Scoring strategy for Kalshi-Polymarket cross-platform matching
 *
 * Challenges:
 * - Kalshi uses concise titles (26-50 chars)
 * - Polymarket uses verbose marketing language (150+ chars)
 * - Kalshi descriptions often empty, Polymarket has long descriptions
 * - Different writing styles require normalization
 *
 * Strategy:
 * - Emphasize semantic similarity (embeddings) over exact text match
 * - De-emphasize length-based features (would penalize cross-platform)
 * - Prioritize category, timing, and keyword overlap
 * - Use normalizers to standardize text before comparison
 */
export class KalshiPolymarketStrategy extends BaseScoringStrategy {
  readonly name = 'kalshi-polymarket';
  readonly description = 'Cross-platform matching strategy for Kalshi and Polymarket markets';

  readonly weights: FeatureWeights = {
    titleSimilarity: 0.15,           // Medium - after normalization
    descriptionSimilarity: 0.05,     // Low - Kalshi often empty
    keywordOverlap: 0.15,            // Medium - important after normalization
    categoryMatch: 0.15,             // High - critical signal
    timingMatch: 0.10,               // Medium - some markets lack dates
    sourcesMatch: 0.05,              // Low - hard to extract reliably
    alignmentScore: 0.05,            // Low - too strict for cross-platform
    volumeRatio: 0.02,               // Very low - not predictive
    priceCorrelation: 0.08,          // Medium - useful signal
    lengthRatio: 0.02,               // Very low - penalizes cross-platform
    avgWordCount: 0.02,              // Very low - not meaningful
    embeddingSimilarity: 0.16,       // Highest - semantic meaning
    temporalDistance: 0.00,          // Zero - less critical for Polymarket
    outcomeMatch: 0.00               // Zero - Polymarket rarely has multi-outcome
  };

  readonly thresholds: ScoringThresholds = {
    minMatchScore: 55,               // Lower threshold for cross-platform (was 70)
    minConfidence: 0.3,              // Accept fallback features
    strictMode: false                // Flexible matching for cross-platform
  };

  constructor() {
    super();
    this.validateWeights();
  }
}
