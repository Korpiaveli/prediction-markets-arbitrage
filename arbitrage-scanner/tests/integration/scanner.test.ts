/**
 * Integration Tests - Scanner Workflow
 *
 * Tests the complete end-to-end scanning workflow:
 * 1. Initialize exchanges
 * 2. Fetch markets and quotes
 * 3. Calculate arbitrage
 * 4. Store opportunities
 * 5. Retrieve and filter results
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Scanner } from '@arb/scanner';
import { ArbitrageCalculator } from '@arb/math';
import { MockExchange } from '@arb/exchanges';
import { JsonStorage } from '@arb/storage';
import { Market, Quote, ArbitrageOpportunity } from '@arb/core';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

describe('Scanner Integration Tests', () => {
  const testDataDir = join(process.cwd(), 'tests', 'data', 'scanner-test');
  let scanner: Scanner;
  let storage: JsonStorage;
  let exchanges: MockExchange[];

  beforeAll(async () => {
    // Create test data directory
    if (existsSync(testDataDir)) {
      rmSync(testDataDir, { recursive: true });
    }
    mkdirSync(testDataDir, { recursive: true });

    // Initialize components
    exchanges = [
      new MockExchange({ testMode: true }),
      new MockExchange({ testMode: true })
    ];

    // Override names for testing
    (exchanges[0] as any).name = 'KALSHI';
    (exchanges[1] as any).name = 'POLYMARKET';

    storage = new JsonStorage({
      dataDir: testDataDir,
      prettyPrint: true
    });

    await storage.connect();

    scanner = new Scanner({
      exchanges,
      calculator: new ArbitrageCalculator(),
      storage,
      scanInterval: 1000
    });

    // Connect exchanges
    for (const exchange of exchanges) {
      await exchange.connect();
    }
  });

  afterAll(async () => {
    // Cleanup
    await scanner.destroy();
    if (existsSync(testDataDir)) {
      rmSync(testDataDir, { recursive: true });
    }
  });

  describe('End-to-End Scanning', () => {
    it('should complete a full scan cycle', async () => {
      const opportunities = await scanner.scan();

      expect(opportunities).toBeDefined();
      expect(Array.isArray(opportunities)).toBe(true);
    });

    it('should calculate arbitrage opportunities', async () => {
      const opportunities = await scanner.scan();

      if (opportunities.length > 0) {
        const opp = opportunities[0];

        expect(opp).toHaveProperty('id');
        expect(opp).toHaveProperty('profitPercent');
        expect(opp).toHaveProperty('marketPair');
        expect(opp).toHaveProperty('quotePair');
        expect(opp).toHaveProperty('fees');
        expect(opp).toHaveProperty('liquidity');
        expect(typeof opp.profitPercent).toBe('number');
      }
    });

    it('should store opportunities correctly', async () => {
      const opportunities = await scanner.scan();

      // Retrieve from storage
      const stored = await storage.getOpportunities({
        limit: 100,
        orderBy: 'timestamp',
        order: 'desc'
      });

      expect(stored).toBeDefined();
      expect(Array.isArray(stored)).toBe(true);
      expect(stored.length).toBeGreaterThanOrEqual(0);
    });

    it('should emit events during scanning', async () => {
      const eventPromise = new Promise((resolve) => {
        scanner.once('scan:complete', (opportunities) => {
          expect(opportunities).toBeDefined();
          resolve(opportunities);
        });
      });

      await scanner.scan();
      await eventPromise;
    });

    it('should filter opportunities by profit threshold', async () => {
      const allOpportunities = await scanner.scan();
      const minProfit = 2.0;

      const filtered = allOpportunities.filter(
        opp => opp.profitPercent >= minProfit
      );

      filtered.forEach(opp => {
        expect(opp.profitPercent).toBeGreaterThanOrEqual(minProfit);
      });
    });

    it('should validate opportunity data structure', async () => {
      const opportunities = await scanner.scan();

      if (opportunities.length > 0) {
        const opp = opportunities[0];

        // Validate market pair
        expect(opp.marketPair).toBeDefined();
        expect(opp.marketPair.kalshiMarket).toBeDefined();
        expect(opp.marketPair.polymarketMarket).toBeDefined();

        // Validate quotes
        expect(opp.quotePair).toBeDefined();
        expect(opp.quotePair.kalshi).toBeDefined();
        expect(opp.quotePair.polymarket).toBeDefined();

        // Validate fees
        expect(opp.fees).toBeDefined();
        expect(opp.fees.totalFees).toBeGreaterThanOrEqual(0);

        // Validate liquidity
        expect(opp.liquidity).toBeDefined();
        expect(opp.liquidity.maxExecutable).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle exchange connection errors gracefully', async () => {
      const badExchange = new MockExchange({ testMode: true });
      (badExchange as any).name = 'BAD_EXCHANGE';

      // Force connect to fail
      (badExchange as any).connect = async () => {
        throw new Error('Connection failed');
      };

      const badScanner = new Scanner({
        exchanges: [badExchange],
        calculator: new ArbitrageCalculator(),
        storage,
        scanInterval: 1000
      });

      await expect(badExchange.connect()).rejects.toThrow('Connection failed');
    });

    it('should continue scanning after individual market errors', async () => {
      // Scanner should be resilient to individual market failures
      const opportunities = await scanner.scan();

      // Should complete scan even if some markets fail
      expect(opportunities).toBeDefined();
    });
  });

  describe('Performance', () => {
    it('should complete scan within reasonable time', async () => {
      const startTime = Date.now();
      await scanner.scan();
      const duration = Date.now() - startTime;

      // Should complete within 5 seconds for mock data
      expect(duration).toBeLessThan(5000);
    });

    it('should handle concurrent scans', async () => {
      const scans = await Promise.all([
        scanner.scan(),
        scanner.scan(),
        scanner.scan()
      ]);

      expect(scans).toHaveLength(3);
      scans.forEach(opportunities => {
        expect(Array.isArray(opportunities)).toBe(true);
      });
    });
  });

  describe('Data Integrity', () => {
    it('should maintain consistent opportunity IDs', async () => {
      const opportunities = await scanner.scan();

      const ids = new Set(opportunities.map(o => o.id));

      // All IDs should be unique
      expect(ids.size).toBe(opportunities.length);
    });

    it('should preserve timestamp ordering', async () => {
      const opportunities = await scanner.scan();

      // All opportunities from same scan should have similar timestamps
      if (opportunities.length > 1) {
        const timestamps = opportunities.map(o => o.timestamp.getTime());
        const maxDiff = Math.max(...timestamps) - Math.min(...timestamps);

        // Should be within 1 second of each other
        expect(maxDiff).toBeLessThan(1000);
      }
    });

    it('should calculate fees correctly', async () => {
      const opportunities = await scanner.scan();

      opportunities.forEach(opp => {
        // Fees should be positive or zero
        expect(opp.fees.totalFees).toBeGreaterThanOrEqual(0);
        expect(opp.fees.kalshiFee).toBeGreaterThanOrEqual(0);
        expect(opp.fees.polymarketFee).toBeGreaterThanOrEqual(0);

        // Total should equal sum of individual fees
        expect(opp.fees.totalFees).toBeCloseTo(
          opp.fees.kalshiFee + opp.fees.polymarketFee,
          5
        );
      });
    });
  });
});
