import {
  Market,
  Quote,
  ExchangeName,
  RateLimits,
  ExchangeConfig
} from '@arb/core';
import { BaseExchange } from '../base/BaseExchange.js';

interface KalshiMarketResponse {
  markets: Array<{
    ticker: string;
    title: string;
    subtitle: string;
    close_time: string;
    status: string;
    yes_bid: number;
    yes_ask: number;
    no_bid: number;
    no_ask: number;
    volume_24h: number;
    open_interest: number;
    last_price: number;
    previous_yes_bid: number;
    previous_yes_ask: number;
    previous_no_bid: number;
    previous_no_ask: number;
  }>;
}

interface KalshiOrderbookResponse {
  orderbook: {
    yes: Array<[number, number]>; // [price, size]
    no: Array<[number, number]>;
  };
  market_ticker: string;
  timestamp: string;
}

export class KalshiAdapter extends BaseExchange {
  readonly name: ExchangeName = 'KALSHI';
  readonly apiUrl = 'https://api.elections.kalshi.com/trade-api/v2';
  readonly wsUrl = 'wss://api.elections.kalshi.com/trade-api/ws/v2';
  readonly rateLimits: RateLimits = {
    requestsPerSecond: 10,
    requestsPerMinute: 200,
    burstLimit: 20
  };

  constructor(config: ExchangeConfig = {}) {
    super(config);
  }

  async getMarkets(): Promise<Market[]> {
    const cacheKey = this.getCacheKey('markets');
    const cached = this.cache.get<Market[]>(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.queue.add(async () => {
        const { data } = await this.client.get<KalshiMarketResponse>('/markets', {
          params: { limit: 200, status: 'active' }
        });
        return data;
      });

      const markets = response.markets
        .filter(m => m.status === 'active')
        .map(m => this.transformMarket(m));

      this.cache.set(cacheKey, markets, 30); // Cache for 30 seconds
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
        const { data } = await this.client.get(`/markets/${marketId}`);
        return data;
      });

      const market = this.transformMarket(response);
      this.cache.set(cacheKey, market, 10);
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
      // For production, we'd fetch the full orderbook
      // For now, using market data endpoint
      const response = await this.queue.add(async () => {
        const { data } = await this.client.get(`/markets/${marketId}`);
        return data;
      });

      const quote: Quote = {
        marketId,
        exchange: this.name,
        timestamp: new Date(),
        yes: this.normalizePriceLevel(
          response.yes_bid / 100,
          response.yes_ask / 100
        ),
        no: this.normalizePriceLevel(
          response.no_bid / 100,
          response.no_ask / 100
        ),
        lastUpdate: new Date()
      };

      this.cache.set(cacheKey, quote, 2); // Short cache for quotes
      return quote;
    } catch (error) {
      console.error(`[${this.name}] Failed to fetch quote for ${marketId}:`, error);
      throw error;
    }
  }

  async getOrderbook(marketId: string): Promise<KalshiOrderbookResponse> {
    try {
      const response = await this.queue.add(async () => {
        const { data } = await this.client.get<KalshiOrderbookResponse>(
          `/markets/${marketId}/orderbook`
        );
        return data;
      });

      return response;
    } catch (error) {
      console.error(`[${this.name}] Failed to fetch orderbook for ${marketId}:`, error);
      throw error;
    }
  }

  private transformMarket(data: any): Market {
    return {
      id: data.ticker,
      exchangeId: data.ticker,
      exchange: this.name,
      title: data.title,
      description: data.subtitle || data.title,
      closeTime: data.close_time ? new Date(data.close_time) : undefined,
      volume24h: data.volume_24h,
      openInterest: data.open_interest,
      active: data.status === 'active'
    };
  }

  // WebSocket subscription for real-time updates
  subscribe(marketId: string, callback: (quote: Quote) => void): void {
    // TODO: Implement WebSocket subscription
    console.log(`[${this.name}] WebSocket subscription not yet implemented`);
  }

  unsubscribe(marketId: string): void {
    // TODO: Implement WebSocket unsubscription
    console.log(`[${this.name}] WebSocket unsubscription not yet implemented`);
  }
}

// Import axios for error checking
import axios from 'axios';