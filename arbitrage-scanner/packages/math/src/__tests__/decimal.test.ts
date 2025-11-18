import { describe, it, expect } from 'vitest';
import { SafeDecimal } from '../decimal.js';
import Decimal from 'decimal.js';

describe('SafeDecimal', () => {
  describe('Construction', () => {
    it('should create from number', () => {
      const d = new SafeDecimal(0.1);
      expect(d.toNumber()).toBe(0.1);
    });

    it('should create from string', () => {
      const d = new SafeDecimal('0.1');
      expect(d.toNumber()).toBe(0.1);
    });

    it('should create from Decimal', () => {
      const decimal = new Decimal(0.1);
      const d = new SafeDecimal(decimal);
      expect(d.toNumber()).toBe(0.1);
    });

    it('should create using static from method', () => {
      const d = SafeDecimal.from(0.1);
      expect(d.toNumber()).toBe(0.1);
    });
  });

  describe('Addition', () => {
    it('should add two SafeDecimal values', () => {
      const a = new SafeDecimal(0.1);
      const b = new SafeDecimal(0.2);
      const result = a.add(b);
      expect(result.toNumber()).toBeCloseTo(0.3, 10);
    });

    it('should add number to SafeDecimal', () => {
      const a = new SafeDecimal(0.1);
      const result = a.add(0.2);
      expect(result.toNumber()).toBeCloseTo(0.3, 10);
    });

    it('should handle floating point precision', () => {
      // JavaScript: 0.1 + 0.2 = 0.30000000000000004
      // SafeDecimal should handle this correctly
      const a = new SafeDecimal(0.1);
      const b = new SafeDecimal(0.2);
      const result = a.add(b);
      expect(result.toString()).toBe('0.3');
    });
  });

  describe('Subtraction', () => {
    it('should subtract two SafeDecimal values', () => {
      const a = new SafeDecimal(0.3);
      const b = new SafeDecimal(0.1);
      const result = a.sub(b);
      expect(result.toNumber()).toBeCloseTo(0.2, 10);
    });

    it('should subtract number from SafeDecimal', () => {
      const a = new SafeDecimal(0.3);
      const result = a.sub(0.1);
      expect(result.toNumber()).toBeCloseTo(0.2, 10);
    });

    it('should handle negative results', () => {
      const a = new SafeDecimal(0.1);
      const b = new SafeDecimal(0.3);
      const result = a.sub(b);
      expect(result.toNumber()).toBeCloseTo(-0.2, 10);
    });
  });

  describe('Multiplication', () => {
    it('should multiply two SafeDecimal values', () => {
      const a = new SafeDecimal(0.1);
      const b = new SafeDecimal(0.2);
      const result = a.mul(b);
      expect(result.toNumber()).toBeCloseTo(0.02, 10);
    });

    it('should multiply SafeDecimal by number', () => {
      const a = new SafeDecimal(0.1);
      const result = a.mul(3);
      expect(result.toNumber()).toBeCloseTo(0.3, 10);
    });

    it('should handle large multiplications within precision limits', () => {
      const a = new SafeDecimal(10000);
      const b = new SafeDecimal(10000);
      const result = a.mul(b);
      expect(result.toNumber()).toBe(100000000);
    });
  });

  describe('Division', () => {
    it('should divide two SafeDecimal values', () => {
      const a = new SafeDecimal(1);
      const b = new SafeDecimal(3);
      const result = a.div(b);
      expect(result.toFixed(10)).toBe('0.3333333333');
    });

    it('should divide SafeDecimal by number', () => {
      const a = new SafeDecimal(1);
      const result = a.div(2);
      expect(result.toNumber()).toBe(0.5);
    });

    it('should divide two SafeDecimal values', () => {
      const a = new SafeDecimal(10);
      const b = new SafeDecimal(4);
      const result = a.div(b);
      expect(result.toNumber()).toBe(2.5);
    });

    it('should throw error on division by zero', () => {
      const a = new SafeDecimal(1);
      expect(() => a.div(0)).toThrow('Division by zero');
    });

    it('should throw error on division by zero SafeDecimal', () => {
      const a = new SafeDecimal(1);
      const b = new SafeDecimal(0);
      expect(() => a.div(b)).toThrow('Division by zero');
    });
  });

  describe('Comparison Operations', () => {
    describe('Greater Than (gt)', () => {
      it('should return true when greater', () => {
        const a = new SafeDecimal(0.3);
        const b = new SafeDecimal(0.2);
        expect(a.gt(b)).toBe(true);
      });

      it('should return false when not greater', () => {
        const a = new SafeDecimal(0.2);
        const b = new SafeDecimal(0.3);
        expect(a.gt(b)).toBe(false);
      });

      it('should compare with number', () => {
        const a = new SafeDecimal(0.3);
        expect(a.gt(0.2)).toBe(true);
      });

      it('should compare with SafeDecimal parameter', () => {
        const a = new SafeDecimal(0.5);
        const b = new SafeDecimal(0.3);
        expect(a.gt(b)).toBe(true);
      });
    });

    describe('Greater Than or Equal (gte)', () => {
      it('should return true when greater', () => {
        const a = new SafeDecimal(0.3);
        const b = new SafeDecimal(0.2);
        expect(a.gte(b)).toBe(true);
      });

      it('should return true when equal', () => {
        const a = new SafeDecimal(0.3);
        const b = new SafeDecimal(0.3);
        expect(a.gte(b)).toBe(true);
      });

      it('should return false when less', () => {
        const a = new SafeDecimal(0.2);
        const b = new SafeDecimal(0.3);
        expect(a.gte(b)).toBe(false);
      });

      it('should compare with SafeDecimal parameter', () => {
        const a = new SafeDecimal(0.5);
        const b = new SafeDecimal(0.3);
        expect(a.gte(b)).toBe(true);
      });
    });

    describe('Less Than (lt)', () => {
      it('should return true when less', () => {
        const a = new SafeDecimal(0.2);
        const b = new SafeDecimal(0.3);
        expect(a.lt(b)).toBe(true);
      });

      it('should return false when not less', () => {
        const a = new SafeDecimal(0.3);
        const b = new SafeDecimal(0.2);
        expect(a.lt(b)).toBe(false);
      });

      it('should compare with number', () => {
        const a = new SafeDecimal(0.2);
        expect(a.lt(0.3)).toBe(true);
      });

      it('should compare with SafeDecimal parameter', () => {
        const a = new SafeDecimal(0.2);
        const b = new SafeDecimal(0.5);
        expect(a.lt(b)).toBe(true);
      });
    });

    describe('Less Than or Equal (lte)', () => {
      it('should return true when less', () => {
        const a = new SafeDecimal(0.2);
        const b = new SafeDecimal(0.3);
        expect(a.lte(b)).toBe(true);
      });

      it('should return true when equal', () => {
        const a = new SafeDecimal(0.3);
        const b = new SafeDecimal(0.3);
        expect(a.lte(b)).toBe(true);
      });

      it('should return false when greater', () => {
        const a = new SafeDecimal(0.3);
        const b = new SafeDecimal(0.2);
        expect(a.lte(b)).toBe(false);
      });

      it('should compare with number', () => {
        const a = new SafeDecimal(0.3);
        expect(a.lte(0.3)).toBe(true);
        expect(a.lte(0.4)).toBe(true);
        expect(a.lte(0.2)).toBe(false);
      });
    });
  });

  describe('Conversion Methods', () => {
    describe('toNumber', () => {
      it('should convert to number', () => {
        const d = new SafeDecimal('123.456');
        expect(d.toNumber()).toBe(123.456);
      });

      it('should handle very small numbers', () => {
        const d = new SafeDecimal('0.00001');
        expect(d.toNumber()).toBe(0.00001);
      });
    });

    describe('toFixed', () => {
      it('should format to fixed decimal places', () => {
        const d = new SafeDecimal('123.456789');
        expect(d.toFixed(2)).toBe('123.45');
      });

      it('should round down by default', () => {
        const d = new SafeDecimal('123.999');
        expect(d.toFixed(2)).toBe('123.99');
      });

      it('should pad with zeros', () => {
        const d = new SafeDecimal('123.4');
        expect(d.toFixed(3)).toBe('123.400');
      });

      it('should handle zero decimal places', () => {
        const d = new SafeDecimal('123.456');
        expect(d.toFixed(0)).toBe('123');
      });
    });

    describe('toString', () => {
      it('should convert to string', () => {
        const d = new SafeDecimal('123.456');
        expect(d.toString()).toBe('123.456');
      });

      it('should handle integers', () => {
        const d = new SafeDecimal(100);
        expect(d.toString()).toBe('100');
      });

      it('should handle very small decimals within precision limits', () => {
        const d = new SafeDecimal('0.000001'); // Within minE: -9 range
        expect(d.toString()).toBe('0.000001');
      });
    });
  });

  describe('Financial Precision', () => {
    it('should handle typical arbitrage calculations', () => {
      // 0.48 + 0.48 should be exactly 0.96
      const a = new SafeDecimal('0.48');
      const b = new SafeDecimal('0.48');
      const sum = a.add(b);
      expect(sum.toString()).toBe('0.96');
    });

    it('should handle fee calculations', () => {
      // 100 contracts * $0.01 fee
      const contracts = new SafeDecimal(100);
      const feePerContract = new SafeDecimal('0.01');
      const totalFee = contracts.mul(feePerContract);
      expect(totalFee.toNumber()).toBe(1.0);
    });

    it('should handle percentage calculations', () => {
      // 2% of $0.50
      const profit = new SafeDecimal('0.50');
      const rate = new SafeDecimal('0.02');
      const fee = profit.mul(rate);
      expect(fee.toFixed(2)).toBe('0.01');
    });

    it('should handle complex arbitrage formula', () => {
      // totalCost = entry1 + entry2 + fees
      // profit = 1 - totalCost
      const entry1 = new SafeDecimal('0.45');
      const entry2 = new SafeDecimal('0.46');
      const fees = new SafeDecimal('0.02');

      const totalCost = entry1.add(entry2).add(fees);
      const payout = new SafeDecimal(1);
      const profit = payout.sub(totalCost);

      expect(profit.toFixed(2)).toBe('0.07');
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero', () => {
      const d = new SafeDecimal(0);
      expect(d.toNumber()).toBe(0);
      expect(d.toString()).toBe('0');
    });

    it('should handle negative numbers', () => {
      const d = new SafeDecimal(-123.45);
      expect(d.toNumber()).toBe(-123.45);
      expect(d.toString()).toBe('-123.45');
    });

    it('should chain operations', () => {
      const result = new SafeDecimal(100)
        .add(50)
        .sub(30)
        .mul(2)
        .div(4);

      expect(result.toNumber()).toBe(60);
    });
  });
});
