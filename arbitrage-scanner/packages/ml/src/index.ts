/**
 * @arb/ml - Machine Learning Module
 *
 * Enhances market matching and resolution risk prediction using trained models.
 * Strategy: Simple scikit-learn models, no deep learning complexity.
 */

export { FeatureExtractor } from './features';
export { MarketMatchingPredictor } from './matching';
export { ResolutionRiskPredictor } from './resolution';
export { ModelService } from './service';

export type {
  FeatureVector,
  MatchingPrediction,
  ResolutionPrediction,
  ModelConfig
} from './types';
