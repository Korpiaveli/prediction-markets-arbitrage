import {
  Market,
  Quote,
  ExchangeName,
  RateLimits,
  ExchangeConfig,
  OrderRequest,
  OrderResult,
  OrderStatus,
  Balance
} from '@arb/core';
import { BaseExchange } from '../base/BaseExchange.js';

interface KalshiConfig extends ExchangeConfig {
  filterSports?: boolean;
  filterTypes?: string[];
}

interface KalshiMarket {
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
}

interface KalshiMarketResponse {
  cursor?: string;
  markets: KalshiMarket[];
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
    super({ ...config, timeout: config.timeout || 30000 }); // 30s timeout for pagination
    this.setBaseURL(this.apiUrl);
    this.filterSports = config.filterSports ?? false;
    this.filterTypes = config.filterTypes ?? ['kxmvementions', 'nflsinglegame', 'nflmultigame'];
  }

  async getMarkets(): Promise<Market[]> {
    const cacheKey = this.getCacheKey('markets');
    const cached = this.cache.get<Market[]>(cacheKey);
    if (cached) return cached;

    try {
      // Fetch ALL markets using cursor pagination (no limit)
      const allMarkets: KalshiMarket[] = [];
      let cursor: string | undefined;
      const pageSize = 1000; // Max per request

      console.log(`[${this.name}] Fetching all markets (no limit)...`);

      do {
        let retries = 0;
        const maxRetries = 3;
        let response: KalshiMarketResponse | undefined;

        while (retries < maxRetries) {
          try {
            const result = await this.queue.add(async () => {
              const params: any = { limit: pageSize, status: 'open' };
              if (cursor) params.cursor = cursor;
              const { data } = await this.client.get<KalshiMarketResponse>('/markets', { params });
              return data;
            });
            response = result as KalshiMarketResponse | undefined;
            break;
          } catch (err: any) {
            retries++;
            if (err.code === 'ECONNABORTED' && retries < maxRetries) {
              console.warn(`[${this.name}] Timeout, retry ${retries}/${maxRetries}...`);
              await new Promise(r => setTimeout(r, 2000 * retries));
            } else {
              throw err;
            }
          }
        }

        if (!response || !response.markets) {
          break;
        }

        allMarkets.push(...response.markets);
        cursor = response.cursor;

        if (allMarkets.length > 60000) {
          console.warn(`[${this.name}] Reached safety limit of 60000 markets`);
          break;
        }
      } while (cursor);

      console.log(`[${this.name}] Fetched ${allMarkets.length} total markets`);

      // Apply filtering
      const markets = allMarkets
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
        .map((m) => this.enhanceMarketWithCategories(this.transformMarket(m)));

      const filterStatus = this.filterSports ? 'ON' : 'OFF';
      console.log(`[${this.name}] Filtered to ${markets.length} markets (sports filter: ${filterStatus}, removed: ${allMarkets.length - markets.length})`);

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

  async placeOrder(order: OrderRequest): Promise<OrderResult> {
    if (!this.config.apiKey) {
      throw new Error('[Kalshi] API key required for trading');
    }

    try {
      const kalshiOrder = {
        ticker: order.marketId,
        action: order.type === 'limit' ? 'buy' : 'market',
        side: order.side.toLowerCase(),
        count: Math.floor(order.size),
        yes_price: order.side === 'YES' ? Math.floor(order.price * 100) : undefined,
        no_price: order.side === 'NO' ? Math.floor(order.price * 100) : undefined,
        type: order.type
      };

      const response = await this.queue.add(async () => {
        const { data } = await this.client.post('/portfolio/orders', kalshiOrder);
        return data;
      });

      const orderResult: OrderResult = {
        orderId: response.order_id,
        status: this.mapKalshiStatus(response.status),
        filledSize: response.queue_position === 0 ? order.size : 0,
        filledPrice: response.yes_price ? response.yes_price / 100 : response.no_price / 100,
        timestamp: new Date(response.created_time)
      };

      return orderResult;
    } catch (error) {
      console.error(`[${this.name}] Failed to place order:`, error);
      throw error;
    }
  }

  async cancelOrder(orderId: string): Promise<void> {
    if (!this.config.apiKey) {
      throw new Error('[Kalshi] API key required for trading');
    }

    try {
      await this.queue.add(async () => {
        await this.client.delete(`/portfolio/orders/${orderId}`);
      });
      console.log(`[${this.name}] Cancelled order ${orderId}`);
    } catch (error) {
      console.error(`[${this.name}] Failed to cancel order ${orderId}:`, error);
      throw error;
    }
  }

  async getOrderStatus(orderId: string): Promise<OrderStatus> {
    if (!this.config.apiKey) {
      throw new Error('[Kalshi] API key required for trading');
    }

    try {
      const response = await this.queue.add(async () => {
        const { data } = await this.client.get(`/portfolio/orders/${orderId}`);
        return data;
      });

      const status: OrderStatus = {
        orderId: response.order_id,
        status: this.mapKalshiStatus(response.status),
        filledSize: response.queue_position === 0 ? response.count : 0,
        remainingSize: response.queue_position > 0 ? response.count : 0,
        averagePrice: response.yes_price ? response.yes_price / 100 : response.no_price / 100,
        lastUpdate: new Date(response.last_update_time || response.created_time)
      };

      return status;
    } catch (error) {
      console.error(`[${this.name}] Failed to get order status for ${orderId}:`, error);
      throw error;
    }
  }

  async getAccountBalance(): Promise<Balance> {
    if (!this.config.apiKey) {
      throw new Error('[Kalshi] API key required for trading');
    }

    try {
      const response = await this.queue.add(async () => {
        const { data } = await this.client.get('/portfolio/balance');
        return data;
      });

      const balance: Balance = {
        available: parseFloat(response.balance) / 100,
        allocated: parseFloat(response.payout_pending || '0') / 100,
        total: parseFloat(response.balance) / 100 + parseFloat(response.payout_pending || '0') / 100,
        currency: 'USD'
      };

      return balance;
    } catch (error) {
      console.error(`[${this.name}] Failed to get account balance:`, error);
      throw error;
    }
  }

  private mapKalshiStatus(status: string): 'pending' | 'filled' | 'partial' | 'cancelled' | 'rejected' {
    switch (status.toLowerCase()) {
      case 'resting':
      case 'pending':
        return 'pending';
      case 'executed':
      case 'filled':
        return 'filled';
      case 'canceled':
      case 'cancelled':
        return 'cancelled';
      case 'rejected':
        return 'rejected';
      default:
        return 'pending';
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