import { BaseScoringStrategy, FeatureWeights, ScoringThresholds } from './ScoringStrategy.js';

/**
 * Scoring strategy for Kalshi-DraftKings cross-platform matching
 *
 * Both platforms are CFTC-regulated event contract exchanges:
 * - Similar market structure (binary YES/NO outcomes)
 * - Similar regulatory requirements (clear resolution criteria)
 * - Similar fee models (per-contract fees)
 * - Expected to have overlapping markets (politics, sports, economics)
 *
 * Strategy:
 * - Higher weight on title similarity (both use clear, regulatory-compliant titles)
 * - Emphasize category and timing matches
 * - Use embedding similarity for semantic matching
 * - Moderate threshold since both platforms follow similar conventions
 */
export class KalshiDraftKingsStrategy extends BaseScoringStrategy {
  readonly name = 'kalshi-draftkings';
  readonly description = 'Cross-platform matching strategy for Kalshi and DraftKings Predictions markets';

  readonly weights: FeatureWeights = {
    titleSimilarity: 0.18,           // High - both use clear regulatory titles
    descriptionSimilarity: 0.08,     // Medium - both have resolution rules
    keywordOverlap: 0.14,            // High - important for matching
    categoryMatch: 0.15,             // High - critical signal
    timingMatch: 0.12,               // High - both are time-bound events
    sourcesMatch: 0.05,              // Low - may differ by platform
    alignmentScore: 0.03,            // Low - structure may vary
    volumeRatio: 0.02,               // Very low - liquidity differs
    priceCorrelation: 0.06,          // Medium - useful for validation
    lengthRatio: 0.02,               // Very low - not meaningful
    avgWordCount: 0.01,              // Very low - not meaningful
    embeddingSimilarity: 0.12,       // High - semantic meaning
    temporalDistance: 0.02,          // Low - close times expected
    outcomeMatch: 0.00               // Zero - both binary
  };

  readonly thresholds: ScoringThresholds = {
    minMatchScore: 60,               // Moderate threshold (similar platforms)
    minConfidence: 0.35,             // Reasonable confidence requirement
    strictMode: false                // Flexible matching
  };

  constructor() {
    super();
    this.validateWeights();
  }
}
