/**
 * Resolution Risk Predictor
 *
 * Uses ML to predict whether two matched markets will resolve identically.
 * Enhances the rule-based ResolutionAnalyzer with learned patterns.
 */

import { Market } from '@arb/core';
import { FeatureExtractor } from './features';
import { FeatureVector, ResolutionPrediction, ModelConfig } from './types';

export class ResolutionRiskPredictor {
  private readonly featureExtractor: FeatureExtractor;
  private readonly config: ModelConfig;
  private riskWeights: number[] | null = null;
  private riskIntercept: number = 0;

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
   * Load risk model weights
   */
  loadModel(weights: number[], intercept: number): void {
    this.riskWeights = weights;
    this.riskIntercept = intercept;
  }

  /**
   * Use pre-trained weights based on calibration
   * Weighted towards source matching and alignment
   * See: CALIBRATION_REPORT.md and ml_training/trained_models.json
   */
  useDefaultModel(): void {
    this.riskWeights = [
      0.08,   // title_similarity (low for resolution)
      0.05,   // description_similarity
      0.15,   // keyword_overlap
      0.12,   // category_match
      0.12,   // timing_match (important for resolution)
      0.25,   // sources_match (highest - critical for resolution)
      0.12,   // alignment_score
      0.03,   // volume_ratio
      0.03,   // price_correlation
      0.03,   // length_ratio
      0.02    // avg_word_count
    ];
    this.riskIntercept = -0.25;
  }

  /**
   * Predict resolution risk
   */
  predict(
    kalshiMarket: Market,
    polyMarket: Market,
    baselineAlignment: number
  ): ResolutionPrediction {
    const features = this.featureExtractor.extractFeatures(kalshiMarket, polyMarket);
    return this.predictFromFeatures(features, baselineAlignment);
  }

  /**
   * Predict from pre-extracted features
   */
  predictFromFeatures(
    features: FeatureVector,
    baselineAlignment: number
  ): ResolutionPrediction {
    if (!this.riskWeights && this.config.fallbackToBaseline) {
      return this.fallbackPrediction(features, baselineAlignment);
    }

    if (!this.riskWeights) {
      this.useDefaultModel();
    }

    const featureArray = this.featureExtractor.toArray(features);
    const mlAlignmentScore = this.calculateMLAlignment(featureArray);
    const mlAdjustment = this.calculateAdjustment(mlAlignmentScore, baselineAlignment);
    const finalAlignment = Math.min(100, Math.max(0, baselineAlignment + mlAdjustment));
    const riskScore = 100 - finalAlignment;

    return {
      willResolveIdentically: finalAlignment >= 70,
      riskScore,
      baselineAlignment,
      mlAdjustment,
      finalAlignment,
      tradeable: finalAlignment >= 70 && riskScore < 30,
      features
    };
  }

  /**
   * Calculate ML alignment score
   */
  private calculateMLAlignment(featureArray: number[]): number {
    if (!this.riskWeights) return 50;

    let score = this.riskIntercept;
    for (let i = 0; i < featureArray.length && i < this.riskWeights.length; i++) {
      score += featureArray[i] * this.riskWeights[i];
    }

    return this.sigmoid(score) * 100;
  }

  /**
   * Calculate adjustment to baseline alignment
   */
  private calculateAdjustment(mlScore: number, baselineAlignment: number): number {
    if (!this.config.useMLBoost) return 0;

    const diff = mlScore - baselineAlignment;
    return Math.max(-15, Math.min(15, diff * 0.3));
  }

  /**
   * Sigmoid function
   */
  private sigmoid(x: number): number {
    return 1 / (1 + Math.exp(-x));
  }

  /**
   * Fallback prediction
   */
  private fallbackPrediction(
    features: FeatureVector,
    baselineAlignment: number
  ): ResolutionPrediction {
    const riskScore = 100 - baselineAlignment;

    return {
      willResolveIdentically: baselineAlignment >= 70,
      riskScore,
      baselineAlignment,
      mlAdjustment: 0,
      finalAlignment: baselineAlignment,
      tradeable: baselineAlignment >= 70 && riskScore < 30,
      features
    };
  }

  /**
   * Calculate risk level category
   */
  getRiskLevel(prediction: ResolutionPrediction): 'low' | 'medium' | 'high' | 'critical' {
    if (prediction.riskScore < 15) return 'low';
    if (prediction.riskScore < 30) return 'medium';
    if (prediction.riskScore < 50) return 'high';
    return 'critical';
  }

  /**
   * Get trading recommendation
   */
  getRecommendation(prediction: ResolutionPrediction): string {
    const riskLevel = this.getRiskLevel(prediction);

    switch (riskLevel) {
      case 'low':
        return 'Safe to trade - high resolution alignment';
      case 'medium':
        return 'Proceed with caution - verify resolution criteria manually';
      case 'high':
        return 'Significant risk - manual review required before trading';
      case 'critical':
        return 'Do not trade - high likelihood of different resolution';
    }
  }

  /**
   * Get risk factors
   */
  getRiskFactors(prediction: ResolutionPrediction): string[] {
    const factors: string[] = [];
    const f = prediction.features;

    if (f.sourcesMatch === 0) {
      factors.push('Different resolution sources');
    }
    if (f.timingMatch === 0) {
      factors.push('Different timing/end dates');
    }
    if (f.alignmentScore < 70) {
      factors.push('Low baseline alignment score');
    }
    if (f.keywordOverlap < 50) {
      factors.push('Limited keyword overlap');
    }
    if (f.categoryMatch === 0) {
      factors.push('Different market categories');
    }

    return factors;
  }
}
