/**
 * Redis Cache Manager
 *
 * Provides caching layer for quotes, markets, and opportunities
 * to achieve sub-2-second detection times.
 */

import { createClient, RedisClientType } from 'redis';
import { CacheConfig } from '../types';
import { Quote, Market } from '@arb/core';

interface CacheConfigInternal {
  host: string;
  port: number;
  password?: string;
  ttl: {
    quotes: number;
    markets: number;
    opportunities: number;
  };
}

export class CacheManager {
  private client: RedisClientType | null = null;
  private connected = false;
  private readonly config: CacheConfigInternal;

  // Cache hit/miss tracking
  private hits = 0;
  private misses = 0;

  constructor(config: CacheConfig = {}) {
    this.config = {
      host: config.host || 'localhost',
      port: config.port || 6379,
      password: config.password,
      ttl: {
        quotes: config.ttl?.quotes || 5,        // 5 seconds
        markets: config.ttl?.markets || 60,     // 1 minute
        opportunities: config.ttl?.opportunities || 30  // 30 seconds
      }
    };
  }

  /**
   * Connect to Redis
   */
  async connect(): Promise<void> {
    if (this.connected) return;

    this.client = createClient({
      socket: {
        host: this.config.host,
        port: this.config.port
      },
      password: this.config.password
    });

    this.client.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    this.client.on('connect', () => {
      console.log('Redis connected');
    });

    this.client.on('disconnect', () => {
      console.log('Redis disconnected');
      this.connected = false;
    });

    await this.client.connect();
    this.connected = true;
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.connected = false;
    }
  }

  /**
   * Cache a quote
   */
  async cacheQuote(marketId: string, exchange: string, quote: Quote): Promise<void> {
    if (!this.client) throw new Error('Redis not connected');

    const key = `quote:${exchange}:${marketId}`;
    const value = JSON.stringify(quote);

    await this.client.setEx(key, this.config.ttl.quotes, value);
  }

  /**
   * Get cached quote
   */
  async getQuote(marketId: string, exchange: string): Promise<Quote | null> {
    if (!this.client) throw new Error('Redis not connected');

    const key = `quote:${exchange}:${marketId}`;
    const value = await this.client.get(key);

    if (value) {
      this.hits++;
      const quote = JSON.parse(value);
      // Reconstruct Date objects
      quote.timestamp = new Date(quote.timestamp);
      quote.lastUpdate = new Date(quote.lastUpdate);
      return quote;
    }

    this.misses++;
    return null;
  }

  /**
   * Cache a market
   */
  async cacheMarket(marketId: string, exchange: string, market: Market): Promise<void> {
    if (!this.client) throw new Error('Redis not connected');

    const key = `market:${exchange}:${marketId}`;
    const value = JSON.stringify(market);

    await this.client.setEx(key, this.config.ttl.markets, value);
  }

  /**
   * Get cached market
   */
  async getMarket(marketId: string, exchange: string): Promise<Market | null> {
    if (!this.client) throw new Error('Redis not connected');

    const key = `market:${exchange}:${marketId}`;
    const value = await this.client.get(key);

    if (value) {
      this.hits++;
      const market = JSON.parse(value);
      if (market.closeTime) {
        market.closeTime = new Date(market.closeTime);
      }
      return market;
    }

    this.misses++;
    return null;
  }

  /**
   * Cache an opportunity
   */
  async cacheOpportunity(opportunityId: string, opportunity: any): Promise<void> {
    if (!this.client) throw new Error('Redis not connected');

    const key = `opportunity:${opportunityId}`;
    const value = JSON.stringify(opportunity);

    await this.client.setEx(key, this.config.ttl.opportunities, value);
  }

  /**
   * Get cached opportunity
   */
  async getOpportunity(opportunityId: string): Promise<any | null> {
    if (!this.client) throw new Error('Redis not connected');

    const key = `opportunity:${opportunityId}`;
    const value = await this.client.get(key);

    if (value) {
      this.hits++;
      return JSON.parse(value);
    }

    this.misses++;
    return null;
  }

  /**
   * Store recent opportunities in a sorted set
   */
  async addOpportunityToRecent(opportunity: any): Promise<void> {
    if (!this.client) throw new Error('Redis not connected');

    const key = 'opportunities:recent';
    const score = opportunity.profitPercent || 0;
    const value = JSON.stringify(opportunity);

    // Add to sorted set (sorted by profit)
    await this.client.zAdd(key, { score, value });

    // Keep only top 100
    await this.client.zRemRangeByRank(key, 0, -101);

    // Set expiration on the set
    await this.client.expire(key, 3600); // 1 hour
  }

  /**
   * Get recent opportunities (sorted by profit)
   */
  async getRecentOpportunities(limit = 10): Promise<any[]> {
    if (!this.client) throw new Error('Redis not connected');

    const key = 'opportunities:recent';
    const values = await this.client.zRange(key, 0, limit - 1, { REV: true });

    return values.map(v => JSON.parse(v));
  }

  /**
   * Clear all cached data
   */
  async clearAll(): Promise<void> {
    if (!this.client) throw new Error('Redis not connected');
    await this.client.flushDb();
  }

  /**
   * Clear cached quotes
   */
  async clearQuotes(): Promise<void> {
    if (!this.client) throw new Error('Redis not connected');

    const keys = await this.client.keys('quote:*');
    if (keys.length > 0) {
      await this.client.del(keys);
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? (this.hits / total) * 100 : 0,
      total
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Batch cache quotes
   */
  async cacheQuoteBatch(quotes: Array<{ marketId: string; exchange: string; quote: Quote }>): Promise<void> {
    if (!this.client) throw new Error('Redis not connected');

    const pipeline = this.client.multi();

    for (const { marketId, exchange, quote } of quotes) {
      const key = `quote:${exchange}:${marketId}`;
      const value = JSON.stringify(quote);
      pipeline.setEx(key, this.config.ttl.quotes, value);
    }

    await pipeline.exec();
  }

  /**
   * Batch get quotes
   */
  async getQuoteBatch(requests: Array<{ marketId: string; exchange: string }>): Promise<(Quote | null)[]> {
    if (!this.client) throw new Error('Redis not connected');

    const keys = requests.map(r => `quote:${r.exchange}:${r.marketId}`);
    const values = await this.client.mGet(keys);

    return values.map(value => {
      if (value) {
        this.hits++;
        const quote = JSON.parse(value);
        quote.timestamp = new Date(quote.timestamp);
        quote.lastUpdate = new Date(quote.lastUpdate);
        return quote;
      }
      this.misses++;
      return null;
    });
  }
}
