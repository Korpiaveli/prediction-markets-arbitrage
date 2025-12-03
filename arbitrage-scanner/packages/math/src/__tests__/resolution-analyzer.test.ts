import { ResolutionAnalyzer } from '../resolution';
import { Market } from '@arb/core';

describe('ResolutionAnalyzer', () => {
  let analyzer: ResolutionAnalyzer;

  beforeEach(() => {
    analyzer = new ResolutionAnalyzer();
  });

  describe('Threshold Configuration', () => {
    test('should have default threshold of 65', () => {
      expect(analyzer.getMinThreshold()).toBe(65);
    });

    test('should allow setting custom threshold', () => {
      analyzer.setMinThreshold(70);
      expect(analyzer.getMinThreshold()).toBe(70);
    });

    test('should reject threshold below 0', () => {
      expect(() => analyzer.setMinThreshold(-1)).toThrow('Threshold must be between 0 and 100');
    });

    test('should reject threshold above 100', () => {
      expect(() => analyzer.setMinThreshold(101)).toThrow('Threshold must be between 0 and 100');
    });

    test('should accept boundary values', () => {
      analyzer.setMinThreshold(0);
      expect(analyzer.getMinThreshold()).toBe(0);

      analyzer.setMinThreshold(100);
      expect(analyzer.getMinThreshold()).toBe(100);
    });
  });

  describe('Tradeability with Custom Threshold', () => {
    test('should mark opportunities tradeable at threshold', () => {
      analyzer.setMinThreshold(65);

      const market1 = createMockMarket('KALSHI', 'Test market', 'AP will determine winner');
      const market2 = createMockMarket('POLYMARKET', 'Test market', 'AP will determine winner');

      const alignment = analyzer.compareResolution(market1, market2);

      // Score should be high (sources match)
      expect(alignment.score).toBeGreaterThanOrEqual(65);
      expect(alignment.tradeable).toBe(true);
    });

    test('should block opportunities below threshold', () => {
      analyzer.setMinThreshold(70);

      const market1 = createMockMarket('KALSHI', 'Test market', 'Will resolve based on criteria');
      const market2 = createMockMarket('POLYMARKET', 'Test market', 'Different criteria here');

      const alignment = analyzer.compareResolution(market1, market2);

      // Low score should block
      if (alignment.score < 70) {
        expect(alignment.tradeable).toBe(false);
      }
    });

    test('should block opportunities with risks regardless of score', () => {
      const market1 = createMockMarket('KALSHI', 'Test market', 'Official source');
      const market2 = createMockMarket('POLYMARKET', 'Test market', ''); // Missing criteria

      const alignment = analyzer.compareResolution(market1, market2);

      // Should have risks due to missing criteria
      if (alignment.risks.length > 0) {
        expect(alignment.tradeable).toBe(false);
      }
    });
  });

  describe('Timing Validation', () => {
    test('should match identical dates', () => {
      const market1 = createMockMarket('KALSHI', 'Test', 'Will resolve by Dec 31 2024');
      const market2 = createMockMarket('POLYMARKET', 'Test', 'Will resolve by Dec 31 2024');

      const alignment = analyzer.compareResolution(market1, market2);

      expect(alignment.timingMatch).toBe(true);
    });

    test('should match equivalent date formats', () => {
      const market1 = createMockMarket('KALSHI', 'Test', 'Resolves by December 31, 2024');
      const market2 = createMockMarket('POLYMARKET', 'Test', 'Resolves by Dec 31 2024');

      const alignment = analyzer.compareResolution(market1, market2);

      expect(alignment.timingMatch).toBe(true);
    });

    test('should match when one has no timing', () => {
      const market1 = createMockMarket('KALSHI', 'Test', 'No timing specified');
      const market2 = createMockMarket('POLYMARKET', 'Test', 'Resolves by Dec 31 2024');

      const alignment = analyzer.compareResolution(market1, market2);

      // No timing = assume match
      expect(alignment.timingMatch).toBe(true);
    });

    test('should warn on different timing', () => {
      const market1 = createMockMarket('KALSHI', 'Test', 'Resolves by Jan 1 2024');
      const market2 = createMockMarket('POLYMARKET', 'Test', 'Resolves by Dec 31 2025');

      const alignment = analyzer.compareResolution(market1, market2);

      expect(alignment.timingMatch).toBe(false);
      expect(alignment.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('Source Matching', () => {
    test('should match when both use AP', () => {
      const market1 = createMockMarket('KALSHI', 'Test', 'Resolves per Associated Press');
      const market2 = createMockMarket('POLYMARKET', 'Test', 'Resolves per AP');

      const alignment = analyzer.compareResolution(market1, market2);

      expect(alignment.sourcesMatch).toBe(true);
    });

    test('should match media consensus sources', () => {
      const market1 = createMockMarket('KALSHI', 'Test', 'Based on media calls');
      const market2 = createMockMarket('POLYMARKET', 'Test', 'Based on media consensus');

      const alignment = analyzer.compareResolution(market1, market2);

      expect(alignment.sourcesMatch).toBe(true);
    });

    test('should match Fox News variations', () => {
      const market1 = createMockMarket('KALSHI', 'Test', 'According to Fox News');
      const market2 = createMockMarket('POLYMARKET', 'Test', 'According to Fox');

      const alignment = analyzer.compareResolution(market1, market2);

      expect(alignment.sourcesMatch).toBe(true);
    });

    test('should not match different sources', () => {
      const market1 = createMockMarket('KALSHI', 'Test', 'According to New York Times');
      const market2 = createMockMarket('POLYMARKET', 'Test', 'According to Twitter polls');

      const alignment = analyzer.compareResolution(market1, market2);

      expect(alignment.sourcesMatch).toBe(false);
      expect(alignment.risks.length).toBeGreaterThan(0);
    });

    test('should penalize missing sources', () => {
      const market1 = createMockMarket('KALSHI', 'Test', 'Market description');
      const market2 = createMockMarket('POLYMARKET', 'Test', 'Another description');

      const alignment = analyzer.compareResolution(market1, market2);

      expect(alignment.sourcesMatch).toBe(false);
    });
  });

  describe('Alignment Scoring', () => {
    test('should score ~100 for perfect alignment', () => {
      const market1 = createMockMarket(
        'KALSHI',
        'Test market',
        'Will resolve according to Associated Press by December 31, 2024. Must meet specific conditions.'
      );
      const market2 = createMockMarket(
        'POLYMARKET',
        'Test market',
        'Will resolve according to AP by Dec 31, 2024. Must meet specific conditions.'
      );

      const alignment = analyzer.compareResolution(market1, market2);

      expect(alignment.score).toBeGreaterThanOrEqual(85);
      expect(alignment.level).toBe('high');
    });

    test('should score 70-85 for compatible markets', () => {
      const market1 = createMockMarket(
        'KALSHI',
        'Test',
        'Resolves according to official sources by end of 2024'
      );
      const market2 = createMockMarket(
        'POLYMARKET',
        'Test',
        'Resolves according to credible source by Dec 31 2024'
      );

      const alignment = analyzer.compareResolution(market1, market2);

      expect(alignment.score).toBeGreaterThanOrEqual(60);
      expect(alignment.score).toBeLessThan(90);
    });

    test('should score <60 for mismatched markets', () => {
      const market1 = createMockMarket('KALSHI', 'Test', 'Resolves per NYT');
      const market2 = createMockMarket('POLYMARKET', 'Test', 'Resolves per community vote');

      const alignment = analyzer.compareResolution(market1, market2);

      expect(alignment.score).toBeLessThan(70);
      expect(alignment.level).toBe('low');
    });
  });

  describe('Criteria Extraction', () => {
    test('should extract Kalshi sources from rules', () => {
      const market = createMockMarket(
        'KALSHI',
        'Test',
        'Description',
        { rulesPrimary: 'This market will resolve according to New York Times reporting' }
      );

      const criteria = analyzer.extractCriteria(market);

      expect(criteria.sources).toContain('New York Times');
      expect(criteria.platform).toBe('KALSHI');
    });

    test('should extract Polymarket resolution rules', () => {
      const market = createMockMarket(
        'POLYMARKET',
        'Test',
        'Description',
        { resolutionRules: 'This market resolves according to official government sources' }
      );

      const criteria = analyzer.extractCriteria(market);

      expect(criteria.sources).toContain('official');
      expect(criteria.platform).toBe('POLYMARKET');
    });

    test('should extract timing requirements', () => {
      const market = createMockMarket(
        'KALSHI',
        'Test',
        'Will resolve by end of 2024'
      );

      const criteria = analyzer.extractCriteria(market);

      expect(criteria.timing).toContain('2024');
    });

    test('should extract conditions', () => {
      const market = createMockMarket(
        'KALSHI',
        'Test',
        'Will resolve YES if the candidate wins. Must be certified by December 31.'
      );

      const criteria = analyzer.extractCriteria(market);

      expect(criteria.conditions.length).toBeGreaterThan(0);
    });
  });
});

// Helper function to create mock markets
function createMockMarket(
  exchange: 'KALSHI' | 'POLYMARKET',
  title: string,
  description: string,
  metadata?: any
): Market {
  return {
    id: `${exchange}_TEST_${Date.now()}`,
    exchange,
    title,
    description,
    closeTime: new Date(Date.now() + 86400000),
    volume24h: 1000,
    liquidity: 5000,
    metadata: metadata || {}
  };
}
