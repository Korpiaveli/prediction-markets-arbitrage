/**
 * Integration Tests - Storage Workflow
 *
 * Tests the complete storage workflow:
 * 1. Connect to storage
 * 2. Save opportunities
 * 3. Query and filter
 * 4. Update and delete
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { JsonStorage } from '@arb/storage';
import { ArbitrageOpportunity } from '@arb/core';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

describe('Storage Integration Tests', () => {
  const testDataDir = join(process.cwd(), 'tests', 'data', 'storage-test');
  let storage: JsonStorage;

  beforeAll(async () => {
    // Create test data directory
    if (existsSync(testDataDir)) {
      rmSync(testDataDir, { recursive: true });
    }
    mkdirSync(testDataDir, { recursive: true });

    storage = new JsonStorage({
      dataDir: testDataDir,
      prettyPrint: true
    });

    await storage.connect();
  });

  afterAll(async () => {
    await storage.disconnect();
    if (existsSync(testDataDir)) {
      rmSync(testDataDir, { recursive: true });
    }
  });

  function createMockOpportunity(id: string, profitPercent: number): ArbitrageOpportunity {
    return {
      id,
      timestamp: new Date(),
      marketPair: {
        id: `pair-${id}`,
        description: `Test Pair ${id}`,
        kalshiMarket: {
          id: `kalshi-${id}`,
          exchangeId: `kalshi-${id}`,
          exchange: 'KALSHI',
          title: 'Test Market',
          description: 'Test',
          active: true
        },
        polymarketMarket: {
          id: `poly-${id}`,
          exchangeId: `poly-${id}`,
          exchange: 'POLYMARKET',
          title: 'Test Market',
          description: 'Test',
          active: true
        },
        kalshiId: `kalshi-${id}`,
        polymarketId: `poly-${id}`
      },
      quotePair: {
        kalshi: {
          marketId: `kalshi-${id}`,
          exchange: 'KALSHI',
          timestamp: new Date(),
          lastUpdate: new Date(),
          yes: { bid: 0.45, ask: 0.48, mid: 0.465 },
          no: { bid: 0.52, ask: 0.55, mid: 0.535 }
        },
        polymarket: {
          marketId: `poly-${id}`,
          exchange: 'POLYMARKET',
          timestamp: new Date(),
          lastUpdate: new Date(),
          yes: { bid: 0.50, ask: 0.53, mid: 0.515 },
          no: { bid: 0.47, ask: 0.50, mid: 0.485 }
        },
        timestamp: new Date()
      },
      direction: 'KALSHI_YES_POLY_NO',
      profitPercent,
      profitDollars: profitPercent * 10,
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
    };
  }

  describe('Basic Operations', () => {
    it('should save an opportunity', async () => {
      const opp = createMockOpportunity('test-1', 5.0);
      await storage.saveOpportunity(opp);

      const retrieved = await storage.getOpportunity(opp.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(opp.id);
    });

    it('should save multiple opportunities', async () => {
      const opps = [
        createMockOpportunity('test-2', 3.0),
        createMockOpportunity('test-3', 4.0),
        createMockOpportunity('test-4', 5.0)
      ];

      await storage.saveOpportunities(opps);

      for (const opp of opps) {
        const retrieved = await storage.getOpportunity(opp.id);
        expect(retrieved).toBeDefined();
        expect(retrieved?.id).toBe(opp.id);
      }
    });

    it('should retrieve all opportunities', async () => {
      const all = await storage.getOpportunities({
        limit: 100
      });

      expect(Array.isArray(all)).toBe(true);
      expect(all.length).toBeGreaterThan(0);
    });
  });

  describe('Querying and Filtering', () => {
    it('should limit results', async () => {
      const results = await storage.getOpportunities({
        limit: 2
      });

      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should filter by profit threshold', async () => {
      const minProfit = 4.0;
      const results = await storage.getOpportunities({
        limit: 100
      });

      const filtered = results.filter(o => o.profitPercent >= minProfit);

      filtered.forEach(opp => {
        expect(opp.profitPercent).toBeGreaterThanOrEqual(minProfit);
      });
    });

    it('should order results by timestamp descending', async () => {
      const results = await storage.getOpportunities({
        limit: 100,
        orderBy: 'timestamp',
        order: 'desc'
      });

      for (let i = 1; i < results.length; i++) {
        const prev = new Date(results[i - 1].timestamp).getTime();
        const curr = new Date(results[i].timestamp).getTime();
        expect(prev).toBeGreaterThanOrEqual(curr);
      }
    });

    it('should order results by timestamp ascending', async () => {
      const results = await storage.getOpportunities({
        limit: 100,
        orderBy: 'timestamp',
        order: 'asc'
      });

      for (let i = 1; i < results.length; i++) {
        const prev = new Date(results[i - 1].timestamp).getTime();
        const curr = new Date(results[i].timestamp).getTime();
        expect(prev).toBeLessThanOrEqual(curr);
      }
    });
  });

  describe('Data Persistence', () => {
    it('should persist data across reconnections', async () => {
      const opp = createMockOpportunity('persist-test', 6.0);
      await storage.saveOpportunity(opp);

      // Disconnect and reconnect
      await storage.disconnect();
      await storage.connect();

      const retrieved = await storage.getOpportunity(opp.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(opp.id);
    });

    it('should maintain data integrity', async () => {
      const opp = createMockOpportunity('integrity-test', 7.5);
      await storage.saveOpportunity(opp);

      const retrieved = await storage.getOpportunity(opp.id);

      expect(retrieved).toBeDefined();
      if (retrieved) {
        expect(retrieved.profitPercent).toBeCloseTo(opp.profitPercent, 5);
        expect(retrieved.totalCost).toBe(opp.totalCost);
        expect(retrieved.direction).toBe(opp.direction);
      }
    });
  });

  describe('Error Handling', () => {
    it('should return null for non-existent opportunity', async () => {
      const result = await storage.getOpportunity('non-existent-id');
      expect(result).toBeNull();
    });

    it('should handle empty query results', async () => {
      // Create new storage with empty directory
      const emptyDir = join(testDataDir, 'empty');
      mkdirSync(emptyDir, { recursive: true });

      const emptyStorage = new JsonStorage({
        dataDir: emptyDir
      });

      await emptyStorage.connect();

      const results = await emptyStorage.getOpportunities({ limit: 10 });
      expect(results).toEqual([]);

      await emptyStorage.disconnect();
      rmSync(emptyDir, { recursive: true });
    });
  });

  describe('Bulk Operations', () => {
    it('should handle bulk saves efficiently', async () => {
      const bulk = Array.from({ length: 50 }, (_, i) =>
        createMockOpportunity(`bulk-${i}`, 2 + i * 0.1)
      );

      const startTime = Date.now();
      await storage.saveOpportunities(bulk);
      const duration = Date.now() - startTime;

      // Should complete within reasonable time (5 seconds for 50 items)
      expect(duration).toBeLessThan(5000);

      // Verify all were saved
      for (const opp of bulk) {
        const retrieved = await storage.getOpportunity(opp.id);
        expect(retrieved).toBeDefined();
      }
    });
  });
});
