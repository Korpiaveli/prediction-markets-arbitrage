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

interface PolymarketMarket {
  condition_id: string;
  question_id: string;
  question: string;
  description: string;
  market_slug: string;
  end_date_iso: string;
  game_start_time?: string;

  // Status
  active: boolean;
  closed: boolean;
  archived: boolean;
  accepting_orders: boolean;
  accepting_order_timestamp?: string;

  // Trading
  minimum_order_size: number;
  minimum_tick_size: number;
  enable_order_book: boolean;
  maker_base_fee: number;
  taker_base_fee: number;

  // Outcomes and prices
  tokens: Array<{
    token_id: string;
    outcome: string;
    price: number;
    winner: boolean;
  }>;

  // Resolution
  is_50_50_outcome?: boolean;
  seconds_delay?: number;

  // Metadata
  tags?: string[];
  icon?: string;
  image?: string;
}

interface PolymarketOrderbook {
  market: string;
  timestamp: string;
  bids: Array<{
    price: string;
    size: string;
  }>;
  asks: Array<{
    price: string;
    size: string;
  }>;
}

// Interface for future CLOB API integration
// interface PolymarketClob {
//   id: string;
//   condition_id: string;
//   question: string;
//   description: string;
//   tokens: Array<{
//     token_id: string;
//     outcome: string;
//     price: number;
//     winner: boolean;
//   }>;
// }

export class PolymarketAdapter extends BaseExchange {
  readonly name: ExchangeName = 'POLYMARKET';
  readonly apiUrl = 'https://clob.polymarket.com'; // CLOB API for orderbook/quotes
  readonly gammaApiUrl = 'https://gamma-api.polymarket.com'; // Gamma API for market discovery
  readonly dataApiUrl = 'https://api.polymarket.com';
  readonly wsUrl = 'wss://ws.polymarket.com';
  readonly rateLimits: RateLimits = {
    requestsPerSecond: 20,
    requestsPerMinute: 300,
    burstLimit: 30
  };

  private dataClient: AxiosInstance;
  private gammaClient: AxiosInstance;

  constructor(config: ExchangeConfig = {}) {
    super(config);
    this.setBaseURL(this.apiUrl); // Keep CLOB for orderbook

    // Create separate client for data API
    this.dataClient = axios.create({
      baseURL: this.dataApiUrl,
      timeout: config.timeout || 5000
    });

    // Create Gamma API client for market discovery
    this.gammaClient = axios.create({
      baseURL: this.gammaApiUrl,
      timeout: config.timeout || 5000
    });
  }

  async getMarkets(): Promise<Market[]> {
    const cacheKey = this.getCacheKey('markets');
    const cached = this.cache.get<Market[]>(cacheKey);
    if (cached) return cached;

    try {
      // Fetch from Gamma API (official market discovery endpoint)
      const response = await this.queue.add(async () => {
        const { data } = await this.gammaClient.get('/events', {
          params: {
            closed: false,
            active: true,
            order: 'id',
            ascending: false,
            limit: 100
          }
        });
        return data;
      });

      // Gamma API returns direct array
      const eventsArray = Array.isArray(response) ? response : [];

      if (!Array.isArray(eventsArray)) {
        console.warn(`[${this.name}] Unexpected Gamma API response format`);
        return [];
      }

      // Apply data quality filtering
      const now = new Date();

      const markets = eventsArray
        .filter((event: any) => {
          // Basic status checks
          if (!event.active || event.closed || event.archived) {
            return false;
          }

          // Date-based filtering: remove markets with past end dates
          if (event.end_date_iso) {
            const endDate = new Date(event.end_date_iso);
            if (endDate < now) {
              return false; // Event already closed/expired
            }
          }

          return true;
        })
        .flatMap((event: any) =>
          event.markets?.map((m: any) => this.transformGammaMarket(m, event)) || []
        );

      console.log(`[${this.name}] Fetched ${eventsArray.length} events → ${markets.length} active markets from Gamma API`);

      this.cache.set(cacheKey, markets, 30);
      return markets;
    } catch (error) {
      console.error(`[${this.name}] Failed to fetch markets from Gamma API:`, error);
      throw error;
    }
  }

