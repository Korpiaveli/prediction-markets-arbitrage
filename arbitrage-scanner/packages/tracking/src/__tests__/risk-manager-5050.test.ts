import { RiskManager } from '../RiskManager';
import { PositionTracker } from '../PositionTracker';
import { CrossExchangeArbitrageOpportunity, CrossExchangePair } from '@arb/core';

describe('RiskManager - Polymarket 50-50 Detection', () => {
  let riskManager: RiskManager;
  let tracker: PositionTracker;

  beforeEach(() => {
    // Create mock tracker with high capital for testing
    tracker = {
      getCapitalStatus: jest.fn().mockResolvedValue({
        totalCapital: 50000,
        availableCapital: 50000,
        allocatedCapital: 0,
        reservedCapital: 0,
        totalPositions: 0,
        totalProfit: 0,
        totalTrades: 0
      }),
      getOpenPositions: jest.fn().mockResolvedValue([])
    } as any;

    riskManager = new RiskManager(tracker, {
      maxPositionSize: 2000,
      minPositionSize: 200,
      maxDailyDeployment: 10000,
      maxOpenPositions: 50,
      maxSameMarketPositions: 5,
      minProfitPercent: 1.5,
      maxSlippageTolerance: 5.0
    });
  });

  describe('Basic Validation', () => {
    test('should approve valid trade', async () => {
      const opportunity = createMockOpportunity({
        profitPercent: 3.5,
        tradeable: true
      });

      const result = await riskManager.validateTrade(opportunity, 1000);

      expect(result.approved).toBe(true);
      expect(result.blockers.length).toBe(0);
    });

    test('should block trade below profit threshold', async () => {
      const opportunity = createMockOpportunity({
        profitPercent: 1.0  // Below 1.5% minimum
      });

      const result = await riskManager.validateTrade(opportunity, 1000);

      expect(result.approved).toBe(false);
      expect(result.blockers.some(b => b.includes('Profit'))).toBe(true);
    });

    test('should reduce size when exceeding max position limit', async () => {
      const opportunity = createMockOpportunity({
        profitPercent: 3.0
      });

      const result = await riskManager.validateTrade(opportunity, 3000);

      expect(result.approved).toBe(true);
      expect(result.adjustedSize).toBe(2000);
      expect(result.warnings.some(w => w.includes('max limit'))).toBe(true);
    });

    test('should block trade below minimum size', async () => {
      const opportunity = createMockOpportunity({
        profitPercent: 3.0
      });

      const result = await riskManager.validateTrade(opportunity, 100);

      expect(result.approved).toBe(false);
      expect(result.blockers.some(b => b.includes('below minimum'))).toBe(true);
    });
  });

  describe('Resolution Alignment Validation', () => {
    test('should block trade with untradeable resolution alignment', async () => {
      const opportunity = createMockOpportunity({
        profitPercent: 3.0,
        tradeable: false,
        resolutionRisks: ['Different resolution sources']
      });

      const result = await riskManager.validateTrade(opportunity, 1000);

      expect(result.approved).toBe(false);
      expect(result.blockers.some(b => b.includes('Resolution risk'))).toBe(true);
    });

    test('should warn on resolution warnings but allow trade', async () => {
      const opportunity = createMockOpportunity({
        profitPercent: 3.0,
        tradeable: true,
        resolutionWarnings: ['Different timing requirements']
      });

      const result = await riskManager.validateTrade(opportunity, 1000);

      expect(result.approved).toBe(true);
      expect(result.warnings.some(w => w.includes('timing'))).toBe(true);
    });
  });

  describe('Polymarket 50-50 Detection and Position Sizing', () => {
    test('should reduce position size 50% when Polymarket 50-50 detected', async () => {
      const opportunity = createMockOpportunity({
        profitPercent: 3.0,
        tradeable: true,
        polymarket5050Risk: true
      });

      const result = await riskManager.validateTrade(opportunity, 1000);

      expect(result.approved).toBe(true);
      expect(result.adjustedSize).toBe(500);
      expect(result.warnings.some(w => w.includes('50-50'))).toBe(true);
    });

    test('should apply 50-50 reduction AFTER capital limits', async () => {
      // Set low available capital
      (tracker.getCapitalStatus as jest.Mock).mockResolvedValue({
        totalCapital: 50000,
        availableCapital: 800,
        allocatedCapital: 49200,
        reservedCapital: 0,
        totalPositions: 10,
        totalProfit: 0,
        totalTrades: 0
      });

      const opportunity = createMockOpportunity({
        profitPercent: 3.0,
        tradeable: true,
        polymarket5050Risk: true
      });

      const result = await riskManager.validateTrade(opportunity, 1000);

      // Should reduce to 800 (capital), then reduce by 50% = 400
      expect(result.approved).toBe(true);
      expect(result.adjustedSize).toBe(400);
      expect(result.warnings.some(w => w.includes('capital'))).toBe(true);
      expect(result.warnings.some(w => w.includes('50-50'))).toBe(true);
    });

    test('should block if reduced 50-50 size falls below minimum', async () => {
      const opportunity = createMockOpportunity({
        profitPercent: 3.0,
        tradeable: true,
        polymarket5050Risk: true
      });

      const result = await riskManager.validateTrade(opportunity, 300);

      // 300 * 0.5 = 150, which is below 200 minimum
      expect(result.approved).toBe(false);
      expect(result.blockers.some(b => b.includes('below minimum'))).toBe(true);
    });

    test('should NOT reduce size when 50-50 risk is false', async () => {
      const opportunity = createMockOpportunity({
        profitPercent: 3.0,
        tradeable: true,
        polymarket5050Risk: false
      });

      const result = await riskManager.validateTrade(opportunity, 1000);

      expect(result.approved).toBe(true);
      expect(result.adjustedSize).toBeUndefined();
      expect(result.warnings.some(w => w.includes('50-50'))).toBe(false);
    });

    test('should handle missing polymarket5050Risk field', async () => {
      const opportunity = createMockOpportunity({
        profitPercent: 3.0,
        tradeable: true
        // polymarket5050Risk not provided
      });

      const result = await riskManager.validateTrade(opportunity, 1000);

      // Should default to false (no reduction)
      expect(result.approved).toBe(true);
      expect(result.adjustedSize).toBeUndefined();
    });

    test('should apply 50-50 reduction on both exchanges if both are Polymarket', async () => {
      const opportunity = createMockOpportunity({
        profitPercent: 3.0,
        tradeable: true,
        polymarket5050Risk: true,
        exchange1: 'POLYMARKET',
        exchange2: 'POLYMARKET'
      });

      const result = await riskManager.validateTrade(opportunity, 1000);

      expect(result.approved).toBe(true);
      expect(result.adjustedSize).toBe(500);
    });
  });

  describe('Capital Availability', () => {
    test('should reduce size to available capital', async () => {
      (tracker.getCapitalStatus as jest.Mock).mockResolvedValue({
        totalCapital: 50000,
        availableCapital: 600,
        allocatedCapital: 49400,
        reservedCapital: 0,
        totalPositions: 10,
        totalProfit: 0,
        totalTrades: 0
      });

      const opportunity = createMockOpportunity({
        profitPercent: 3.0
      });

      const result = await riskManager.validateTrade(opportunity, 1000);

      expect(result.approved).toBe(true);
      expect(result.adjustedSize).toBe(600);
      expect(result.warnings.some(w => w.includes('capital'))).toBe(true);
    });

    test('should block if available capital below minimum', async () => {
      (tracker.getCapitalStatus as jest.Mock).mockResolvedValue({
        totalCapital: 50000,
        availableCapital: 100,
        allocatedCapital: 49900,
        reservedCapital: 0,
        totalPositions: 10,
        totalProfit: 0,
        totalTrades: 0
      });

      const opportunity = createMockOpportunity({
        profitPercent: 3.0
      });

      const result = await riskManager.validateTrade(opportunity, 1000);

      expect(result.approved).toBe(false);
      expect(result.blockers.some(b => b.includes('Insufficient capital'))).toBe(true);
    });
  });

  describe('Liquidity and Slippage', () => {
    test('should warn on high liquidity usage', async () => {
      const opportunity = createMockOpportunity({
        profitPercent: 3.0,
        exchange1Liquidity: 2000,
        exchange2Liquidity: 2000
      });

      const result = await riskManager.validateTrade(opportunity, 800);

      // 800 / 2000 = 40% > 30% threshold
      expect(result.approved).toBe(true);
      expect(result.warnings.some(w => w.includes('liquidity'))).toBe(true);
    });

    test('should block on excessive slippage', async () => {
      const opportunity = createMockOpportunity({
        profitPercent: 3.0,
        exchange1Liquidity: 500,
        exchange2Liquidity: 500
      });

      const result = await riskManager.validateTrade(opportunity, 400);

      // 400 / 500 = 80% of liquidity -> high slippage
      expect(result.approved).toBe(false);
      expect(result.blockers.some(b => b.includes('slippage'))).toBe(true);
    });
  });

  describe('Exchange Blocking', () => {
    test('should block trades on blocked exchange', async () => {
      riskManager.blockExchange('KALSHI', 'API outage');

      const opportunity = createMockOpportunity({
        profitPercent: 3.0,
        exchange1: 'KALSHI'
      });

      const result = await riskManager.validateTrade(opportunity, 1000);

      expect(result.approved).toBe(false);
      expect(result.blockers.some(b => b.includes('KALSHI') && b.includes('blocked'))).toBe(true);
    });

    test('should allow trades after unblocking', async () => {
      riskManager.blockExchange('KALSHI', 'Test');
      riskManager.unblockExchange('KALSHI');

      const opportunity = createMockOpportunity({
        profitPercent: 3.0,
        exchange1: 'KALSHI'
      });

      const result = await riskManager.validateTrade(opportunity, 1000);

      expect(result.approved).toBe(true);
    });
  });
});

