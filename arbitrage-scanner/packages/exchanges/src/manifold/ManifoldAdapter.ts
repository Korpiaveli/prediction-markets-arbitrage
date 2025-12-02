import {
  Market,
  Quote,
  ExchangeName,
  RateLimits,
  ExchangeConfig
} from '@arb/core';
import { BaseExchange } from '../base/BaseExchange.js';
import axios from 'axios';

interface ManifoldConfig extends ExchangeConfig {
  excludeResolved?: boolean;
  minVolume?: number;
}

interface ManifoldMarketResponse {
  id: string;
  creatorUsername: string;
  creatorName: string;
  createdTime: number;
  question: string;
  url: string;
  probability?: number;
  pool?: Record<string, number>;
  volume: number;
  isResolved: boolean;
  resolution?: string;
  resolutionTime?: number;
  description?: string;
  textDescription?: string;
  closeTime?: number;
  outcomeType?: string;
  mechanism?: string;
  volume7Days?: number;
  volume24Hours?: number;
}

interface ManifoldProbResponse {
  prob?: number;
  answerProbs?: Record<string, number>;
}

export class ManifoldAdapter extends BaseExchange {
  readonly name: ExchangeName = 'MANIFOLD' as ExchangeName;
  readonly apiUrl = 'https://api.manifold.markets/v0';
  readonly wsUrl = 'wss://api.manifold.markets/ws';
  readonly rateLimits: RateLimits = {
    requestsPerSecond: 5,
    requestsPerMinute: 100,
    burstLimit: 10
  };

  private readonly excludeResolved: boolean;
  private readonly minVolume: number;

  constructor(config: ManifoldConfig = {}) {
    super(config);
    this.setBaseURL(this.apiUrl);
    this.excludeResolved = config.excludeResolved ?? true;
    this.minVolume = config.minVolume ?? 0;
  }

  async getMarkets(): Promise<Market[]> {
    const cacheKey = this.getCacheKey('markets');
    const cached = this.cache.get<Market[]>(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.queue.add(async () => {
        const { data } = await this.client.get<ManifoldMarketResponse[]>('/markets', {
          params: {
            limit: 1000,
            sort: 'volume-24h'
          }
        });
        return data;
      });

      if (!response) {
        return [];
      }

      // Filter markets
      const markets = response
        .filter((m) => {
          // Filter out resolved markets if configured
          if (this.excludeResolved && m.isResolved) {
            return false;
          }

          // Only include binary markets for now
          if (m.outcomeType && m.outcomeType !== 'BINARY') {
            return false;
          }

          // Filter by minimum volume
          if (m.volume < this.minVolume) {
            return false;
          }

          // Must have probability
          if (m.probability === undefined) {
            return false;
          }

          return true;
        })
        .map((m) => this.enhanceMarketWithCategories(this.transformMarket(m)));

      console.log(`[${this.name}] Filtered ${response.length} → ${markets.length} markets (resolved: ${this.excludeResolved ? 'excluded' : 'included'}, minVolume: $${this.minVolume})`);

      this.cache.set(cacheKey, markets, 60); // Cache for 60 seconds
      return markets;
    } catch (error) {
      console.error(`[${this.name}] Failed to fetch markets:`, error);
      throw error;
    }
  }

  async getMarket(marketId: string): Promise<Market | null> {
    const cacheKey = this.getCacheKey('market', marketId);
    const cached = this.cache.get<Market>(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.queue.add(async () => {
        const { data } = await this.client.get<ManifoldMarketResponse>(`/market/${marketId}`);
        return data;
      });

      if (!response) {
        return null;
      }

      const market = this.enhanceMarketWithCategories(this.transformMarket(response));
      this.cache.set(cacheKey, market, 30);
      return market;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      console.error(`[${this.name}] Failed to fetch market ${marketId}:`, error);
      throw error;
    }
  }

  async getQuote(marketId: string): Promise<Quote> {
    const cacheKey = this.getCacheKey('quote', marketId);
    const cached = this.cache.get<Quote>(cacheKey);
    if (cached) return cached;

    try {
      // Fetch probability from the prob endpoint
      const probResponse = await this.queue.add(async () => {
        const { data } = await this.client.get<ManifoldProbResponse>(`/market/${marketId}/prob`);
        return data;
      });

      if (!probResponse || probResponse.prob === undefined) {
        throw new Error('No probability available for market');
      }

      const probability = probResponse.prob;

      // Manifold uses probability directly (0-1)
      // Convert to bid/ask with small spread (assume 1% spread)
      const spread = 0.01;
      const yesBid = Math.max(0, probability - spread / 2);
      const yesAsk = Math.min(1, probability + spread / 2);
      const noBid = Math.max(0, (1 - probability) - spread / 2);
      const noAsk = Math.min(1, (1 - probability) + spread / 2);

      const quote: Quote = {
        marketId,
        exchange: this.name,
        timestamp: new Date(),
        yes: this.normalizePriceLevel(yesBid, yesAsk),
        no: this.normalizePriceLevel(noBid, noAsk),
        lastUpdate: new Date()
      };

      this.cache.set(cacheKey, quote, 5); // Short cache for quotes
      return quote;
    } catch (error) {
      console.error(`[${this.name}] Failed to fetch quote for ${marketId}:`, error);
      throw error;
    }
  }

  private transformMarket(data: ManifoldMarketResponse): Market {
    return {
      id: data.id,
      exchangeId: data.id,
      exchange: this.name,
      title: data.question,
      description: data.textDescription || data.description || data.question,
      closeTime: data.closeTime ? new Date(data.closeTime) : undefined,
      volume24h: data.volume24Hours || data.volume,
      openInterest: undefined, // Manifold doesn't provide open interest
      active: !data.isResolved,
      metadata: {
        creator: data.creatorUsername,
        url: data.url,
        mechanism: data.mechanism || 'CPMM',
        outcomeType: data.outcomeType || 'BINARY',
        pool: data.pool,
        volume7Days: data.volume7Days,
        probability: data.probability
      }
    };
  }

  // WebSocket subscription for real-time updates
  subscribe(_marketId: string, _callback: (quote: Quote) => void): void {
    // TODO: Implement WebSocket subscription
    console.log(`[${this.name}] WebSocket subscription not yet implemented`);
  }

  unsubscribe(_marketId: string): void {
    // TODO: Implement WebSocket unsubscription
    console.log(`[${this.name}] WebSocket unsubscription not yet implemented`);
  }
}
