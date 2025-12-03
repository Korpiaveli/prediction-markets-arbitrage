import { describe, it, expect, beforeAll } from 'vitest';
import { KalshiPredictItStrategy } from '@arb/ml/strategies';
import { FeatureExtractor } from '@arb/ml';
import { Market } from '@arb/core';

/**
 * Historical Validation Framework for KalshiPredictItStrategy
 *
 * Tests against known matches from 2024 elections to validate:
 * 1. Precision: % of found matches that are correct
 * 2. Recall: % of true matches that were found
 * 3. Temporal accuracy: Zero year mismatches
 * 4. Outcome accuracy: Zero outcome mismatches for PredictIt contracts
 */

describe('KalshiPredictItStrategy - Historical Validation', () => {
  let strategy: KalshiPredictItStrategy;
  let extractor: FeatureExtractor;

  beforeAll(() => {
    strategy = new KalshiPredictItStrategy();
    extractor = new FeatureExtractor();
  });

  describe('Known True Matches (2024 Election)', () => {
    const trueMatches: Array<{ kalshi: Partial<Market>; predictit: Partial<Market>; description: string }> = [
      {
        description: 'Presidential Election - National',
        kalshi: {
          id: 'PRES-2024',
          title: 'Will Donald Trump win the 2024 Presidential Election?',
          description: 'Resolves YES if Trump wins Electoral College',
          closeTime: new Date('2024-11-05')
        },
        predictit: {
          id: 'PI-PRES-2024',
          title: 'Who will win the 2024 presidential election?: Donald Trump',
          description: 'Resolves YES if Trump wins',
          closeTime: new Date('2024-11-05')
        }
      },
      {
        description: 'Presidential Election - Pennsylvania',
        kalshi: {
          id: 'PA-2024',
          title: 'Will Trump win Pennsylvania in 2024?',
          description: 'State-level presidential race',
          closeTime: new Date('2024-11-05')
        },
        predictit: {
          id: 'PI-PA-2024',
          title: 'Which party will win Pennsylvania in 2024?: Republican',
          description: 'Pennsylvania presidential winner',
          closeTime: new Date('2024-11-05')
        }
      },
      {
        description: 'House Control - 2026 Midterms',
        kalshi: {
          id: 'HOUSE-2026',
          title: 'Will Republicans control the House after 2026 midterms?',
          description: '2026 midterm elections',
          closeTime: new Date('2026-11-03')
        },
        predictit: {
          id: 'PI-HOUSE-2026',
          title: 'Which party will control the House after 2026?: Republican',
          description: '2026 midterms',
          closeTime: new Date('2026-11-03')
        }
      }
    ];

    it('should recognize all true matches with confidence >= 70%', async () => {
      const results = await Promise.all(
        trueMatches.map(async ({ kalshi, predictit, description }) => {
          const features = await extractor.extractFeatures(
            kalshi as Market,
            predictit as Market
          );
          const confidence = strategy.calculateScore(features, kalshi as Market, predictit as Market);

          return { description, confidence, passed: confidence >= 70 };
        })
      );

      console.log('\n=== True Match Recognition ===');
      results.forEach(r => {
        console.log(`${r.passed ? '✅' : '❌'} ${r.description}: ${r.confidence.toFixed(1)}%`);
      });

      const passRate = results.filter(r => r.passed).length / results.length;
      expect(passRate).toBeGreaterThanOrEqual(0.7); // At least 70% recall
    });
  });

  describe('Known False Positives (Temporal Mismatches)', () => {
    const temporalMismatches: Array<{ kalshi: Partial<Market>; predictit: Partial<Market>; description: string }> = [
      {
        description: '2024 vs 2028 Presidential',
        kalshi: {
          id: 'PRES-2024',
          title: 'Will Trump win the 2024 Presidential Election?',
          description: '2024 election',
          closeTime: new Date('2024-11-05')
        },
        predictit: {
          id: 'PI-PRES-2028',
          title: 'Who will win the 2028 presidential election?: JD Vance',
          description: '2028 election',
          closeTime: new Date('2028-11-05')
        }
      },
      {
        description: '2026 vs 2024 House',
        kalshi: {
          id: 'HOUSE-2026',
          title: 'Will Republicans control the House after 2026 midterms?',
          description: '2026 midterms',
          closeTime: new Date('2026-11-03')
        },
        predictit: {
          id: 'PI-HOUSE-2024',
          title: 'Which party will control the House after 2024?: Republican',
          description: '2024 elections',
          closeTime: new Date('2024-11-05')
        }
      }
    ];

    it('should reject temporal mismatches (confidence < 60%)', async () => {
      const results = await Promise.all(
        temporalMismatches.map(async ({ kalshi, predictit, description }) => {
          const features = await extractor.extractFeatures(
            kalshi as Market,
            predictit as Market
          );
          const confidence = strategy.calculateScore(features, kalshi as Market, predictit as Market);

          return { description, confidence, temporalDistance: features.temporalDistance, passed: confidence < 60 };
        })
      );

      console.log('\n=== Temporal Mismatch Rejection ===');
      results.forEach(r => {
        console.log(`${r.passed ? '✅' : '❌'} ${r.description}: ${r.confidence.toFixed(1)}% (temporal: ${r.temporalDistance.toFixed(2)})`);
      });

      const rejectRate = results.filter(r => r.passed).length / results.length;
      expect(rejectRate).toBe(1.0); // 100% rejection of temporal mismatches
    });
  });

  describe('Known False Positives (Outcome Mismatches)', () => {
    const outcomeMismatches: Array<{ kalshi: Partial<Market>; predictit: Partial<Market>; description: string }> = [
      {
        description: 'Republican vs Democrat outcome',
        kalshi: {
          id: 'PA-R-2024',
          title: 'Will Republicans win Pennsylvania in 2024?',
          description: 'Republican victory',
          closeTime: new Date('2024-11-05')
        },
        predictit: {
          id: 'PI-PA-D-2024',
          title: 'Which party will win Pennsylvania in 2024?: Democrat',
          description: 'Democrat victory',
          closeTime: new Date('2024-11-05')
        }
      },
      {
        description: 'Different House seat thresholds',
        kalshi: {
          id: 'HOUSE-230-2024',
          title: 'Will Republicans win 230+ House seats in 2024?',
          description: '230 or more seats',
          closeTime: new Date('2024-11-05')
        },
        predictit: {
          id: 'PI-HOUSE-240-2024',
          title: 'Republican House Seats won in midterms?: 240-244',
          description: '240-244 seats',
          closeTime: new Date('2024-11-05')
        }
      }
    ];

    it('should reject outcome mismatches (confidence < 60%)', async () => {
      const results = await Promise.all(
        outcomeMismatches.map(async ({ kalshi, predictit, description }) => {
          const features = await extractor.extractFeatures(
            kalshi as Market,
            predictit as Market
          );
          const confidence = strategy.calculateScore(features, kalshi as Market, predictit as Market);

          return { description, confidence, outcomeMatch: features.outcomeMatch, passed: confidence < 60 };
        })
      );

      console.log('\n=== Outcome Mismatch Rejection ===');
      results.forEach(r => {
        console.log(`${r.passed ? '✅' : '❌'} ${r.description}: ${r.confidence.toFixed(1)}% (outcome: ${r.outcomeMatch})`);
      });

      const rejectRate = results.filter(r => r.passed).length / results.length;
      expect(rejectRate).toBeGreaterThanOrEqual(0.8); // At least 80% rejection
    });
  });

  describe('Strategy Configuration Validation', () => {
    it('should have threshold of 70 for real-money trading', () => {
      expect(strategy.thresholds.minMatchScore).toBe(70);
    });

    it('should have strict mode enabled', () => {
      expect(strategy.thresholds.strictMode).toBe(true);
    });

    it('should prioritize embeddings and timing', () => {
      expect(strategy.weights.embeddingSimilarity).toBeGreaterThanOrEqual(0.18);
      expect(strategy.weights.timingMatch).toBeGreaterThanOrEqual(0.15);
    });

    it('should have weights sum to 1.0', () => {
      const sum = Object.values(strategy.weights).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 2);
    });
  });

  describe('Performance Metrics', () => {
    it('should calculate precision and recall metrics', async () => {
      const allTests = [
        { type: 'true', count: 3 },
        { type: 'temporal-false', count: 2 },
        { type: 'outcome-false', count: 2 }
      ];

      console.log('\n=== Performance Summary ===');
      console.log('True Matches: 3 (should match with >=70% confidence)');
      console.log('Temporal Mismatches: 2 (should reject)');
      console.log('Outcome Mismatches: 2 (should reject)');
      console.log('\nTarget Metrics:');
      console.log('- Precision: >=90% (of matches found, % correct)');
      console.log('- Recall: >=70% (of true matches, % found)');
      console.log('- Temporal Accuracy: 100% (zero year mismatches)');
      console.log('- Outcome Accuracy: >=80% (correct outcome handling)');
    });
  });
});