  async getMarket(marketId: string): Promise<Market | null> {
    const cacheKey = this.getCacheKey('market', marketId);
    const cached = this.cache.get<Market>(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.queue.add(async () => {
        const { data } = await this.dataClient.get(`/markets/${marketId}`);
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
      // Fetch orderbook data from CLOB
      const [marketData, orderbook] = await Promise.all([
        this.fetchMarketData(marketId),
        this.fetchOrderbook(marketId)
      ]);

      const quote = this.buildQuoteFromOrderbook(marketId, orderbook, marketData);
      this.cache.set(cacheKey, quote, 2);
      return quote;
    } catch (error) {
      console.error(`[${this.name}] Failed to fetch quote for ${marketId}:`, error);
      throw error;
    }
  }

  private async fetchMarketData(marketId: string): Promise<any> {
    return this.queue.add(async () => {
      const { data } = await this.dataClient.get(`/markets/${marketId}`);
      return data;
    });
  }

  private async fetchOrderbook(marketId: string): Promise<PolymarketOrderbook> {
    return this.queue.add(async () => {
      const { data } = await this.client.get(`/orderbook`, {
        params: { market_id: marketId }
      });
      return data;
    });
  }

  private buildQuoteFromOrderbook(
    marketId: string,
    orderbook: PolymarketOrderbook,
    _marketData: any
  ): Quote {
    // Parse best bid/ask from orderbook
    const bestBid = orderbook.bids[0] ? parseFloat(orderbook.bids[0].price) : 0;
    const bestAsk = orderbook.asks[0] ? parseFloat(orderbook.asks[0].price) : 1;

    // For binary markets, NO price = 1 - YES price
    const yesBid = bestBid;
    const yesAsk = bestAsk;
    const noBid = 1 - yesAsk;
    const noAsk = 1 - yesBid;

    // Calculate liquidity
    const yesLiquidity = orderbook.bids.reduce((sum, bid) =>
      sum + parseFloat(bid.size), 0
    );
    const noLiquidity = orderbook.asks.reduce((sum, ask) =>
      sum + parseFloat(ask.size), 0
    );

    return {
      marketId,
      exchange: this.name,
      timestamp: new Date(),
      yes: {
        bid: this.normalizePrice(yesBid),
        ask: this.normalizePrice(yesAsk),
        mid: this.normalizePrice((yesBid + yesAsk) / 2),
        liquidity: yesLiquidity
      },
      no: {
        bid: this.normalizePrice(noBid),
        ask: this.normalizePrice(noAsk),
        mid: this.normalizePrice((noBid + noAsk) / 2),
        liquidity: noLiquidity
      },
      lastUpdate: new Date(orderbook.timestamp)
    };
  }

  private transformMarket(data: PolymarketMarket): Market {
    // Calculate volume from tokens if available
    const volume = data.tokens?.reduce((sum, t) => sum + (t.price || 0), 0) || 0;

    return {
      id: data.condition_id,
      exchangeId: data.condition_id,
      exchange: this.name,
      title: data.question,
      description: data.description || data.question,
      closeTime: data.end_date_iso ? new Date(data.end_date_iso) : undefined,
      volume24h: volume,
      openInterest: 0, // Not provided by CLOB API
      active: data.active && data.accepting_orders && !data.closed && !data.archived,
      metadata: {
        questionId: data.question_id,
        marketSlug: data.market_slug,
        resolutionRules: data.description || '',
        is_50_50_outcome: data.is_50_50_outcome || false,
        tokens: data.tokens?.map(t => ({
          tokenId: t.token_id,
          outcome: t.outcome,
          price: t.price
        })),
        tags: data.tags || [],
        minimumOrderSize: data.minimum_order_size,
        fees: {
          maker: data.maker_base_fee,
          taker: data.taker_base_fee
        }
      }
    };
  }

  // Transform Gamma API event/market response to Market interface
  private transformGammaMarket(data: any, event?: any): Market {
    return {
      id: data.condition_id,
      exchangeId: data.condition_id,
      exchange: this.name,
      title: data.question || event?.title,
      description: event?.description || data.description || data.question,
      closeTime: data.end_date_iso ? new Date(data.end_date_iso) : undefined,
      volume24h: data.volume || 0,
      openInterest: data.liquidity || 0,
      active: data.active && !data.closed && !data.archived,
      metadata: {
        questionId: data.question_id,
        marketSlug: data.market_slug,
        resolutionRules: data.description || event?.description || '',
        is_50_50_outcome: data.is_50_50_outcome || event?.is_50_50_outcome || false,
        tokens: data.tokens?.map((t: any) => ({
          tokenId: t.token_id,
          outcome: t.outcome,
          price: t.price
        })) || [],
        tags: event?.tags || data.tags || [],
        category: event?.category || data.category
      }
    };
  }

  async placeOrder(order: OrderRequest): Promise<OrderResult> {
    if (!this.config.apiKey) {
      throw new Error('[Polymarket] API key required for trading');
    }

    try {
      const polyOrder = {
        tokenID: order.marketId,
        side: order.side === 'YES' ? 'BUY' : 'SELL',
        amount: order.size,
        price: order.price,
        orderType: order.type.toUpperCase()
      };

      const response = await this.queue.add(async () => {
        const { data } = await this.client.post('/order', polyOrder);
        return data;
      });

      const orderResult: OrderResult = {
        orderId: response.orderID,
        status: this.mapPolymarketStatus(response.status),
        filledSize: response.matchedAmount || 0,
        filledPrice: response.avgPrice || order.price,
        timestamp: new Date(response.timestamp)
      };

      return orderResult;
    } catch (error) {
      console.error(`[${this.name}] Failed to place order:`, error);
      throw error;
    }
  }

  async cancelOrder(orderId: string): Promise<void> {
    if (!this.config.apiKey) {
      throw new Error('[Polymarket] API key required for trading');
    }

    try {
      await this.queue.add(async () => {
        await this.client.delete(`/order/${orderId}`);
      });
      console.log(`[${this.name}] Cancelled order ${orderId}`);
    } catch (error) {
      console.error(`[${this.name}] Failed to cancel order ${orderId}:`, error);
      throw error;
    }
  }

  async getOrderStatus(orderId: string): Promise<OrderStatus> {
    if (!this.config.apiKey) {
      throw new Error('[Polymarket] API key required for trading');
    }

    try {
      const response = await this.queue.add(async () => {
        const { data } = await this.client.get(`/order/${orderId}`);
        return data;
      });

      const status: OrderStatus = {
        orderId: response.orderID,
        status: this.mapPolymarketStatus(response.status),
        filledSize: response.matchedAmount || 0,
        remainingSize: response.amount - (response.matchedAmount || 0),
        averagePrice: response.avgPrice || 0,
        lastUpdate: new Date(response.lastUpdated || response.timestamp)
      };

      return status;
    } catch (error) {
      console.error(`[${this.name}] Failed to get order status for ${orderId}:`, error);
      throw error;
    }
  }

  async getAccountBalance(): Promise<Balance> {
    if (!this.config.apiKey) {
      throw new Error('[Polymarket] API key required for trading');
    }

    try {
      const response = await this.queue.add(async () => {
        const { data } = await this.client.get('/balance');
        return data;
      });

      const balance: Balance = {
        available: parseFloat(response.available) || 0,
        allocated: parseFloat(response.allocated) || 0,
        total: parseFloat(response.total) || 0,
        currency: 'USDC'
      };

      return balance;
    } catch (error) {
      console.error(`[${this.name}] Failed to get account balance:`, error);
      throw error;
    }
  }

  private mapPolymarketStatus(status: string): 'pending' | 'filled' | 'partial' | 'cancelled' | 'rejected' {
    switch (status.toUpperCase()) {
      case 'LIVE':
      case 'PENDING':
        return 'pending';
      case 'MATCHED':
      case 'FILLED':
        return 'filled';
      case 'PARTIAL':
      case 'PARTIALLY_MATCHED':
        return 'partial';
      case 'CANCELLED':
      case 'CANCELED':
        return 'cancelled';
      case 'REJECTED':
        return 'rejected';
      default:
        return 'pending';
    }
  }

  // WebSocket subscription for real-time updates
  subscribe(_marketId: string, _callback: (quote: Quote) => void): void {
    // TODO: Implement WebSocket subscription to Polymarket
    console.log(`[${this.name}] WebSocket subscription not yet implemented`);
  }

  unsubscribe(_marketId: string): void {
    // TODO: Implement WebSocket unsubscription
    console.log(`[${this.name}] WebSocket unsubscription not yet implemented`);
  }
}

// Import axios for error checking
import axios, { AxiosInstance } from 'axios';