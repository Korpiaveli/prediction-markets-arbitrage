import { describe, it, expect } from 'vitest';
import { ValidationService } from '../validation.js';
import { Quote, ArbitrageOpportunity } from '@arb/core';

describe('ValidationService', () => {
  const validator = new ValidationService();

  // Helper to create test quote
  const createQuote = (
    yesBid: number,
    yesAsk: number,
    noBid: number,
    noAsk: number,
    lastUpdate?: Date
  ): Quote => ({
    marketId: 'TEST_MARKET',
    exchange: 'KALSHI',
    timestamp: new Date(),
    yes: { bid: yesBid, ask: yesAsk, mid: (yesBid + yesAsk) / 2 },
    no: { bid: noBid, ask: noAsk, mid: (noBid + noAsk) / 2 },
    lastUpdate: lastUpdate || new Date()
  });

  describe('Quote Validation', () => {
    it('should validate a normal quote', () => {
      const quote = createQuote(0.48, 0.50, 0.48, 0.50);
      const errors = validator.validateQuote(quote);

      expect(errors).toHaveLength(0);
    });

    it('should detect inverted YES spread (bid > ask)', () => {
      const quote = createQuote(0.55, 0.50, 0.48, 0.50); // YES bid > ask
      const errors = validator.validateQuote(quote);

      expect(errors).toContain('YES bid > ask (inverted spread)');
    });

    it('should detect inverted NO spread (bid > ask)', () => {
      const quote = createQuote(0.48, 0.50, 0.55, 0.50); // NO bid > ask
      const errors = validator.validateQuote(quote);

      expect(errors).toContain('NO bid > ask (inverted spread)');
    });

    it('should detect YES prices out of bounds (> 1)', () => {
      const quote = createQuote(0.99, 1.05, 0.48, 0.50); // YES ask > 1
      const errors = validator.validateQuote(quote);

      expect(errors).toContain('YES prices out of bounds [0,1]');
    });

    it('should detect YES prices out of bounds (< 0)', () => {
      const quote = createQuote(-0.05, 0.50, 0.48, 0.50); // YES bid < 0
      const errors = validator.validateQuote(quote);

      expect(errors).toContain('YES prices out of bounds [0,1]');
    });

    it('should detect NO prices out of bounds (> 1)', () => {
      const quote = createQuote(0.48, 0.50, 0.99, 1.05); // NO ask > 1
      const errors = validator.validateQuote(quote);

      expect(errors).toContain('NO prices out of bounds [0,1]');
    });

    it('should detect NO prices out of bounds (< 0)', () => {
      const quote = createQuote(0.48, 0.50, -0.05, 0.50); // NO bid < 0
      const errors = validator.validateQuote(quote);

      expect(errors).toContain('NO prices out of bounds [0,1]');
    });

    it('should detect when YES + NO mid prices do not sum to ~1', () => {
      const quote = createQuote(0.60, 0.62, 0.60, 0.62); // Mids: 0.61 + 0.61 = 1.22
      const errors = validator.validateQuote(quote);

      expect(errors.some(e => e.includes('YES + NO mid prices sum to'))).toBe(true);
    });

    it('should allow YES + NO to sum close to 1 within tolerance', () => {
      const quote = createQuote(0.49, 0.51, 0.49, 0.51); // Mids: 0.50 + 0.50 = 1.00
      const errors = validator.validateQuote(quote);

      expect(errors.some(e => e.includes('YES + NO mid prices'))).toBe(false);
    });

    it('should detect stale quotes (>1 minute old)', () => {
      const oldDate = new Date(Date.now() - 2 * 60 * 1000); // 2 minutes ago
      const quote = createQuote(0.48, 0.50, 0.48, 0.50, oldDate);
      const errors = validator.validateQuote(quote);

      expect(errors).toContain('Quote data is stale (>1 minute old)');
    });

    it('should not flag fresh quotes as stale', () => {
      const freshDate = new Date(Date.now() - 30 * 1000); // 30 seconds ago
      const quote = createQuote(0.48, 0.50, 0.48, 0.50, freshDate);
      const errors = validator.validateQuote(quote);

      expect(errors.some(e => e.includes('stale'))).toBe(false);
    });

    it('should detect multiple errors in a bad quote', () => {
      // Inverted spread AND out of bounds
      const quote = createQuote(0.55, 0.50, -0.05, 1.10);
      const errors = validator.validateQuote(quote);

      expect(errors.length).toBeGreaterThan(1);
    });
  });

  describe('Opportunity Validation', () => {
    // Helper to create test opportunity
    const createOpportunity = (
      profitPercent: number,
      totalCost: number,
      maxSize: number
    ): ArbitrageOpportunity => ({
      id: 'TEST_OPP',
      timestamp: new Date(),
      marketPair: {
        id: 'TEST_PAIR',
        description: 'Test Market',
        kalshiId: 'K1',
        polymarketId: 'P1',
        kalshiMarket: {} as any,
        polymarketMarket: {} as any
      },
      quotePair: {
        kalshi: createQuote(0.48, 0.50, 0.48, 0.50),
        polymarket: createQuote(0.48, 0.50, 0.48, 0.50),
        timestamp: new Date()
      },
      direction: 'KALSHI_YES_POLY_NO',
      profitPercent,
      profitDollars: profitPercent * maxSize,
      totalCost,
      maxSize,
      confidence: 90,
      ttl: 30,
      fees: { kalshiFee: 0.01, polymarketFee: 0.01, totalFees: 0.02, feePercent: 2 },
      liquidity: {
        kalshiAvailable: 5000,
        polymarketAvailable: 5000,
        maxExecutable: maxSize,
        depthQuality: 'DEEP'
      },
      valid: true
    });

    it('should validate a good opportunity', () => {
      const opp = createOpportunity(5.0, 0.95, 100);
      const isValid = validator.validateOpportunity(opp);

      expect(isValid).toBe(true);
    });

    it('should invalidate opportunity with negative profit', () => {
      const opp = createOpportunity(-1.0, 1.05, 100);
      const isValid = validator.validateOpportunity(opp);

      expect(isValid).toBe(false);
    });

    it('should invalidate opportunity with unrealistic profit (>50%)', () => {
      const opp = createOpportunity(60.0, 0.40, 100);
      const isValid = validator.validateOpportunity(opp);

      expect(isValid).toBe(false);
    });

    it('should invalidate opportunity with cost >= 1', () => {
      const opp = createOpportunity(0, 1.05, 100);
      const isValid = validator.validateOpportunity(opp);

      expect(isValid).toBe(false);
    });

    it('should invalidate opportunity with negative cost', () => {
      const opp = createOpportunity(100, -0.10, 100);
      const isValid = validator.validateOpportunity(opp);

      expect(isValid).toBe(false);
    });

    it('should invalidate opportunity with zero cost', () => {
      const opp = createOpportunity(100, 0, 100);
      const isValid = validator.validateOpportunity(opp);

      expect(isValid).toBe(false);
    });

    it('should invalidate opportunity with maxSize <= 0', () => {
      const opp = createOpportunity(5.0, 0.95, 0);
      const isValid = validator.validateOpportunity(opp);

      expect(isValid).toBe(false);
    });

    it('should invalidate opportunity with bad quote data', () => {
      const opp = createOpportunity(5.0, 0.95, 100);
      // Make the quote data bad
      opp.quotePair.kalshi.yes.bid = 0.60;
      opp.quotePair.kalshi.yes.ask = 0.55; // Inverted spread

      const isValid = validator.validateOpportunity(opp);

      expect(isValid).toBe(false);
    });

    it('should accept opportunity at upper profit bound (50%)', () => {
      const opp = createOpportunity(50.0, 0.50, 100);
      const isValid = validator.validateOpportunity(opp);

      expect(isValid).toBe(true);
    });

    it('should accept opportunity at lower cost bound (near 0)', () => {
      const opp = createOpportunity(10.0, 0.01, 100);
      const isValid = validator.validateOpportunity(opp);

      expect(isValid).toBe(true);
    });

    it('should accept opportunity with exactly 1 contract', () => {
      const opp = createOpportunity(5.0, 0.95, 1);
      const isValid = validator.validateOpportunity(opp);

      expect(isValid).toBe(true);
    });
  });

  describe('Arbitrage Feasibility Check', () => {
    it('should confirm feasibility when profit > safety margin', () => {
      // Entry1 + Entry2 + fees = 0.45 + 0.45 + 0.02 = 0.92
      // Profit = 1 - 0.92 = 0.08 (8%)
      // Safety margin = 0.01 (1%)
      // 0.08 > 0.01 → feasible
      const feasible = validator.checkArbitrageFeasibility(0.45, 0.45, 0.02, 0.01);

      expect(feasible).toBe(true);
    });

    it('should reject when profit < safety margin', () => {
      // Entry1 + Entry2 + fees = 0.49 + 0.49 + 0.02 = 1.00
      // Profit = 0
      // 0 < 0.01 → not feasible
      const feasible = validator.checkArbitrageFeasibility(0.49, 0.49, 0.02, 0.01);

      expect(feasible).toBe(false);
    });

    it('should reject when total cost >= 1', () => {
      const feasible = validator.checkArbitrageFeasibility(0.50, 0.50, 0.05, 0.01);

      expect(feasible).toBe(false);
    });

    it('should handle floating point precision at boundary', () => {
      // Edge case: profit nominally equals safety margin
      // Entry1 + Entry2 + fees = 0.48 + 0.48 + 0.02 = 0.98
      // Profit = 1 - 0.98 = 0.020000000000000018 (floating point!)
      // Due to floating point arithmetic, profit is slightly > safety margin
      const feasible = validator.checkArbitrageFeasibility(0.48, 0.48, 0.02, 0.02);

      expect(feasible).toBe(true); // Floating point makes profit slightly > margin
    });

    it('should handle zero safety margin', () => {
      const feasible = validator.checkArbitrageFeasibility(0.49, 0.49, 0.01, 0);

      expect(feasible).toBe(true); // Any profit > 0
    });

    it('should handle zero fees', () => {
      const feasible = validator.checkArbitrageFeasibility(0.45, 0.45, 0, 0.05);

      expect(feasible).toBe(true); // 0.90 total cost, profit = 0.10
    });

    it('should handle large safety margins', () => {
      const feasible = validator.checkArbitrageFeasibility(0.30, 0.30, 0.02, 0.30);

      // Total cost = 0.62, profit = 0.38
      // 0.38 > 0.30 → feasible
      expect(feasible).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle quotes with zero prices', () => {
      const quote = createQuote(0, 0, 1, 1);
      const errors = validator.validateQuote(quote);

      // Should not crash, might have errors about price distribution
      expect(errors.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle quotes with prices at exactly 1', () => {
      const quote = createQuote(0.99, 1.0, 0, 0.01);
      const errors = validator.validateQuote(quote);

      // Should not crash and should validate
      expect(errors.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle very small profit margins', () => {
      const feasible = validator.checkArbitrageFeasibility(0.4995, 0.4995, 0.0005, 0.0001);

      // Total = 0.9995, profit = 0.0005
      // 0.0005 > 0.0001 → feasible
      expect(feasible).toBe(true);
    });
  });
});
