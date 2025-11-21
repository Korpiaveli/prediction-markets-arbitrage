/**
 * Market Matching Predictor
 *
 * Uses trained RandomForest model to predict whether two markets
 * will resolve identically (i.e., they represent the same underlying event).
 */

import { Market } from '@arb/core';
import { FeatureExtractor } from './features';
import { FeatureVector, MatchingPrediction, ModelConfig } from './types';

export class MarketMatchingPredictor {
  private readonly featureExtractor: FeatureExtractor;
  private readonly config: ModelConfig;
  private modelWeights: number[] | null = null;
  private modelIntercept: number = 0;

  constructor(config: ModelConfig = {}) {
    this.featureExtractor = new FeatureExtractor();
    this.config = {
      confidenceThreshold: config.confidenceThreshold ?? 55,
      useMLBoost: config.useMLBoost ?? true,
      fallbackToBaseline: config.fallbackToBaseline ?? true,
      ...config
    };
  }

  /**
   * Load model weights (from training output)
   * For RandomForest, we use a simplified logistic approximation
   */
  loadModel(weights: number[], intercept: number): void {
    this.modelWeights = weights;
    this.modelIntercept = intercept;
  }

  /**
   * Use pre-trained weights based on calibration
   * Weights derived from 2024 election historical data analysis
   * See: CALIBRATION_REPORT.md and ml_training/trained_models.json
   */
  useDefaultModel(): void {
    this.modelWeights = [
      0.12,   // title_similarity (moderate)
      0.08,   // description_similarity (lower)
      0.25,   // keyword_overlap (highest - proven reliable)
      0.15,   // category_match (strong signal)
      0.10,   // timing_match
      0.12,   // sources_match
      0.08,   // alignment_score
      0.03,   // volume_ratio
      0.03,   // price_correlation
      0.02,   // length_ratio
      0.02    // avg_word_count
    ];
    this.modelIntercept = -0.30;
  }

  /**
   * Predict if two markets will match
   */
  predict(kalshiMarket: Market, polyMarket: Market, baselineScore: number): MatchingPrediction {
    const features = this.featureExtractor.extractFeatures(kalshiMarket, polyMarket);
    return this.predictFromFeatures(features, baselineScore);
  }

  /**
   * Predict from pre-extracted features
   */
  predictFromFeatures(features: FeatureVector, baselineScore: number): MatchingPrediction {
    if (!this.modelWeights && this.config.fallbackToBaseline) {
      return this.fallbackPrediction(features, baselineScore);
    }

    if (!this.modelWeights) {
      this.useDefaultModel();
    }

    const featureArray = this.featureExtractor.toArray(features);
    const mlScore = this.calculateMLScore(featureArray);
    const mlBoost = this.calculateBoost(mlScore, baselineScore);
    const finalScore = Math.min(100, Math.max(0, baselineScore + mlBoost));

    return {
      willMatch: finalScore >= this.config.confidenceThreshold!,
      confidence: mlScore,
      baselineScore,
      mlBoost,
      finalScore,
      features
    };
  }

  /**
   * Calculate ML score using weighted sum
   */
  private calculateMLScore(featureArray: number[]): number {
    if (!this.modelWeights) return 50;

    let score = this.modelIntercept;
    for (let i = 0; i < featureArray.length && i < this.modelWeights.length; i++) {
      score += featureArray[i] * this.modelWeights[i];
    }

    return this.sigmoid(score) * 100;
  }

  /**
   * Calculate boost to apply to baseline
   */
  private calculateBoost(mlScore: number, baselineScore: number): number {
    if (!this.config.useMLBoost) return 0;

    const diff = mlScore - baselineScore;
    return Math.max(-20, Math.min(20, diff * 0.4));
  }

  /**
   * Sigmoid function
   */
  private sigmoid(x: number): number {
    return 1 / (1 + Math.exp(-x));
  }

  /**
   * Fallback prediction using baseline only
   */
  private fallbackPrediction(features: FeatureVector, baselineScore: number): MatchingPrediction {
    return {
      willMatch: baselineScore >= this.config.confidenceThreshold!,
      confidence: baselineScore,
      baselineScore,
      mlBoost: 0,
      finalScore: baselineScore,
      features
    };
  }

  /**
   * Batch predict for multiple pairs
   */
  batchPredict(
    pairs: Array<{ kalshi: Market; poly: Market; baseline: number }>
  ): MatchingPrediction[] {
    return pairs.map(p => this.predict(p.kalshi, p.poly, p.baseline));
  }

  /**
   * Get feature importance (from model weights)
   */
  getFeatureImportance(): Record<string, number> {
    if (!this.modelWeights) {
      this.useDefaultModel();
    }

    const names = this.featureExtractor.getFeatureNames();
    const importance: Record<string, number> = {};

    names.forEach((name, i) => {
      importance[name] = this.modelWeights![i] || 0;
    });

    return importance;
  }
}
