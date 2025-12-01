/**
 * Integration Tests - Backtest Workflow
 *
 * Tests the complete backtesting workflow:
 * 1. Load historical opportunities
 * 2. Run backtest with various configurations
 * 3. Validate metrics calculation
 * 4. Test parameter optimization
 */

import { describe, it, expect } from 'vitest';
import { BacktestEngine, BacktestConfig } from '@arb/ml';
import { ArbitrageOpportunity } from '@arb/core';

describe('Backtest Integration Tests', () => {
  const backtester = new BacktestEngine();

  // Generate mock historical opportunities
  function generateMockOpportunities(count: number): ArbitrageOpportunity[] {
    const opportunities: ArbitrageOpportunity[] = [];
    const baseDate = new Date('2024-01-01');

    for (let i = 0; i < count; i++) {
      const timestamp = new Date(baseDate.getTime() + i * 86400000); // Daily

      opportunities.push({
        id: `test-opp-${i}`,
        timestamp,
        marketPair: {
          id: `pair-${i}`,
          description: `Test Pair ${i}`,
          kalshiMarket: {
            id: `kalshi-${i}`,
            exchangeId: `kalshi-${i}`,
            exchange: 'KALSHI',
            title: 'Test Market',
            description: 'Test',
            active: true
          },
          polymarketMarket: {
            id: `poly-${i}`,
            exchangeId: `poly-${i}`,
            exchange: 'POLYMARKET',
            title: 'Test Market',
            description: 'Test',
            active: true
          },
          kalshiId: `kalshi-${i}`,
          polymarketId: `poly-${i}`
        },
        quotePair: {
          kalshi: {
            marketId: `kalshi-${i}`,
            exchange: 'KALSHI',
            timestamp,
            lastUpdate: timestamp,
            yes: { bid: 0.45, ask: 0.48, mid: 0.465 },
            no: { bid: 0.52, ask: 0.55, mid: 0.535 }
          },
          polymarket: {
            marketId: `poly-${i}`,
            exchange: 'POLYMARKET',
            timestamp,
            lastUpdate: timestamp,
            yes: { bid: 0.50, ask: 0.53, mid: 0.515 },
            no: { bid: 0.47, ask: 0.50, mid: 0.485 }
          },
          timestamp
        },
        direction: 'KALSHI_YES_POLY_NO',
        profitPercent: 2 + Math.random() * 5,
        profitDollars: 50 + Math.random() * 150,
        totalCost: 1000,
        maxSize: 2000,
        confidence: 75,
        ttl: 300,
        fees: {
          kalshiFee: 5,
          polymarketFee: 3,
          totalFees: 8,
          feePercent: 0.8
        },
        liquidity: {
          kalshiAvailable: 5000,
          polymarketAvailable: 5000,
          maxExecutable: 5000,
          depthQuality: 'DEEP'
        },
        valid: true
      });
    }

    return opportunities;
  }

  describe('Basic Backtest Execution', () => {
    it('should run a complete backtest', () => {
      const opportunities = generateMockOpportunities(30);
      const config: BacktestConfig = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        initialCapital: 10000,
        maxPositionSize: 2000,
        minProfitPercent: 2,
        slippageModel: 'realistic',
        executionDelay: 5
      };

      const result = backtester.run(opportunities, config);

      expect(result).toBeDefined();
      expect(result.totalTrades).toBe(30);
      expect(result.executedTrades).toBeGreaterThan(0);
      expect(result.finalCapital).toBeGreaterThan(0);
    });

    it('should calculate financial metrics correctly', () => {
      const opportunities = generateMockOpportunities(50);
      const config: BacktestConfig = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-02-29'),
        initialCapital: 10000,
        maxPositionSize: 1000,
        minProfitPercent: 1,
        slippageModel: 'realistic',
        executionDelay: 5
      };

      const result = backtester.run(opportunities, config);

      // Validate metrics
      expect(result.returnPercent).toBeDefined();
      expect(result.sharpeRatio).toBeDefined();
      expect(result.maxDrawdown).toBeDefined();
      expect(result.winRate).toBeGreaterThanOrEqual(0);
      expect(result.winRate).toBeLessThanOrEqual(1);

      // Total profit should equal final - initial capital
      const expectedProfit = result.finalCapital - config.initialCapital;
      expect(result.totalProfit).toBeCloseTo(expectedProfit, 2);
    });

    it('should generate insights based on results', () => {
      const opportunities = generateMockOpportunities(20);
      const config: BacktestConfig = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-20'),
        initialCapital: 5000,
        maxPositionSize: 1000,
        minProfitPercent: 3,
        slippageModel: 'conservative',
        executionDelay: 10
      };

      const result = backtester.run(opportunities, config);

      expect(result.insights).toBeDefined();
      expect(Array.isArray(result.insights)).toBe(true);
      expect(result.insights.length).toBeGreaterThan(0);
    });
  });

  describe('Slippage Models', () => {
    it('should produce different results for different slippage models', () => {
      const opportunities = generateMockOpportunities(20);
      const baseConfig: Omit<BacktestConfig, 'slippageModel'> = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-20'),
        initialCapital: 10000,
        maxPositionSize: 2000,
        minProfitPercent: 2,
        executionDelay: 5
      };

      const conservative = backtester.run(opportunities, {
        ...baseConfig,
        slippageModel: 'conservative'
      });

      const realistic = backtester.run(opportunities, {
        ...baseConfig,
        slippageModel: 'realistic'
      });

      const optimistic = backtester.run(opportunities, {
        ...baseConfig,
        slippageModel: 'optimistic'
      });

      // Conservative should have lowest returns due to higher slippage
      expect(conservative.totalProfit).toBeLessThan(realistic.totalProfit);
      expect(realistic.totalProfit).toBeLessThan(optimistic.totalProfit);

      // Slippage costs should decrease: conservative > realistic > optimistic
      expect(conservative.totalSlippage).toBeGreaterThan(realistic.totalSlippage);
      expect(realistic.totalSlippage).toBeGreaterThan(optimistic.totalSlippage);
    });
  });

  describe('Position Sizing', () => {
    it('should respect max position size limits', () => {
      const opportunities = generateMockOpportunities(10);
      const config: BacktestConfig = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-10'),
        initialCapital: 10000,
        maxPositionSize: 500,
        minProfitPercent: 1,
        slippageModel: 'realistic',
        executionDelay: 5
      };

      const result = backtester.run(opportunities, config);

      result.trades.filter(t => t.executed).forEach(trade => {
        expect(trade.investmentSize).toBeLessThanOrEqual(config.maxPositionSize);
      });
    });

    it('should not exceed available capital', () => {
      const opportunities = generateMockOpportunities(100);
      const config: BacktestConfig = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-04-10'),
        initialCapital: 5000,
        maxPositionSize: 2000,
        minProfitPercent: 1,
        slippageModel: 'realistic',
        executionDelay: 5
      };

      const result = backtester.run(opportunities, config);

      // Final capital should never be negative (no leverage)
      expect(result.finalCapital).toBeGreaterThan(0);
    });
  });

  describe('Risk Metrics', () => {
    it('should calculate Sharpe ratio', () => {
      const opportunities = generateMockOpportunities(50);
      const config: BacktestConfig = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-02-19'),
        initialCapital: 10000,
        maxPositionSize: 1500,
        minProfitPercent: 2,
        slippageModel: 'realistic',
        executionDelay: 5
      };

      const result = backtester.run(opportunities, config);

      expect(result.sharpeRatio).toBeDefined();
      expect(typeof result.sharpeRatio).toBe('number');
      expect(isNaN(result.sharpeRatio)).toBe(false);
    });

    it('should calculate max drawdown', () => {
      const opportunities = generateMockOpportunities(30);
      const config: BacktestConfig = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-30'),
        initialCapital: 10000,
        maxPositionSize: 2000,
        minProfitPercent: 1,
        slippageModel: 'realistic',
        executionDelay: 5
      };

      const result = backtester.run(opportunities, config);

      expect(result.maxDrawdown).toBeDefined();
      expect(result.maxDrawdown).toBeGreaterThanOrEqual(0);
      expect(result.maxDrawdown).toBeLessThanOrEqual(1); // Max 100%
    });

    it('should calculate profit factor', () => {
      const opportunities = generateMockOpportunities(40);
      const config: BacktestConfig = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-02-09'),
        initialCapital: 10000,
        maxPositionSize: 1000,
        minProfitPercent: 2,
        slippageModel: 'realistic',
        executionDelay: 5
      };

      const result = backtester.run(opportunities, config);

      expect(result.profitFactor).toBeDefined();
      expect(typeof result.profitFactor).toBe('number');
    });
  });

  describe('Parameter Optimization', () => {
    it('should test multiple parameter combinations', () => {
      const opportunities = generateMockOpportunities(30);
      const config: BacktestConfig = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-30'),
        initialCapital: 10000,
        maxPositionSize: 2000,
        minProfitPercent: 1,
        slippageModel: 'realistic',
        executionDelay: 5
      };

      const results = backtester.optimizeParameters(opportunities, config, {
        minProfit: [1, 2, 3],
        maxRisk: [0.1, 0.2],
        minResolutionScore: [70, 80]
      });

      // Should test all combinations: 3 * 2 * 2 = 12
      expect(results.length).toBe(12);

      // Results should be sorted by Sharpe ratio (best first)
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].result.sharpeRatio).toBeGreaterThanOrEqual(
          results[i].result.sharpeRatio
        );
      }
    });

    it('should find optimal parameters', () => {
      const opportunities = generateMockOpportunities(50);
      const config: BacktestConfig = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-02-19'),
        initialCapital: 10000,
        maxPositionSize: 2000,
        minProfitPercent: 1,
        slippageModel: 'realistic',
        executionDelay: 5
      };

      const results = backtester.optimizeParameters(opportunities, config, {
        minProfit: [1, 2, 3, 4],
        maxRisk: [0.1],
        minResolutionScore: [70]
      });

      // Best result should be first
      const best = results[0];
      expect(best).toBeDefined();
      expect(best.params).toBeDefined();
      expect(best.result).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty opportunity list', () => {
      const config: BacktestConfig = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        initialCapital: 10000,
        maxPositionSize: 2000,
        minProfitPercent: 2,
        slippageModel: 'realistic',
        executionDelay: 5
      };

      expect(() => {
        backtester.run([], config);
      }).toThrow();
    });

    it('should handle all opportunities being skipped', () => {
      const opportunities = generateMockOpportunities(10);
      const config: BacktestConfig = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-10'),
        initialCapital: 10000,
        maxPositionSize: 2000,
        minProfitPercent: 50, // Impossible threshold
        slippageModel: 'realistic',
        executionDelay: 5
      };

      const result = backtester.run(opportunities, config);

      expect(result.executedTrades).toBe(0);
      expect(result.skippedTrades).toBe(10);
      expect(result.finalCapital).toBe(config.initialCapital); // No change
    });
  });
});
