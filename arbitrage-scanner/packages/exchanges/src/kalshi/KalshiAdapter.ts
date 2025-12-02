import {
  Market,
  Quote,
  ExchangeName,
  RateLimits,
  ExchangeConfig
} from '@arb/core';
import { BaseExchange } from '../base/BaseExchange.js';

interface KalshiConfig extends ExchangeConfig {
  filterSports?: boolean;
  filterTypes?: string[];
}

interface KalshiMarketResponse {
  cursor?: string;
  markets: Array<{
    ticker: string;
    event_ticker: string;
    title: string;
    yes_sub_title?: string;
    no_sub_title?: string;
    close_time: string;
    expiration_time: string;
    status: string;
    market_type: string;

    // Prices in cents (1-99)
    yes_bid: number;
    yes_ask: number;
    no_bid: number;
    no_ask: number;

    // Prices in dollar format
    yes_bid_dollars: string;
    yes_ask_dollars: string;
    no_bid_dollars: string;
    no_ask_dollars: string;

    last_price: number;
    previous_price: number;
    volume: number;
    volume_24h: number;
    liquidity: number;
    liquidity_dollars: string;
    open_interest?: number;

    // Resolution criteria (often empty)
    rules_primary?: string;
    rules_secondary?: string;
    result?: string | null;
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

  private readonly filterSports: boolean;
  private readonly filterTypes: string[];

  constructor(config: KalshiConfig = {}) {
    super(config);
    this.setBaseURL(this.apiUrl);
    this.filterSports = config.filterSports ?? false; // Default: include ALL markets (sports, politics, etc.)
    this.filterTypes = config.filterTypes ?? ['kxmvementions', 'nflsinglegame', 'nflmultigame'];
  }

  async getMarkets(): Promise<Market[]> {
    const cacheKey = this.getCacheKey('markets');
    const cached = this.cache.get<Market[]>(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.queue.add(async () => {
        const { data } = await this.client.get<KalshiMarketResponse>('/markets', {
          params: { limit: 1000, status: 'open' }  // Increased limit to get more markets
        });
        return data;
      });

      if (!response || !response.markets) {
        return [];
      }

      // Apply filtering
      const markets = response.markets
        .filter((m) => {
          // Status filter
          if (m.status !== 'open' && m.status !== 'active') {
            return false;
          }

          // Only apply sports filtering if enabled
          if (!this.filterSports) {
            return true;
          }

          // Filter out pure NFL/sports prop bets (commentator mentions, player stats)
          const title = m.title.toLowerCase();
          const ticker = m.ticker.toLowerCase();

          // Exclude specific ticker types from filterTypes config
          for (const filterType of this.filterTypes) {
            if (ticker.includes(filterType)) {
              return false;
            }
          }

          // Exclude detailed player stat props
          if (/\d+\+/.test(title) || /yards|points scored|touchdowns|completions/i.test(title)) {
            return false;
          }

          return true;
        })
        .map((m) => this.transformMarket(m));

      const filterStatus = this.filterSports ? 'ON' : 'OFF';
      console.log(`[${this.name}] Filtered ${response.markets.length} → ${markets.length} markets (sports filter: ${filterStatus}, removed: ${response.markets.length - markets.length})`);

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
          parseFloat(response.yes_bid_dollars || '0'),
          parseFloat(response.yes_ask_dollars || '0')
        ),
        no: this.normalizePriceLevel(
          parseFloat(response.no_bid_dollars || '0'),
          parseFloat(response.no_ask_dollars || '0')
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
        const { data} = await this.client.get<KalshiOrderbookResponse>(
          `/markets/${marketId}/orderbook`
        );
        return data;
      });

      if (!response) {
        throw new Error('No orderbook data received');
      }

      return response;
    } catch (error) {
      console.error(`[${this.name}] Failed to fetch orderbook for ${marketId}:`, error);
      throw error;
    }
  }

  async getHistoricalTrades(marketId: string, options?: {
    limit?: number;
    cursor?: string;
    minTimestamp?: Date;
    maxTimestamp?: Date;
  }): Promise<{trades: any[], cursor?: string}> {
    try {
      const params: any = {
        ticker: marketId,
        limit: options?.limit || 100
      };

      if (options?.cursor) {
        params.cursor = options.cursor;
      }

      if (options?.minTimestamp) {
        params.min_ts = Math.floor(options.minTimestamp.getTime() / 1000);
      }

      if (options?.maxTimestamp) {
        params.max_ts = Math.floor(options.maxTimestamp.getTime() / 1000);
      }

      const response = await this.queue.add(async () => {
        const { data } = await this.client.get('/markets/trades', { params });
        return data;
      });

      return {
        trades: response.trades || [],
        cursor: response.cursor
      };
    } catch (error) {
      console.error(`[${this.name}] Failed to fetch historical trades for ${marketId}:`, error);
      throw error;
    }
  }

  private transformMarket(data: any): Market {
    return {
      id: data.ticker,
      exchangeId: data.ticker,
      exchange: this.name,
      title: data.title,
      description: data.yes_sub_title || data.title,
      closeTime: data.close_time ? new Date(data.close_time) : undefined,
      volume24h: data.volume_24h || data.volume,
      openInterest: data.open_interest,
      active: data.status === 'open' || data.status === 'active',
      metadata: {
        eventTicker: data.event_ticker,
        marketType: data.market_type,
        rulesPrimary: data.rules_primary || '',
        rulesSecondary: data.rules_secondary || '',
        liquidity: parseFloat(data.liquidity_dollars || '0')
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

// Import axios for error checking
import axios from 'axios';