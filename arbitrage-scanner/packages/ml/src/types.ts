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

  // Temporal features (prevent year mismatches)
  temporalDistance: number;          // 0-1 (1=same year, 0=2+ years apart)
  outcomeMatch: number;              // 0 or 1 (for PredictIt multi-outcome contracts)

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
    temporalDistance: number;
    outcomeMatch: number;
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

// ============================================================================
// RECOMMENDATION ENGINE TYPES
// ============================================================================

/**
 * Recommendation score weights (must sum to 1.0)
 */
export interface RecommendationWeights {
  time: number;        // Weight for time-to-resolution score (default: 0.35)
  profit: number;      // Weight for profit score (default: 0.35)
  confidence: number;  // Weight for resolution confidence (default: 0.30)
}

/**
 * Breakdown of recommendation score components
 */
export interface RecommendationScore {
  overall: number;           // 0-100 composite score
  timeScore: number;         // 0-100 (faster resolution = higher)
  profitScore: number;       // 0-100 (higher profit = higher)
  confidenceScore: number;   // 0-100 (resolution confidence)
  weights: RecommendationWeights;
}

/**
 * Historical performance for a market category
 */
export interface CategoryPerformance {
  category: string;
  historicalWinRate: number;     // 0-1
  avgProfit: number;             // Average profit %
  avgDurationHours: number;      // Average time to resolution
  totalOpportunities: number;    // Number of historical opportunities
  recentTrend: 'improving' | 'stable' | 'declining';
}

/**
 * Similar past opportunity for context
 */
export interface SimilarOpportunity {
  id: string;
  title: string;
  profitPercent: number;
  outcome: 'win' | 'loss' | 'pending';
  durationHours: number;
  similarity: number;  // 0-100
}

/**
 * Risk level classification
 */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * Complete recommendation for an arbitrage opportunity
 */
export interface Recommendation {
  id: string;
  rank: number;
  opportunityId: string;
  timestamp: Date;
  score: RecommendationScore;

  // Opportunity details
  market1Title: string;
  market2Title: string;
  exchange1: string;
  exchange2: string;
  profitPercent: number;

  // Time analysis
  hoursUntilResolution: number | null;
  resolutionDate: Date | null;
  capitalTurnoverDays: number | null;

  // Risk analysis
  resolutionConfidence: number;
  riskLevel: RiskLevel;
  riskFactors: string[];

  // Historical context
  category: string;
  categoryPerformance: CategoryPerformance | null;
  similarPastOpportunities: SimilarOpportunity[];

  // Human-readable insights
  reasoning: string[];
  actionItems: string[];
}

/**
 * Summary statistics for a recommendation report
 */
export interface ReportSummary {
  avgScore: number;
  avgProfit: number;
  avgHoursToResolution: number | null;
  categoryBreakdown: Record<string, number>;
  riskDistribution: Record<RiskLevel, number>;
  topCategory: string | null;
  totalPotentialProfit: number;
}

/**
 * Filters for generating recommendations
 */
export interface RecommendationFilters {
  minScore?: number;
  minProfit?: number;
  maxHoursToResolution?: number;
  categories?: string[];
  riskLevels?: RiskLevel[];
  exchanges?: string[];
}

/**
 * Configuration for the recommendation engine
 */
export interface RecommendationConfig {
  weights: RecommendationWeights;
  filters: RecommendationFilters;
  topN: number;
  includeHistoricalContext: boolean;
  includeReasoning: boolean;
}

/**
 * Complete recommendation report
 */
export interface RecommendationReport {
  generatedAt: Date;
  totalOpportunities: number;
  totalRecommended: number;
  recommendations: Recommendation[];
  summary: ReportSummary;
  filters: RecommendationFilters;
  config: RecommendationConfig;
}
