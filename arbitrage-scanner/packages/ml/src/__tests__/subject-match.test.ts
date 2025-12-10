/**
 * Test subject matching logic to prevent false positives
 */
import { describe, it, expect } from 'vitest';
import { FeatureExtractor } from '../features';
import { Market } from '@arb/core';

describe('Subject Matching', () => {
  const extractor = new FeatureExtractor();

  // Helper to create test markets
  function createMarket(title: string, description: string = '', rulesPrimary: string = ''): Market {
    return {
      id: 'test-' + Math.random().toString(36).substr(2, 9),
      exchangeId: 'test',
      exchange: 'TEST' as any,
      title,
      description,
      active: true,
      metadata: { rulesPrimary }
    };
  }

  describe('Country mismatch detection', () => {
    it('should reject US President vs Honduras President match', async () => {
      const usMarket = createMarket(
        'Will Zohran Mamdani become President of the United States before 2045?',
        'Before 2045',
        'If Zohran Mamdani becomes President of the United States before Jan 22, 2045, then the market resolves to Yes.'
      );

      const hondurasMarket = createMarket(
        'Next president of Honduras?: Nasralla',
        'Who will be the next president of Honduras?'
      );

      const features = await extractor.extractFeatures(usMarket, hondurasMarket);

      console.log('US vs Honduras features:', {
        categoryMatch: features.categoryMatch,
        titleSimilarity: features.titleSimilarity,
        alignmentScore: features.alignmentScore,
        categoryConfidence: features.featureConfidence.categoryMatch
      });

      // Category match should be 0 (hard fail due to geographic mismatch)
      expect(features.categoryMatch).toBe(0);

      // Title similarity should be heavily penalized
      expect(features.titleSimilarity).toBeLessThan(30);

      // Alignment score should be capped at 40
      expect(features.alignmentScore).toBeLessThanOrEqual(40);
    });

    it('should accept matching US President markets', async () => {
      const kalshiMarket = createMarket(
        'Will Donald Trump win the 2024 presidential election?',
        'Trump 2024',
        'If Donald Trump wins the 2024 presidential election, market resolves Yes.'
      );

      const polymarketMarket = createMarket(
        'Trump to win 2024 US Presidential Election',
        'Will Trump be elected president in 2024?'
      );

      const features = await extractor.extractFeatures(kalshiMarket, polymarketMarket);

      console.log('Same US President features:', {
        categoryMatch: features.categoryMatch,
        titleSimilarity: features.titleSimilarity,
        categoryConfidence: features.featureConfidence.categoryMatch
      });

      // Category match should be 1 (same country context)
      expect(features.categoryMatch).toBe(1);

      // Title similarity should be good
      expect(features.titleSimilarity).toBeGreaterThan(30);
    });

    it('should reject Mexico vs US market match', async () => {
      const usMarket = createMarket(
        'Will there be a US government shutdown in 2025?',
        'US Government Shutdown'
      );

      const mexicoMarket = createMarket(
        'Will Mexico elect a new president in 2025?',
        'Mexican presidential election'
      );

      const features = await extractor.extractFeatures(usMarket, mexicoMarket);

      console.log('US vs Mexico features:', {
        categoryMatch: features.categoryMatch,
        categoryConfidence: features.featureConfidence.categoryMatch
      });

      // Should detect geographic mismatch
      expect(features.categoryMatch).toBe(0);
    });
  });

  describe('Person name mismatch detection', () => {
    it('should reject Trump vs Biden market match', async () => {
      const trumpMarket = createMarket(
        'Will Trump be impeached in 2025?',
        'Trump impeachment'
      );

      const bidenMarket = createMarket(
        'Will Biden pardon himself?',
        'Biden pardon'
      );

      const features = await extractor.extractFeatures(trumpMarket, bidenMarket);

      console.log('Trump vs Biden features:', {
        categoryMatch: features.categoryMatch,
        categoryConfidence: features.featureConfidence.categoryMatch
      });

      // Different people - should have low match score
      expect(features.categoryMatch).toBe(0);
    });

    it('should accept same person with different name formats', async () => {
      const fullNameMarket = createMarket(
        'Will Donald Trump win the 2024 presidential election?',
        'Trump for president'
      );

      const lastNameMarket = createMarket(
        'Trump to win 2024 presidential election',
        'Trump wins president'
      );

      const features = await extractor.extractFeatures(fullNameMarket, lastNameMarket);

      console.log('Same person (Trump) features:', {
        categoryMatch: features.categoryMatch,
        categoryConfidence: features.featureConfidence.categoryMatch
      });

      // Same person + same category (politics) - should match
      expect(features.categoryMatch).toBe(1);
    });
  });
});
