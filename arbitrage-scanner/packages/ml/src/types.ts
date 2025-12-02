/**
 * ML Module Type Definitions
 */

// Types only - no runtime imports needed

/**
 * Feature extraction result with confidence tracking
 */
export interface FeatureResult<T> {
  value: T;
  confidence: number;                // 0-1, how confident we are in this value
  source: 'computed' | 'fallback' | 'cached';
}

/**
 * Feature vector for ML model input
 */
export interface FeatureVector {
  // Text similarity features (from MarketMatcher)
  titleSimilarity: number;           // 0-100
  descriptionSimilarity: number;     // 0-100
  keywordOverlap: number;            // 0-100

  // Categorical features
  categoryMatch: number;             // 0 or 1 (boolean)
  timingMatch: number;               // 0 or 1 (boolean)

  // Resolution features (from ResolutionAnalyzer)
  sourcesMatch: number;              // 0 or 1
  alignmentScore: number;            // 0-100

  // Volume & market features
  volumeRatio: number;               // min/max volume ratio
  priceCorrelation: number;          // -1 to 1

  // Text length features
  lengthRatio: number;               // 0-1 (min/max)
  avgWordCount: number;              // average words in titles

  // Semantic similarity (from EmbeddingService)
  embeddingSimilarity: number;       // 0-100 (cosine similarity)

  // Confidence tracking for each feature (0-1)
  featureConfidence: {
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
  };
}

/**
 * Confidence interval for predictions
 */
export interface ConfidenceInterval {
  lower: number;                     // Lower bound (5th percentile)
  upper: number;                     // Upper bound (95th percentile)
  mean: number;                      // Expected value
  stdDev: number;                    // Standard deviation
}

/**
 * Market matching ML prediction
 */
export interface MatchingPrediction {
  willMatch: boolean;                // Binary prediction
  confidence: number;                // 0-100 probability
  baselineScore: number;             // Original heuristic score
  mlBoost: number;                   // ML confidence boost (-20 to +20)
  finalScore: number;                // Combined score (baseline + boost)
  features: FeatureVector;           // Input features used
  confidenceInterval?: ConfidenceInterval; // Prediction uncertainty
}

/**
 * Resolution risk ML prediction
 */
export interface ResolutionPrediction {
  willResolveIdentically: boolean;   // Binary prediction
  riskScore: number;                 // 0-100 (0=safe, 100=risky)
  baselineAlignment: number;         // Original alignment score
  mlAdjustment: number;              // ML risk adjustment (-15 to +15)
  finalAlignment: number;            // Adjusted alignment score
  tradeable: boolean;                // Safe to trade?
  features: FeatureVector;           // Input features used
  confidenceInterval?: ConfidenceInterval; // Prediction uncertainty
}

/**
 * Model configuration
 */
export interface ModelConfig {
  matchingModelUrl?: string;         // URL to matching model API
  resolutionModelUrl?: string;       // URL to resolution model API
  confidenceThreshold?: number;      // Minimum confidence (default: 70)
  useMLBoost?: boolean;              // Enable ML boosting (default: true)
  fallbackToBaseline?: boolean;      // Use baseline if ML fails (default: true)
}

/**
 * Training data point
 */
export interface TrainingExample {
  features: FeatureVector;
  label: number;                     // 0 or 1
  marketPair?: {
    kalshiId: string;
    polymarketId: string;
    actualResolution: boolean;       // Ground truth
  };
}

/**
 * Model performance metrics
 */
export interface ModelMetrics {
  accuracy: number;                  // 0-100
  precision: number;                 // 0-100
  recall: number;                    // 0-100
  f1Score: number;                   // 0-100
  truePositives: number;
  trueNegatives: number;
  falsePositives: number;
  falseNegatives: number;
}
