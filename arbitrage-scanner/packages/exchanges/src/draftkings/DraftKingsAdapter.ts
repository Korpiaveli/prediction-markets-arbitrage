import {
  Market,
  Quote,
  ExchangeName,
  RateLimits,
  OrderRequest,
  OrderResult,
  OrderStatus,
  Balance
} from '@arb/core';
import { BaseExchange, GetMarketsOptions } from '../base/BaseExchange.js';
import { DraftKingsConfig, DraftKingsMarket, DraftKingsMarketsResponse } from './types.js';

export class DraftKingsAdapter extends BaseExchange {
  readonly name: ExchangeName = 'DRAFTKINGS';
  readonly apiUrl = 'https://api.draftkings.com/predictions/v1';
  readonly wsUrl = 'wss://api.draftkings.com/predictions/ws/v1';
  readonly rateLimits: RateLimits = {
    requestsPerSecond: 10,
    requestsPerMinute: 200,
    burstLimit: 20
  };

  private apiAvailable: boolean = false;

  constructor(config: DraftKingsConfig = {}) {
    super({ ...config, timeout: config.timeout || 30000 });
    this.setBaseURL(this.apiUrl);
  }

  async connect(): Promise<void> {
    try {
      const response = await this.client.get('/health');
      this.apiAvailable = response.status === 200;
      this.connected = true;
      console.log(`[${this.name}] Connected - API ${this.apiAvailable ? 'available' : 'not yet available'}`);
    } catch (error) {
      this.apiAvailable = false;
      this.connected = true;
      console.log(`[${this.name}] Connected (API not yet public - expected Q1 2026)`);
    }
  }

  async getMarkets(options?: GetMarketsOptions): Promise<Market[]> {
    if (!this.apiAvailable) {
      console.log(`[${this.name}] API not yet available - DraftKings Predictions launched Dec 19, 2025`);
      console.log(`[${this.name}] Public API expected Q1 2026. Returning empty market list.`);
      return [];
    }

    const cacheKey = this.getCacheKey('markets', options ? JSON.stringify(options) : undefined);
    const cached = this.cache.get<Market[]>(cacheKey);
    if (cached) return cached;

    try {
      const markets: Market[] = [];
      let cursor: string | undefined;
      let totalFetched = 0;
      const maxMarkets = options?.maxMarkets || 500;

      do {
        const response = await this.queue.add(() =>
          this.client.get<DraftKingsMarketsResponse>('/markets', {
            params: {
              status: 'open',
              limit: Math.min(100, maxMarkets - totalFetched),
              cursor
            }
          })
        );

        if (!response?.data?.markets) break;

        for (const dkMarket of response.data.markets) {
          const market = this.transformMarket(dkMarket);
          if (this.shouldIncludeMarket(market, options)) {
            markets.push(market);
          }
        }

        cursor = response.data.cursor;
        totalFetched += response.data.markets.length;
      } while (cursor && totalFetched < maxMarkets);

      this.cache.set(cacheKey, markets);
      return markets;
    } catch (error) {
      console.error(`[${this.name}] Failed to fetch markets:`, error);
      return [];
    }
  }

  async getMarket(marketId: string): Promise<Market | null> {
    if (!this.apiAvailable) return null;

    const cacheKey = this.getCacheKey('market', marketId);
    const cached = this.cache.get<Market>(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.queue.add(() =>
        this.client.get<{ market: DraftKingsMarket }>(`/markets/${marketId}`)
      );

      if (!response?.data?.market) return null;

      const market = this.transformMarket(response.data.market);
      this.cache.set(cacheKey, market);
      return market;
    } catch (error) {
      console.error(`[${this.name}] Failed to fetch market ${marketId}:`, error);
      return null;
    }
  }

  async getQuote(marketId: string): Promise<Quote> {
    if (!this.apiAvailable) {
      return this.getEmptyQuote(marketId);
    }

    const cacheKey = this.getCacheKey('quote', marketId);
    const cached = this.cache.get<Quote>(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.queue.add(() =>
        this.client.get(`/markets/${marketId}/quote`)
      );

      const data = response?.data;
      const yesOutcome = data?.outcomes?.find((o: { name: string }) => o.name === 'Yes');
      const noOutcome = data?.outcomes?.find((o: { name: string }) => o.name === 'No');

      const quote: Quote = {
        marketId,
        exchange: this.name,
        timestamp: new Date(),
        yes: this.normalizePriceLevel(
          yesOutcome?.bid || 0,
          yesOutcome?.ask || 0
        ),
        no: this.normalizePriceLevel(
          noOutcome?.bid || 0,
          noOutcome?.ask || 0
        ),
        lastUpdate: new Date(data?.timestamp || Date.now())
      };

      this.cache.set(cacheKey, quote);
      return quote;
    } catch (error) {
      console.error(`[${this.name}] Failed to fetch quote for ${marketId}:`, error);
      return this.getEmptyQuote(marketId);
    }
  }

