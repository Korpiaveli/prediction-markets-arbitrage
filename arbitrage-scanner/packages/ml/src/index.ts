/**
 * @arb/ml - Machine Learning & Intelligence Module
 *
 * Complete intelligence layer for arbitrage trading:
 * - ML-enhanced market matching and resolution risk prediction
 * - Historical pattern analysis and insights
 * - Liquidity depth analysis for execution feasibility
 * - Backtesting engine for strategy validation
 * - Market correlation detection for advanced strategies
 * - Opportunity forecasting and timing prediction
 * - Automated trading strategy evaluation and position sizing
 *
 * Strategy: Simple scikit-learn models, no deep learning complexity.
 */

export { FeatureExtractor } from './features';
export { MarketMatchingPredictor } from './matching';
export { ResolutionRiskPredictor } from './resolution';
export { ModelService } from './service';
export { PatternAnalyzer } from './patterns';
export { LiquidityAnalyzer } from './liquidity';
export { BacktestEngine } from './backtest';
export { HistoricalBacktestEngine } from './HistoricalBacktestEngine';
export { CorrelationDetector } from './correlation';
export { OpportunityPredictor } from './predictor';
export { TradingStrategyEvaluator } from './strategy';
export { EmbeddingService, getEmbeddingService, resetEmbeddingService } from './embeddings';
export { RecommendationEngine } from './RecommendationEngine';
export { PositionSizer } from './PositionSizer';
export { ConfidenceTracker } from './ConfidenceTracker';
export { MonteCarloSimulator } from './MonteCarloSimulator';
export { KalshiTickerParser, kalshiTickerParser } from './parsers';
export type { ParsedKalshiTicker } from './parsers';
export { HardBlockerValidator, hardBlockerValidator } from './validators';
export type { HardBlockerResult, BlockerSeverity } from './validators';
export { ChromaVectorStore, getVectorStore, resetVectorStore } from './vector';
export type { SimilarMarket, VectorFilters, ChromaVectorStoreConfig } from './vector';

export type {
  FeatureVector,
  FeatureResult,
  MatchingPrediction,
  ResolutionPrediction,
  ModelConfig,
  ConfidenceInterval,
  Recommendation,
  RecommendationReport,
  RecommendationScore,
  RecommendationWeights,
  RecommendationConfig,
  RecommendationFilters,
  ReportSummary,
  CategoryPerformance,
  SimilarOpportunity,
  RiskLevel,
  // Capital turnover types
  TurnoverStrategyType,
  TurnoverScoringWeights,
  TurnoverStrategyConfig,
  ConfidenceBucketStats,
  CompoundingProjectionResult,
  MonteCarloConfig,
  MonteCarloResults,
  KellyPositionSize,
  CompoundingBacktestConfig,
  CompoundingBacktestResult
} from './types';

export {
  DEFAULT_TURNOVER_STRATEGIES,
  DEFAULT_WIN_RATES
} from './types';

export type {
  TemporalPattern,
  CategoryPattern,
  PatternStats,
  ProfitDistribution,
  DurationPattern,
  PatternAnalysisResult
} from './patterns';

export type {
  LiquidityAnalysis,
  LiquiditySide,
  PriceImpactEstimate,
  ExecutionFeasibility
} from './liquidity';

export type {
  BacktestConfig,
  Trade,
  BacktestResult,
  StrategyParams,
  CompoundingBacktestMetrics
} from './backtest';

export type {
  ConfidenceBucket,
  BucketPerformance,
  TrackedTrade,
  CalibrationMetrics,
  PerformanceSummary
} from './ConfidenceTracker';

export type {
  SimulationPath,
  EnhancedMonteCarloConfig,
  StrategyComparison
} from './MonteCarloSimulator';

export type {
  HistoricalBacktestConfig,
  HistoricalPosition,
  HistoricalTrade,
  WeekResult,
  HistoricalBacktestResult
} from './HistoricalBacktestEngine';

export type {
  MarketCorrelation,
  CorrelationCluster,
  PriceHistory
} from './correlation';

export type {
  OpportunityForecast,
  TimingPrediction
} from './predictor';

export type {
  PositionSize,
  RiskMetrics,
  StrategySignal,
  StrategyConfig
} from './strategy';
