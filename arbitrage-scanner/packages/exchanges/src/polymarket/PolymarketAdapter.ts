import {
  Market,
  Quote,
  ExchangeName,
  RateLimits,
  ExchangeConfig,
  OrderRequest,
  OrderResult,
  OrderStatus,
  Balance,
  PriceHistory,
  PositionType,
  EventType,
  PoliticalParty
} from '@arb/core';
import { BaseExchange, GetMarketsOptions } from '../base/BaseExchange.js';

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

  private readonly vpPatterns = [
    /vice[- ]?president/i,
    /vice[- ]?presidential/i,
    /\bvp\b(?:\s|$)/i,
    /running\s+mate/i
  ];

  private readonly presidentPatterns = [
    /\bpresident(?!.*vice)/i,
    /\bpresidential(?!.*vice)/i,
    /\bpotus\b/i
  ];

  constructor(config: ExchangeConfig = {}) {
    super(config);
    this.setBaseURL(this.apiUrl); // Keep CLOB for orderbook

    // Create separate client for data API
    this.dataClient = axios.create({
      baseURL: this.dataApiUrl,
      timeout: config.timeout || 30000
    });

    // Create Gamma API client for market discovery
    this.gammaClient = axios.create({
      baseURL: this.gammaApiUrl,
      timeout: config.timeout || 30000
    });
  }

  async getMarkets(options?: GetMarketsOptions): Promise<Market[]> {
    const cacheKey = this.getCacheKey('markets', options ? JSON.stringify(options) : undefined);
    const cached = this.cache.get<Market[]>(cacheKey);
    if (cached) return cached;

    try {
      const filteredMarkets: Market[] = [];
      const pageSize = 500;
      let offset = 0;
      let totalFetched = 0;
      const maxMarkets = options?.maxMarkets || 30000;
      const now = new Date();

      const hasFilters = options?.keywords?.length || options?.categories?.length;
      console.log(`[${this.name}] Fetching markets from Gamma API${hasFilters ? ' with pre-filtering' : ''}${options?.maxMarkets ? ` (limit: ${options.maxMarkets})` : ''}...`);

      let hasMore = true;
      while (hasMore) {
        const response = await this.queue.add(async () => {
          const { data } = await this.gammaClient.get('/events', {
            params: {
              closed: false,
              active: true,
              order: 'id',
              ascending: false,
              limit: pageSize,
              offset: offset
            }
          });
          return data;
        });

        const events = Array.isArray(response) ? response : [];
        totalFetched += events.length;

        for (const event of events) {
          if (!event.active || event.closed || event.archived) continue;
          if (event.end_date_iso) {
            const endDate = new Date(event.end_date_iso);
            if (endDate < now) continue;
          }

          const eventMarkets = event.markets || [];
          for (const m of eventMarkets) {
            const market = this.enhanceMarketWithCategories(this.transformGammaMarket(m, event));

            if (this.shouldIncludeMarket(market, options)) {
              filteredMarkets.push(market);
            }

            if (filteredMarkets.length >= maxMarkets) {
              console.log(`[${this.name}] Reached target of ${maxMarkets} matching markets`);
              break;
            }
          }

          if (filteredMarkets.length >= maxMarkets) break;
        }

        if (filteredMarkets.length >= maxMarkets) break;

        if (events.length < pageSize) {
          hasMore = false;
        } else {
          offset += pageSize;
          if (offset > 10000) {
            console.warn(`[${this.name}] Reached safety limit of 10000 events`);
            hasMore = false;
          }
        }
      }

      console.log(`[${this.name}] Fetched ${totalFetched} events, kept ${filteredMarkets.length} matching markets`);

      this.cache.set(cacheKey, filteredMarkets, 30);
      return filteredMarkets;
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
    const title = data.question || event?.title || '';
    const description = event?.description || data.description || data.question || '';
    const fullText = `${title} ${description}`;

    const positionType = this.parsePositionType(fullText);
    const eventType = this.parseEventType(fullText);
    const year = this.parseYear(fullText);
    const party = this.parseParty(fullText);

    return {
      id: data.condition_id,
      exchangeId: data.condition_id,
      exchange: this.name,
      title,
      description,
      closeTime: data.end_date_iso ? new Date(data.end_date_iso) : undefined,
      volume24h: data.volume || 0,
      openInterest: data.liquidity || 0,
      active: data.active && !data.closed && !data.archived,
      positionType: positionType !== 'OTHER' ? positionType : undefined,
      eventType: eventType !== 'OTHER' ? eventType : undefined,
      year: year ?? undefined,
      party: party ?? undefined,
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

  private parsePositionType(text: string): PositionType {
    const isVp = this.vpPatterns.some(p => p.test(text));
    if (isVp) return 'VICE_PRESIDENT';

    const isPresident = this.presidentPatterns.some(p => p.test(text));
    if (isPresident) return 'PRESIDENT';

    if (/\bsenate\b|\bsenator\b/i.test(text)) return 'SENATE';
    if (/\bhouse\b|\bcongress(?:man|woman|person)?\b/i.test(text)) return 'HOUSE';
    if (/\bgovernor\b/i.test(text)) return 'GOVERNOR';
    if (/\bmayor\b/i.test(text)) return 'MAYOR';

    return 'OTHER';
  }

  private parseEventType(text: string): EventType {
    if (/\bnomin/i.test(text)) return 'NOMINEE';
    if (/\bwin|winner|elect(?:ed|ion)\b/i.test(text)) return 'WINNER';
    if (/electoral\s+vote/i.test(text)) return 'ELECTORAL_VOTES';
    if (/popular\s+vote/i.test(text)) return 'POPULAR_VOTE';
    if (/approval|rating/i.test(text)) return 'APPROVAL_RATING';
    return 'OTHER';
  }

  private parseYear(text: string): number | null {
    const match = text.match(/\b(20[2-3]\d)\b/);
    return match ? parseInt(match[1], 10) : null;
  }

  private parseParty(text: string): PoliticalParty {
    if (/\brepublican|GOP\b/i.test(text)) return 'REPUBLICAN';
    if (/\bdemocrat(?:ic)?\b/i.test(text)) return 'DEMOCRAT';
    if (/\bindependent\b/i.test(text)) return 'INDEPENDENT';
    return null;
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

  async getHistoricalPrices(
    tokenId: string,
    startTs: number,
    endTs: number,
    fidelityMinutes: number = 5
  ): Promise<PriceHistory[]> {
    try {
      const response = await this.queue.add(async () => {
        const { data } = await this.client.get('/prices-history', {
          params: {
            market: tokenId,
            startTs,
            endTs,
            fidelity: fidelityMinutes
          }
        });
        return data;
      });

      if (!response?.history || !Array.isArray(response.history)) {
        console.warn(`[${this.name}] No historical data for token ${tokenId}`);
        return [];
      }

      return response.history.map((h: { t: number; p: number }) => ({
        timestamp: new Date(h.t * 1000),
        price: h.p
      }));
    } catch (error) {
      console.error(`[${this.name}] Failed to fetch historical prices for ${tokenId}:`, error);
      throw error;
    }
  }

  async getMarketResolution(marketId: string): Promise<{ resolved: boolean; outcome?: 'YES' | 'NO'; resolvedAt?: Date } | null> {
    try {
      const response = await this.queue.add(async () => {
        const { data } = await this.gammaClient.get(`/markets/${marketId}`);
        return data;
      });

      if (!response) return null;

      const tokens = response.tokens || [];
      const winnerToken = tokens.find((t: any) => t.winner === true);

      if (!winnerToken) {
        return { resolved: false };
      }

      return {
        resolved: true,
        outcome: winnerToken.outcome === 'Yes' ? 'YES' : 'NO',
        resolvedAt: response.end_date_iso ? new Date(response.end_date_iso) : undefined
      };
    } catch (error) {
      console.error(`[${this.name}] Failed to fetch resolution for ${marketId}:`, error);
      return null;
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