  async placeOrder(order: OrderRequest): Promise<OrderResult> {
    if (!this.apiAvailable) {
      return {
        orderId: '',
        status: 'rejected',
        filledSize: 0,
        filledPrice: 0,
        timestamp: new Date()
      };
    }

    try {
      const response = await this.queue.add(() =>
        this.client.post('/orders', {
          marketId: order.marketId,
          side: order.side,
          size: order.size,
          price: order.price,
          type: order.type
        })
      );

      return {
        orderId: response?.data?.orderId || '',
        status: response?.data?.status || 'pending',
        filledSize: response?.data?.filledSize || 0,
        filledPrice: response?.data?.filledPrice || 0,
        timestamp: new Date()
      };
    } catch (error: any) {
      return {
        orderId: '',
        status: 'rejected',
        filledSize: 0,
        filledPrice: 0,
        timestamp: new Date()
      };
    }
  }

  async cancelOrder(orderId: string): Promise<void> {
    if (!this.apiAvailable) {
      throw new Error('DraftKings Predictions API not yet available');
    }

    await this.queue.add(() =>
      this.client.delete(`/orders/${orderId}`)
    );
  }

  async getOrderStatus(orderId: string): Promise<OrderStatus> {
    if (!this.apiAvailable) {
      return {
        orderId,
        status: 'cancelled',
        filledSize: 0,
        remainingSize: 0,
        averagePrice: 0,
        lastUpdate: new Date()
      };
    }

    try {
      const response = await this.queue.add(() =>
        this.client.get(`/orders/${orderId}`)
      );

      return {
        orderId,
        status: response?.data?.status || 'pending',
        filledSize: response?.data?.filledSize || 0,
        remainingSize: response?.data?.remainingSize || 0,
        averagePrice: response?.data?.averagePrice || 0,
        lastUpdate: new Date()
      };
    } catch (error) {
      return {
        orderId,
        status: 'cancelled',
        filledSize: 0,
        remainingSize: 0,
        averagePrice: 0,
        lastUpdate: new Date()
      };
    }
  }

  async getAccountBalance(): Promise<Balance> {
    if (!this.apiAvailable) {
      return {
        available: 0,
        allocated: 0,
        total: 0,
        currency: 'USD'
      };
    }

    try {
      const response = await this.queue.add(() =>
        this.client.get('/account/balance')
      );

      return {
        available: response?.data?.available || 0,
        allocated: response?.data?.allocated || 0,
        total: response?.data?.total || 0,
        currency: 'USD'
      };
    } catch (error) {
      return {
        available: 0,
        allocated: 0,
        total: 0,
        currency: 'USD'
      };
    }
  }

  isApiAvailable(): boolean {
    return this.apiAvailable;
  }

  private transformMarket(dkMarket: DraftKingsMarket): Market {
    const yesOutcome = dkMarket.outcomes?.find(o => o.name === 'Yes');
    const noOutcome = dkMarket.outcomes?.find(o => o.name === 'No');

    const market: Market = {
      id: dkMarket.id,
      exchangeId: dkMarket.id,
      exchange: this.name,
      title: dkMarket.question,
      description: dkMarket.description || '',
      closeTime: dkMarket.closeTime ? new Date(dkMarket.closeTime) : undefined,
      volume24h: dkMarket.volume24h,
      openInterest: undefined,
      active: dkMarket.status === 'open',
      metadata: {
        eventId: dkMarket.eventId,
        category: dkMarket.category,
        tags: dkMarket.tags,
        rules: dkMarket.rules
      },
      priceSnapshot: yesOutcome && noOutcome ? {
        yesAsk: this.normalizePrice(yesOutcome.askPrice || yesOutcome.price),
        yesBid: this.normalizePrice(yesOutcome.bidPrice || yesOutcome.price),
        noAsk: this.normalizePrice(noOutcome.askPrice || noOutcome.price),
        noBid: this.normalizePrice(noOutcome.bidPrice || noOutcome.price),
        timestamp: new Date()
      } : undefined
    };

    return this.enhanceMarketWithCategories(market);
  }

  private getEmptyQuote(marketId: string): Quote {
    return {
      marketId,
      exchange: this.name,
      timestamp: new Date(),
      yes: { bid: 0, ask: 0, mid: 0 },
      no: { bid: 0, ask: 0, mid: 0 },
      lastUpdate: new Date()
    };
  }
}
