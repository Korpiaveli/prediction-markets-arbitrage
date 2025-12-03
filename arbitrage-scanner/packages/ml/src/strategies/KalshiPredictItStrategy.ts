import { BaseScoringStrategy, FeatureWeights, ScoringThresholds } from './ScoringStrategy.js';

/**
 * Scoring strategy for Kalshi-PredictIt cross-platform matching
 *
 * Challenges:
 * - PredictIt uses multi-outcome contracts (e.g., "Which party wins House?: Republican")
 * - Temporal false positives (2026 vs 2028 elections must be prevented)
 * - Same PredictIt contract matching multiple Kalshi markets (needs stricter validation)
 * - Different market structures require outcome-aware matching
 *
 * Strategy:
 * - HIGH embedding similarity (semantic understanding is critical)
 * - HIGH timing match (prevent year mismatches)
 * - MEDIUM category match (critical signal)
 * - MEDIUM alignment score (resolution rules matter for real money)
 * - MEDIUM description similarity (both exchanges have good descriptions)
 * - Lower weights for volume, price, length (not predictive for this pair)
 *
 * Optimized for real-money trading with 70%+ confidence threshold
 */
export class KalshiPredictItStrategy extends BaseScoringStrategy {
  readonly name = 'kalshi-predictit';
  readonly description = 'Cross-platform matching strategy for Kalshi and PredictIt markets';

  readonly weights: FeatureWeights = {
    embeddingSimilarity: 0.20,       // Highest - semantic understanding critical
    timingMatch: 0.18,               // Very high - prevent year mismatches
    titleSimilarity: 0.14,           // Medium - after normalization
    keywordOverlap: 0.14,            // Medium - important signals
    categoryMatch: 0.15,             // High - critical for politics/sports
    alignmentScore: 0.11,            // Medium-high - resolution matters
    descriptionSimilarity: 0.06,     // Low-medium - both have descriptions
    volumeRatio: 0.01,               // Very low - not predictive
    priceCorrelation: 0.01,          // Very low - different market structures
    lengthRatio: 0.00,               // Zero - penalizes cross-platform
    avgWordCount: 0.00,              // Zero - not meaningful
    sourcesMatch: 0.00               // Zero - hard to extract reliably
  };

  readonly thresholds: ScoringThresholds = {
    minMatchScore: 70,               // Higher threshold for real-money trading
    minConfidence: 0.6,              // Require high-quality features
    strictMode: true                 // Enable for real-money (strict validation)
  };

  constructor() {
    super();
    this.validateWeights();
  }
}