// Helper function to create mock opportunities
function createMockOpportunity(options: {
  profitPercent: number;
  tradeable?: boolean;
  resolutionRisks?: string[];
  resolutionWarnings?: string[];
  polymarket5050Risk?: boolean;
  exchange1?: string;
  exchange2?: string;
  exchange1Liquidity?: number;
  exchange2Liquidity?: number;
}): CrossExchangeArbitrageOpportunity {
  const exchange1 = options.exchange1 || 'KALSHI';
  const exchange2 = options.exchange2 || 'POLYMARKET';

  const marketPair: CrossExchangePair = {
    id: 'TEST_PAIR',
    exchange1,
    exchange2,
    market1Id: 'MARKET1',
    market2Id: 'MARKET2',
    market1: {
      id: 'MARKET1',
      exchange: exchange1,
      title: 'Test Market 1',
      description: 'Test',
      closeTime: new Date(Date.now() + 86400000),
      volume24h: 10000,
      liquidity: options.exchange1Liquidity || 5000
    },
    market2: {
      id: 'MARKET2',
      exchange: exchange2,
      title: 'Test Market 2',
      description: 'Test',
      closeTime: new Date(Date.now() + 86400000),
      volume24h: 10000,
      liquidity: options.exchange2Liquidity || 5000
    },
    description: 'Test market pair',
    correlationScore: 0.9
  };

  return {
    id: 'OPP_TEST',
    timestamp: new Date(),
    marketPair,
    quotePair: {
      exchange1,
      exchange2,
      quote1: {
        yes: { bid: 0.45, ask: 0.47, liquidity: options.exchange1Liquidity || 5000 },
        no: { bid: 0.53, ask: 0.55, liquidity: options.exchange1Liquidity || 5000 },
        timestamp: new Date()
      },
      quote2: {
        yes: { bid: 0.55, ask: 0.57, liquidity: options.exchange2Liquidity || 5000 },
        no: { bid: 0.43, ask: 0.45, liquidity: options.exchange2Liquidity || 5000 },
        timestamp: new Date()
      },
      timestamp: new Date()
    },
    direction: 'BUY_EXCHANGE1_YES_EXCHANGE2_NO' as any,
    profitPercent: options.profitPercent,
    profitDollars: options.profitPercent * 10,
    totalCost: 0.92,
    maxSize: 10000,
    confidence: 85,
    ttl: 30,
    fees: {
      exchange1Name: exchange1,
      exchange2Name: exchange2,
      exchange1Fee: 0.01,
      exchange2Fee: 0.01,
      totalFees: 0.02,
      feePercent: 2.0
    },
    liquidity: {
      exchange1Name: exchange1,
      exchange2Name: exchange2,
      exchange1Available: options.exchange1Liquidity || 5000,
      exchange2Available: options.exchange2Liquidity || 5000,
      maxExecutable: Math.min(options.exchange1Liquidity || 5000, options.exchange2Liquidity || 5000),
      depthQuality: 'MEDIUM' as any
    },
    resolutionAlignment: {
      score: options.tradeable !== false ? 75 : 45,
      level: options.tradeable !== false ? 'medium' : 'low',
      sourcesMatch: true,
      timingMatch: true,
      conditionsMatch: true,
      risks: options.resolutionRisks || [],
      warnings: options.resolutionWarnings || [],
      tradeable: options.tradeable !== false,
      requiresReview: true,
      polymarket5050Risk: options.polymarket5050Risk
    },
    valid: true
  };
}
