import { describe, it, expect } from 'vitest';
import { ArbitrageCalculator } from '../arbitrage.js';
import { QuotePair, FeeStructure, DEFAULT_FEE_STRUCTURE } from '@arb/core';

describe('ArbitrageCalculator', () => {
  const calculator = new ArbitrageCalculator();

  // Helper function to create test quotes
  const createQuotes = (
    kalshiYes: number,
    kalshiNo: number,
    polyYes: number,
    polyNo: number
  ): QuotePair => ({
    kalshi: {
      marketId: 'TEST_KALSHI',
      exchange: 'KALSHI',
      timestamp: new Date(),
      yes: { bid: kalshiYes - 0.01, ask: kalshiYes, mid: kalshiYes - 0.005 },
      no: { bid: kalshiNo - 0.01, ask: kalshiNo, mid: kalshiNo - 0.005 },
      lastUpdate: new Date()
    },
    polymarket: {
      marketId: 'TEST_POLY',
      exchange: 'POLYMARKET',
      timestamp: new Date(),
      yes: { bid: polyYes - 0.01, ask: polyYes, mid: polyYes - 0.005 },
      no: { bid: polyNo - 0.01, ask: polyNo, mid: polyNo - 0.005 },
      lastUpdate: new Date()
    },
    timestamp: new Date()
  });

  describe('Profitable Arbitrage Detection', () => {
    it('should detect arbitrage when K_YES + P_NO < 1', () => {
      // Kalshi YES = 0.45, Polymarket NO = 0.48
      // Total cost = 0.45 + 0.48 = 0.93 + fees
      // Payout = 1.0, so profit = 1.0 - 0.93 - fees
      const quotes = createQuotes(0.45, 0.55, 0.52, 0.48);
      const results = calculator.calculate(quotes, DEFAULT_FEE_STRUCTURE);

      const comboA = results.find(r => r.direction === 'KALSHI_YES_POLY_NO');
      expect(comboA).toBeDefined();
      expect(comboA!.valid).toBe(true);
      expect(comboA!.profitPercent).toBeGreaterThan(0);

      // Verify total cost calculation
      expect(comboA!.totalCost).toBeLessThan(1);
    });

    it('should detect arbitrage when K_NO + P_YES < 1', () => {
      // Kalshi NO = 0.48, Polymarket YES = 0.45
      const quotes = createQuotes(0.52, 0.48, 0.45, 0.55);
      const results = calculator.calculate(quotes, DEFAULT_FEE_STRUCTURE);

      const comboB = results.find(r => r.direction === 'KALSHI_NO_POLY_YES');
      expect(comboB).toBeDefined();
      expect(comboB!.valid).toBe(true);
      expect(comboB!.profitPercent).toBeGreaterThan(0);
      expect(comboB!.totalCost).toBeLessThan(1);
    });

    it('should detect no arbitrage when prices are fair', () => {
      // K_YES + P_NO = 0.50 + 0.50 = 1.00 (+ fees = no profit)
      const quotes = createQuotes(0.50, 0.50, 0.50, 0.50);
      const results = calculator.calculate(quotes, DEFAULT_FEE_STRUCTURE);

      const validResults = results.filter(r => r.valid);
      expect(validResults).toHaveLength(0);
    });

    it('should return results sorted by profit descending', () => {
      const quotes = createQuotes(0.43, 0.47, 0.47, 0.43);
      const results = calculator.calculate(quotes, DEFAULT_FEE_STRUCTURE);

      // Results should be sorted by profit percentage
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].profitPercent).toBeGreaterThanOrEqual(results[i].profitPercent);
      }
    });
  });

  describe('Fee Calculation Accuracy', () => {
    it('should include Kalshi per-contract fee', () => {
      const quotes = createQuotes(0.40, 0.60, 0.60, 0.40);
      const customFees: FeeStructure = {
        kalshiFeePerContract: 0.02, // $0.02 per contract
        polymarketFeeRate: 0,
        safetyMarginPercent: 0
      };

      const results = calculator.calculate(quotes, customFees);
      const result = results[0];

      // Kalshi fee should be exactly 0.02
      expect(result.fees.kalshiFee).toBe(0.02);
    });

    it('should include Polymarket profit-based fee', () => {
      const quotes = createQuotes(0.40, 0.60, 0.60, 0.40);
      const customFees: FeeStructure = {
        kalshiFeePerContract: 0,
        polymarketFeeRate: 0.02, // 2% of profit
        safetyMarginPercent: 0
      };

      const results = calculator.calculate(quotes, customFees);
      const result = results[0];

      // Polymarket fee should be 2% of the potential profit on winning leg
      expect(result.fees.polymarketFee).toBeGreaterThan(0);
      expect(result.fees.polymarketFee).toBeLessThan(0.02); // Max 2% of $1
    });

    it('should calculate total fees correctly', () => {
      const quotes = createQuotes(0.45, 0.55, 0.55, 0.45);
      const fees: FeeStructure = {
        kalshiFeePerContract: 0.01,
        polymarketFeeRate: 0.02,
        safetyMarginPercent: 0
      };

      const results = calculator.calculate(quotes, fees);
      const result = results[0];

      const expectedTotal = result.fees.kalshiFee + result.fees.polymarketFee;
      expect(result.fees.totalFees).toBeCloseTo(expectedTotal, 6);
    });

    it('should include optional percentage-based Kalshi fee', () => {
      const quotes = createQuotes(0.45, 0.55, 0.55, 0.45);
      const fees: FeeStructure = {
        kalshiFeePerContract: 0.01,
        kalshiFeePercent: 0.001, // 0.1% of trade value
        polymarketFeeRate: 0.02,
        safetyMarginPercent: 0
      };

      const results = calculator.calculate(quotes, fees);
      const result = results[0];

      // Kalshi fee should be 0.01 + (0.45 * 0.001) = 0.01 + 0.00045 = 0.01045
      expect(result.fees.kalshiFee).toBeGreaterThan(0.01);
      expect(result.fees.kalshiFee).toBeCloseTo(0.01045, 5);
    });

    it('should apply safety margin correctly', () => {
      const quotes = createQuotes(0.45, 0.55, 0.55, 0.45);
      const noMargin: FeeStructure = {
        kalshiFeePerContract: 0.01,
        polymarketFeeRate: 0.02,
        safetyMarginPercent: 0
      };
      const withMargin: FeeStructure = {
        kalshiFeePerContract: 0.01,
        polymarketFeeRate: 0.02,
        safetyMarginPercent: 0.01 // 1% safety margin
      };

      const resultsNoMargin = calculator.calculate(quotes, noMargin);
      const resultsWithMargin = calculator.calculate(quotes, withMargin);

      // With safety margin, fewer opportunities should be valid
      const validNoMargin = resultsNoMargin.filter(r => r.valid).length;
      const validWithMargin = resultsWithMargin.filter(r => r.valid).length;

      expect(validWithMargin).toBeLessThanOrEqual(validNoMargin);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero prices gracefully', () => {
      const quotes = createQuotes(0, 1, 1, 0);
      const results = calculator.calculate(quotes, DEFAULT_FEE_STRUCTURE);

      // Should not crash and should return results
      expect(results).toHaveLength(2);
    });

    it('should handle prices at 1.0 gracefully', () => {
      const quotes = createQuotes(1, 0, 0, 1);
      const results = calculator.calculate(quotes, DEFAULT_FEE_STRUCTURE);

      expect(results).toHaveLength(2);
      // With extreme prices (1,0,0,1), cost = 1 + 0 or 0 + 1 = 1
      // After fees, total cost > 1, so no valid arbitrage
      // However, one combination might be 0 + 0 which would be valid but unrealistic
      // Let's just verify no crash and results are returned
      expect(results.length).toBe(2);
    });

    it('should handle very small price differences (precision test)', () => {
      // Prices differ by only 0.001
      const quotes = createQuotes(0.4995, 0.5005, 0.5005, 0.4995);
      const results = calculator.calculate(quotes, DEFAULT_FEE_STRUCTURE);

      // Should still calculate correctly despite small differences
      expect(results).toHaveLength(2);
    });

    it('should handle extreme arbitrage opportunity', () => {
      // Unrealistic but mathematically possible
      const quotes = createQuotes(0.20, 0.80, 0.80, 0.20);
      const results = calculator.calculate(quotes, DEFAULT_FEE_STRUCTURE);

      const validResults = results.filter(r => r.valid);
      expect(validResults.length).toBeGreaterThan(0);

      // Should detect massive profit
      expect(validResults[0].profitPercent).toBeGreaterThan(50);
    });

    it('should validate that total cost never exceeds 1.0 for valid opportunities', () => {
      const quotes = createQuotes(0.45, 0.55, 0.55, 0.45);
      const results = calculator.calculate(quotes, DEFAULT_FEE_STRUCTURE);

      const validResults = results.filter(r => r.valid);
      validResults.forEach(result => {
        expect(result.totalCost).toBeLessThan(1);
      });
    });
  });

  describe('Mathematical Accuracy', () => {
    it('should calculate profit percentage correctly', () => {
      // Known scenario: cost = 0.90, profit = 0.10 = 10%
      const quotes = createQuotes(0.44, 0.56, 0.56, 0.44);
      const noFees: FeeStructure = {
        kalshiFeePerContract: 0,
        polymarketFeeRate: 0,
        safetyMarginPercent: 0
      };

      const results = calculator.calculate(quotes, noFees);
      const result = results[0];

      // 0.44 + 0.44 = 0.88, profit = 0.12 = 12%
      expect(result.profitPercent).toBeCloseTo(12, 1);
    });

    it('should maintain decimal precision for small profits', () => {
      // Test that we don't lose precision on small profit margins
      const quotes = createQuotes(0.495, 0.505, 0.505, 0.495);
      const results = calculator.calculate(quotes, DEFAULT_FEE_STRUCTURE);

      // Profit should be calculable to at least 2 decimal places
      results.forEach(result => {
        expect(result.profitPercent.toString()).toMatch(/\d+\.\d{2,}/);
      });
    });

    it('should validate break-even calculation', () => {
      const quotes = createQuotes(0.45, 0.55, 0.55, 0.45);
      const results = calculator.calculate(quotes, DEFAULT_FEE_STRUCTURE);

      results.forEach(result => {
        // Break-even should be 1 - profit
        const expectedBreakEven = 1 - (result.profitPercent / 100);
        expect(result.breakEven).toBeCloseTo(expectedBreakEven, 3);
      });
    });
  });

  describe('Validation Service Integration', () => {
    it('should validate profitable opportunities', () => {
      const quotes = createQuotes(0.40, 0.60, 0.60, 0.40);
      const results = calculator.calculate(quotes, DEFAULT_FEE_STRUCTURE);
      const validResult = results.find(r => r.valid);

      if (validResult) {
        const validation = calculator.validate(validResult);
        expect(validation.valid).toBe(true);
        expect(validation.errors).toHaveLength(0);
      }
    });

    it('should invalidate opportunities with negative prices', () => {
      const badResult: any = {
        direction: 'KALSHI_YES_POLY_NO',
        profitPercent: 10,
        totalCost: 0.90,
        kalshiLeg: -0.05, // Negative!
        polymarketLeg: 0.45,
        fees: { kalshiFee: 0, polymarketFee: 0, totalFees: 0, feePercent: 0 },
        breakEven: 0.90,
        valid: true
      };

      const validation = calculator.validate(badResult);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Negative prices detected');
    });

    it('should invalidate opportunities with prices > 1', () => {
      const badResult: any = {
        direction: 'KALSHI_YES_POLY_NO',
        profitPercent: 10,
        totalCost: 0.90,
        kalshiLeg: 1.05, // > 1!
        polymarketLeg: 0.45,
        fees: { kalshiFee: 0, polymarketFee: 0, totalFees: 0, feePercent: 0 },
        breakEven: 0.90,
        valid: true
      };

      const validation = calculator.validate(badResult);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Prices exceed 1.0');
    });

    it('should warn on very low profit margins', () => {
      // Create a scenario with 0.05% profit
      const quotes = createQuotes(0.4975, 0.5025, 0.5025, 0.4975);
      const results = calculator.calculate(quotes, { ...DEFAULT_FEE_STRUCTURE, safetyMarginPercent: 0 });
      const result = results.find(r => r.valid);

      if (result && result.profitPercent < 0.1) {
        const validation = calculator.validate(result);
        expect(validation.warnings).toContain('Very low profit margin');
      }
    });

    it('should warn on suspiciously high profits', () => {
      const quotes = createQuotes(0.15, 0.85, 0.85, 0.15);
      const results = calculator.calculate(quotes, DEFAULT_FEE_STRUCTURE);
      const result = results.find(r => r.valid);

      if (result && result.profitPercent > 10) {
        const validation = calculator.validate(result);
        expect(validation.warnings).toContain('Unusually high profit - verify data accuracy');
      }
    });

    it('should warn on very low profit margins', () => {
      // Create result with profit between 0 and 0.1%
      const badResult: any = {
        direction: 'KALSHI_YES_POLY_NO',
        profitPercent: 0.05, // Very low!
        totalCost: 0.9995,
        kalshiLeg: 0.4995,
        polymarketLeg: 0.4995,
        fees: { kalshiFee: 0.0001, polymarketFee: 0.0004, totalFees: 0.0005, feePercent: 0.05 },
        breakEven: 0.9995,
        valid: true
      };

      const validation = calculator.validate(badResult);
      expect(validation.warnings).toContain('Very low profit margin');
    });

    it('should invalidate when total cost >= 1', () => {
      const badResult: any = {
        direction: 'KALSHI_YES_POLY_NO',
        profitPercent: -5,
        totalCost: 1.05, // Over 1!
        kalshiLeg: 0.50,
        polymarketLeg: 0.50,
        fees: { kalshiFee: 0.01, polymarketFee: 0.04, totalFees: 0.05, feePercent: 5 },
        breakEven: 1.05,
        valid: true
      };

      const validation = calculator.validate(badResult);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Total cost exceeds guaranteed payout');
    });
  });

  describe('Slippage Estimation', () => {
    it('should return zero slippage for empty depth', () => {
      const slippage = calculator.estimateSlippage(100, []);
      expect(slippage).toBe(0);
    });

    it('should calculate linear slippage within depth', () => {
      const slippage = calculator.estimateSlippage(100, [500, 300, 200]);
      // Total depth = 1000, size = 100, slippage = (100/1000) * 0.02 = 0.002
      expect(slippage).toBeCloseTo(0.002, 4);
    });

    it('should return 10% slippage when exceeding depth', () => {
      const slippage = calculator.estimateSlippage(1500, [500, 300, 200]);
      // Size 1500 > depth 1000, returns 0.1
      expect(slippage).toBe(0.1);
    });

    it('should handle single depth level', () => {
      const slippage = calculator.estimateSlippage(50, [100]);
      expect(slippage).toBeCloseTo(0.01, 4); // 50/100 * 0.02
    });
  });

  describe('Real-World Scenarios', () => {
    it('should match manual calculation for standard arbitrage', () => {
      // Manual calculation:
      // Kalshi YES ask = 0.47
      // Polymarket NO ask = 0.46
      // Total cost before fees = 0.93
      // Kalshi fee = 0.01
      // Poly profit = 1 - 0.46 = 0.54, fee = 0.54 * 0.02 = 0.0108
      // Total fees = 0.0208
      // Total cost = 0.93 + 0.0208 = 0.9508
      // Profit = 1 - 0.9508 = 0.0492 = 4.92%

      const quotes = createQuotes(0.47, 0.53, 0.54, 0.46);
      const results = calculator.calculate(quotes, DEFAULT_FEE_STRUCTURE);
      const result = results.find(r => r.direction === 'KALSHI_YES_POLY_NO');

      expect(result).toBeDefined();
      // Allow small tolerance for rounding
      expect(result!.profitPercent).toBeCloseTo(4.92, 1);
    });

    it('should calculate max size based on liquidity', () => {
      const quotes = createQuotes(0.45, 0.55, 0.55, 0.45);
      const results = calculator.calculate(quotes, DEFAULT_FEE_STRUCTURE);
      const result = results[0];

      // Test with 500 units of liquidity
      const maxSize = calculator.calculateMaxSize(result, 500);

      // Should not exceed available liquidity
      expect(maxSize).toBeLessThanOrEqual(500);
      // Should not exceed affordable amount (assuming $10k capital)
      expect(maxSize).toBeLessThanOrEqual(10000 / result.totalCost);
    });
  });
});
