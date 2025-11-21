/**
 * ML Model Service
 *
 * Central service for ML predictions that integrates with
 * MarketMatcher and ResolutionAnalyzer.
 */

import { Market, MarketPair } from '@arb/core';
import { FeatureExtractor } from './features';
import { MarketMatchingPredictor } from './matching';
import { ResolutionRiskPredictor } from './resolution';
import {
  MatchingPrediction,
  ResolutionPrediction,
  ModelConfig,
  TrainingExample,
  ModelMetrics
} from './types';

export interface EnhancedPrediction {
  matching: MatchingPrediction;
  resolution: ResolutionPrediction;
  combinedScore: number;
  tradeable: boolean;
  recommendation: 'strong_buy' | 'buy' | 'caution' | 'avoid';
  reasons: string[];
}

export class ModelService {
  private readonly featureExtractor: FeatureExtractor;
  private readonly matchingPredictor: MarketMatchingPredictor;
  private readonly resolutionPredictor: ResolutionRiskPredictor;
  private isInitialized: boolean = false;

  constructor(config: ModelConfig = {}) {
    this.featureExtractor = new FeatureExtractor();
    this.matchingPredictor = new MarketMatchingPredictor(config);
    this.resolutionPredictor = new ResolutionRiskPredictor(config);
  }

  /**
   * Initialize with default models
   */
  initialize(): void {
    this.matchingPredictor.useDefaultModel();
    this.resolutionPredictor.useDefaultModel();
    this.isInitialized = true;
  }

  /**
   * Load custom model weights
   */
  loadModels(
    matchingWeights: number[],
    matchingIntercept: number,
    resolutionWeights: number[],
    resolutionIntercept: number
  ): void {
    this.matchingPredictor.loadModel(matchingWeights, matchingIntercept);
    this.resolutionPredictor.loadModel(resolutionWeights, resolutionIntercept);
    this.isInitialized = true;
  }

  /**
   * Get combined prediction for a market pair
   */
  predict(
    kalshiMarket: Market,
    polyMarket: Market,
    baselineMatchScore: number,
    baselineAlignment: number
  ): EnhancedPrediction {
    if (!this.isInitialized) {
      this.initialize();
    }

    const matching = this.matchingPredictor.predict(
      kalshiMarket,
      polyMarket,
      baselineMatchScore
    );

    const resolution = this.resolutionPredictor.predict(
      kalshiMarket,
      polyMarket,
      baselineAlignment
    );

    return this.combineResults(matching, resolution);
  }

  /**
   * Predict from market pair object
   */
  predictFromPair(
    pair: MarketPair,
    baselineMatchScore: number,
    baselineAlignment: number
  ): EnhancedPrediction {
    return this.predict(
      pair.kalshiMarket,
      pair.polymarketMarket,
      baselineMatchScore,
      baselineAlignment
    );
  }

  /**
   * Combine matching and resolution predictions
   */
  private combineResults(
    matching: MatchingPrediction,
    resolution: ResolutionPrediction
  ): EnhancedPrediction {
    const combinedScore = (matching.finalScore + resolution.finalAlignment) / 2;
    const tradeable = matching.willMatch && resolution.tradeable;
    const reasons: string[] = [];

    let recommendation: 'strong_buy' | 'buy' | 'caution' | 'avoid';

    if (matching.finalScore >= 80 && resolution.finalAlignment >= 85) {
      recommendation = 'strong_buy';
      reasons.push('High matching confidence');
      reasons.push('Low resolution risk');
    } else if (matching.finalScore >= 60 && resolution.finalAlignment >= 70) {
      recommendation = 'buy';
      reasons.push('Moderate matching confidence');
      if (resolution.riskScore > 20) {
        reasons.push('Some resolution risk - verify manually');
      }
    } else if (matching.finalScore >= 50 || resolution.finalAlignment >= 60) {
      recommendation = 'caution';
      reasons.push('Lower confidence - manual review recommended');
      reasons.push(...this.resolutionPredictor.getRiskFactors(resolution));
    } else {
      recommendation = 'avoid';
      reasons.push('Insufficient confidence for trading');
      reasons.push(...this.resolutionPredictor.getRiskFactors(resolution));
    }

    return {
      matching,
      resolution,
      combinedScore,
      tradeable,
      recommendation,
      reasons
    };
  }

  /**
   * Extract features for training
   */
  extractTrainingFeatures(
    kalshiMarket: Market,
    polyMarket: Market,
    label: number
  ): TrainingExample {
    const features = this.featureExtractor.extractFeatures(kalshiMarket, polyMarket);
    return {
      features,
      label,
      marketPair: {
        kalshiId: kalshiMarket.id,
        polymarketId: polyMarket.id,
        actualResolution: label === 1
      }
    };
  }

  /**
   * Evaluate predictions against ground truth
   */
  evaluate(predictions: Array<{ prediction: EnhancedPrediction; actual: boolean }>): ModelMetrics {
    let tp = 0, tn = 0, fp = 0, fn = 0;

    for (const { prediction, actual } of predictions) {
      const predicted = prediction.matching.willMatch;

      if (predicted && actual) tp++;
      else if (!predicted && !actual) tn++;
      else if (predicted && !actual) fp++;
      else fn++;
    }

    const total = tp + tn + fp + fn;
    const accuracy = total > 0 ? ((tp + tn) / total) * 100 : 0;
    const precision = (tp + fp) > 0 ? (tp / (tp + fp)) * 100 : 0;
    const recall = (tp + fn) > 0 ? (tp / (tp + fn)) * 100 : 0;
    const f1Score = (precision + recall) > 0
      ? (2 * precision * recall) / (precision + recall)
      : 0;

    return {
      accuracy,
      precision,
      recall,
      f1Score,
      truePositives: tp,
      trueNegatives: tn,
      falsePositives: fp,
      falseNegatives: fn
    };
  }

  /**
   * Get feature importance from both models
   */
  getFeatureImportance(): {
    matching: Record<string, number>;
    resolution: Record<string, number>;
  } {
    return {
      matching: this.matchingPredictor.getFeatureImportance(),
      resolution: {} // Resolution doesn't expose weights directly
    };
  }

  /**
   * Check if service is ready
   */
  isReady(): boolean {
    return this.isInitialized;
  }
}
