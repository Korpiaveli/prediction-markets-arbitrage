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
export { CorrelationDetector } from './correlation';
export { OpportunityPredictor } from './predictor';
export { TradingStrategyEvaluator } from './strategy';
export { EmbeddingService, getEmbeddingService, resetEmbeddingService } from './embeddings';

export type {
  FeatureVector,
  MatchingPrediction,
  ResolutionPrediction,
  ModelConfig,
  ConfidenceInterval
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
  StrategyParams
} from './backtest';

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
