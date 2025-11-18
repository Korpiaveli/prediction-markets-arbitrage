import { describe, it, expect } from 'vitest';
import { FeeCalculator } from '../fees.js';

describe('FeeCalculator', () => {
  const calculator = new FeeCalculator();

  describe('Kalshi Fee Calculation', () => {
    it('should calculate per-contract fee correctly', () => {
      // Kalshi charges $0.01 per contract (default)
      const fee = calculator.calculateKalshiFee(100, 0.50);
      expect(fee).toBe(1.00); // 100 contracts * $0.01
    });

    it('should scale with number of contracts', () => {
      const fee1 = calculator.calculateKalshiFee(1, 0.50);
      const fee10 = calculator.calculateKalshiFee(10, 0.50);
      const fee100 = calculator.calculateKalshiFee(100, 0.50);

      expect(fee10).toBe(fee1 * 10);
      expect(fee100).toBe(fee1 * 100);
    });

    it('should handle zero contracts', () => {
      const fee = calculator.calculateKalshiFee(0, 0.50);
      expect(fee).toBe(0);
    });

    it('should handle single contract', () => {
      const fee = calculator.calculateKalshiFee(1, 0.75);
      expect(fee).toBe(0.01);
    });

    it('should not depend on price (per-contract model)', () => {
      const fee1 = calculator.calculateKalshiFee(100, 0.10);
      const fee2 = calculator.calculateKalshiFee(100, 0.90);

      expect(fee1).toBe(fee2); // Same regardless of price
    });
  });

  describe('Polymarket Fee Calculation', () => {
    it('should calculate profit-based fee correctly', () => {
      // 2% of profit
      const profit = 0.50; // $0.50 profit
      const fee = calculator.calculatePolymarketFee(profit);

      expect(fee).toBe(0.01); // 2% of $0.50 = $0.01
    });

    it('should return zero for zero profit', () => {
      const fee = calculator.calculatePolymarketFee(0);
      expect(fee).toBe(0);
    });

    it('should return zero for negative profit', () => {
      const fee = calculator.calculatePolymarketFee(-0.10);
      expect(fee).toBe(0);
    });

    it('should scale with profit amount', () => {
      const fee1 = calculator.calculatePolymarketFee(0.10);
      const fee2 = calculator.calculatePolymarketFee(0.20);
      const fee3 = calculator.calculatePolymarketFee(1.00);

      expect(fee2).toBe(fee1 * 2);
      expect(fee3).toBe(fee1 * 10);
    });

    it('should handle very small profits with precision', () => {
      const fee = calculator.calculatePolymarketFee(0.005); // Half a cent profit
      expect(fee).toBeCloseTo(0.0001, 4); // 2% of 0.005
    });

    it('should handle large profits', () => {
      const fee = calculator.calculatePolymarketFee(100); // $100 profit
      expect(fee).toBe(2.00); // 2% of $100
    });
  });

  describe('Total Fee Calculation', () => {
    it('should combine Kalshi and Polymarket fees', () => {
      // 100 contracts, Kalshi leg at 0.40, Poly leg at 0.45
      // Kalshi fee = 100 * 0.01 = 1.00
      // Poly profit = 1 - 0.45 = 0.55, fee = 0.55 * 0.02 = 0.011
      // Total = 1.011
      const total = calculator.calculateTotalFees(0.40, 0.45, 100);

      expect(total).toBeCloseTo(1.011, 3);
    });

    it('should handle zero contracts', () => {
      const total = calculator.calculateTotalFees(0.50, 0.50, 0);
      // Kalshi fee = 0 contracts * 0.01 = 0
      // Poly fee = (1 - 0.50) * 0.02 = 0.01
      expect(total).toBe(0.01); // Still has Polymarket fee based on profit
    });

    it('should handle high Polymarket leg price (low profit)', () => {
      // Poly leg at 0.95 means only 0.05 profit
      // Fee should be 2% of 0.05 = 0.001
      const total = calculator.calculateTotalFees(0.50, 0.95, 1);

      const expectedKalshi = 0.01;
      const expectedPoly = 0.05 * 0.02;
      expect(total).toBeCloseTo(expectedKalshi + expectedPoly, 4);
    });

    it('should handle low Polymarket leg price (high profit)', () => {
      // Poly leg at 0.10 means 0.90 profit
      // Fee should be 2% of 0.90 = 0.018
      const total = calculator.calculateTotalFees(0.50, 0.10, 1);

      const expectedKalshi = 0.01;
      const expectedPoly = 0.90 * 0.02;
      expect(total).toBeCloseTo(expectedKalshi + expectedPoly, 4);
    });
  });

  describe('Tiered Fee Calculation', () => {
    it('should apply lower fees for high volume users', () => {
      const lowVol = calculator.calculateTieredFees(1000, false);
      const highVol = calculator.calculateTieredFees(10000, false);

      expect(highVol).toBeLessThan(lowVol);
    });

    it('should apply VIP discounts', () => {
      const regular = calculator.calculateTieredFees(5000, false);
      const vip = calculator.calculateTieredFees(5000, true);

      expect(vip).toBeLessThan(regular);
    });

    it('should return fee rate for low volume non-VIP', () => {
      const fee = calculator.calculateTieredFees(1000, false);
      expect(fee).toBe(0.015); // 1.5%
    });

    it('should return fee rate for high volume non-VIP', () => {
      const fee = calculator.calculateTieredFees(10000, false);
      expect(fee).toBe(0.01); // 1%
    });

    it('should return fee rate for low volume VIP', () => {
      const fee = calculator.calculateTieredFees(1000, true);
      expect(fee).toBe(0.008); // 0.8%
    });

    it('should return fee rate for high volume VIP', () => {
      const fee = calculator.calculateTieredFees(20000, true);
      expect(fee).toBe(0.005); // 0.5%
    });
  });

  describe('Edge Cases', () => {
    it('should handle very large contract numbers', () => {
      const fee = calculator.calculateKalshiFee(1000000, 0.50);
      expect(fee).toBe(10000); // 1M * $0.01
    });

    it('should handle fractional contracts (though unrealistic)', () => {
      const fee = calculator.calculateKalshiFee(100.5, 0.50);
      expect(fee).toBeCloseTo(1.005, 3);
    });

    it('should maintain precision with small decimals', () => {
      const profit = 0.00001; // Very small profit
      const fee = calculator.calculatePolymarketFee(profit);

      expect(fee).toBeCloseTo(0.0000002, 7);
    });
  });

  describe('Real-World Scenarios', () => {
    it('should match manual calculation for typical trade', () => {
      // Manual: 50 contracts
      // Kalshi fee: 50 * $0.01 = $0.50
      // Poly leg at 0.45, profit = 0.55, fee = 0.55 * 0.02 = $0.011
      // Total: $0.511

      const total = calculator.calculateTotalFees(0.50, 0.45, 50);
      expect(total).toBeCloseTo(0.511, 3);
    });

    it('should calculate fees for small arbitrage opportunity', () => {
      // 10 contracts with small profit margin
      const total = calculator.calculateTotalFees(0.48, 0.47, 10);

      // Kalshi: 10 * 0.01 = 0.10
      // Poly: (1 - 0.47) * 0.02 = 0.53 * 0.02 = 0.0106
      // Total: 0.1106
      expect(total).toBeCloseTo(0.1106, 4);
    });

    it('should calculate fees for large arbitrage opportunity', () => {
      // 1000 contracts with good profit margin
      const total = calculator.calculateTotalFees(0.30, 0.35, 1000);

      // Kalshi: 1000 * 0.01 = 10.00
      // Poly: (1 - 0.35) * 0.02 = 0.65 * 0.02 = 0.013
      // Total: 10.013
      expect(total).toBeCloseTo(10.013, 3);
    });
  });
});
