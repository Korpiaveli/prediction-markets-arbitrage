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

// ============================================================================
// CAPITAL TURNOVER OPTIMIZATION TYPES
// ============================================================================

/**
 * Strategy preset names for capital turnover optimization
 */
export type TurnoverStrategyType = 'conservative' | 'balanced' | 'aggressive';

/**
 * Weight configuration for turnover scoring (must sum to 1.0)
 * Priority: Confidence > Time > Profit
 */
export interface TurnoverScoringWeights {
  confidence: number;  // Weight for confidence/risk minimization (default: 0.40)
  time: number;        // Weight for faster resolution/turnover (default: 0.35)
  profit: number;      // Weight for profit per trade (default: 0.25)
}

/**
 * Configuration for a turnover strategy preset
 */
export interface TurnoverStrategyConfig {
  name: TurnoverStrategyType;
  description: string;
  weights: TurnoverScoringWeights;
  minConfidence: number;           // Minimum confidence score (0-100)
  maxDaysToResolution: number;     // Maximum days to include
  minProfitPercent: number;        // Minimum profit % per trade
}

/**
 * Default strategy presets
 */
export const DEFAULT_TURNOVER_STRATEGIES: Record<TurnoverStrategyType, TurnoverStrategyConfig> = {
  conservative: {
    name: 'conservative',
    description: 'High confidence, lower risk - prioritizes certainty over speed',
    weights: { confidence: 0.50, time: 0.30, profit: 0.20 },
    minConfidence: 90,
    maxDaysToResolution: 30,
    minProfitPercent: 1.5
  },
  balanced: {
    name: 'balanced',
    description: 'Balanced approach - good mix of confidence, turnover, and profit',
    weights: { confidence: 0.40, time: 0.35, profit: 0.25 },
    minConfidence: 80,
    maxDaysToResolution: 60,
    minProfitPercent: 1.0
  },
  aggressive: {
    name: 'aggressive',
    description: 'Maximum turnover - prioritizes fast resolution for compounding',
    weights: { confidence: 0.30, time: 0.45, profit: 0.25 },
    minConfidence: 70,
    maxDaysToResolution: 14,
    minProfitPercent: 0.5
  }
};

/**
 * Win rate expectations by confidence bucket
 */
export interface ConfidenceBucketStats {
  bucket: string;              // e.g., "95-100", "85-94", "75-84", "<75"
  minConfidence: number;
  maxConfidence: number;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;             // 0-1
  avgProfit: number;           // Average profit % on wins
  avgLoss: number;             // Average loss % on losses
  avgDaysToResolution: number;
}

/**
 * Default win rate expectations (will be refined with historical data)
 */
export const DEFAULT_WIN_RATES: ConfidenceBucketStats[] = [
  { bucket: '95-100', minConfidence: 95, maxConfidence: 100, totalTrades: 0, wins: 0, losses: 0, winRate: 0.99, avgProfit: 2.0, avgLoss: 50, avgDaysToResolution: 14 },
  { bucket: '85-94', minConfidence: 85, maxConfidence: 94, totalTrades: 0, wins: 0, losses: 0, winRate: 0.95, avgProfit: 2.0, avgLoss: 50, avgDaysToResolution: 21 },
  { bucket: '75-84', minConfidence: 75, maxConfidence: 84, totalTrades: 0, wins: 0, losses: 0, winRate: 0.90, avgProfit: 2.5, avgLoss: 50, avgDaysToResolution: 30 },
  { bucket: '<75', minConfidence: 0, maxConfidence: 74, totalTrades: 0, wins: 0, losses: 0, winRate: 0.80, avgProfit: 3.0, avgLoss: 50, avgDaysToResolution: 45 }
];

/**
 * Compounding projection for a given capital and strategy
 */
export interface CompoundingProjectionResult {
  startingCapital: number;
  endingCapital: number;
  totalReturn: number;
  returnPercent: number;
  annualizedReturn: number;
  expectedTrades: number;
  expectedWins: number;
  expectedLosses: number;
  avgDaysPerTrade: number;
  confidenceInterval: {
    p5: number;      // 5th percentile (worst case)
    p25: number;     // 25th percentile
    p50: number;     // Median
    p75: number;     // 75th percentile
    p95: number;     // 95th percentile (best case)
  };
  period: 'monthly' | 'quarterly' | 'annual';
  strategy: TurnoverStrategyType;
}

/**
 * Monte Carlo simulation configuration
 */
export interface MonteCarloConfig {
  simulations: number;         // Number of simulation runs (default: 1000)
  period: 'monthly' | 'quarterly' | 'annual';
  capital: number;             // Starting capital
  strategy: TurnoverStrategyType;
  useHistoricalWinRates: boolean;  // Use tracked win rates vs defaults
}

/**
 * Monte Carlo simulation results
 */
export interface MonteCarloResults {
  config: MonteCarloConfig;
  profitDistribution: {
    min: number;
    max: number;
    mean: number;
    median: number;
    stdDev: number;
    percentiles: Record<number, number>;  // percentile -> value
  };
  riskMetrics: {
    probabilityOfLoss: number;       // 0-1
    probabilityOfDoubling: number;   // 0-1
    expectedMaxDrawdown: number;     // As percentage
    worstDrawdown: number;           // Worst observed in sims
    sharpeRatio: number;
  };
  tradeMetrics: {
    avgTradesPerPeriod: number;
    avgWinRate: number;
    avgProfitPerTrade: number;
  };
}

/**
 * Position sizing recommendation using Kelly criterion
 */
export interface KellyPositionSize {
  fullKellyPercent: number;      // Full Kelly as % of bankroll
  halfKellyPercent: number;      // Conservative half-Kelly
  quarterKellyPercent: number;   // Very conservative quarter-Kelly
  recommendedPercent: number;    // Strategy-appropriate recommendation
  recommendedAmount: number;     // Dollar amount based on bankroll
  maxRiskAmount: number;         // Maximum risk exposure
  reasoning: string;             // Human-readable explanation
}

/**
 * Backtest configuration for true compounding mode
 */
export interface CompoundingBacktestConfig {
  startDate: Date;
  endDate: Date;
  initialCapital: number;
  strategy: TurnoverStrategyType;
  customWeights?: TurnoverScoringWeights;
  positionSizing: 'kelly' | 'half_kelly' | 'fixed_percent';
  fixedPositionPercent?: number;  // If using fixed_percent
  reinvestProfits: boolean;       // True = compound, false = flat
  maxPositionPercent: number;     // Max % of capital per trade
  slippageModel: 'conservative' | 'realistic' | 'optimistic';
}

/**
 * Backtest result with compounding metrics
 */
export interface CompoundingBacktestResult {
  config: CompoundingBacktestConfig;
  trades: {
    opportunityId: string;
    timestamp: Date;
    positionSize: number;
    profitPercent: number;
    outcome: 'win' | 'loss';
    capitalBefore: number;
    capitalAfter: number;
    confidenceBucket: string;
  }[];
  summary: {
    totalTrades: number;
    wins: number;
    losses: number;
    winRate: number;
    totalProfit: number;
    finalCapital: number;
    returnPercent: number;
    maxDrawdown: number;
    maxDrawdownPercent: number;
    sharpeRatio: number;
    avgDaysPerTrade: number;
    capitalTurns: number;
  };
  confidenceBucketStats: ConfidenceBucketStats[];
  equityCurve: { timestamp: Date; capital: number }[];
}
