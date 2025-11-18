import {
  Market,
  Quote,
  ExchangeName,
  RateLimits,
  ExchangeConfig
} from '@arb/core';
import { BaseExchange } from '../base/BaseExchange.js';

interface PolymarketMarket {
  id: string;
  question: string;
  description: string;
  end_date_iso: string;
  market_slug: string;
  volume_num: number;
  liquidity_num: number;
  outcomes: string[];
  outcome_prices: number[];
  closed: boolean;
  accepting_orders: boolean;
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
  readonly apiUrl = 'https://clob.polymarket.com';
  readonly dataApiUrl = 'https://api.polymarket.com';
  readonly wsUrl = 'wss://ws.polymarket.com';
  readonly rateLimits: RateLimits = {
    requestsPerSecond: 20,
    requestsPerMinute: 300,
    burstLimit: 30
  };

  private dataClient: AxiosInstance;

  constructor(config: ExchangeConfig = {}) {
    super(config);
    this.setBaseURL(this.apiUrl);

    // Create separate client for data API
    this.dataClient = axios.create({
      baseURL: this.dataApiUrl,
      timeout: config.timeout || 5000
    });
  }

  async getMarkets(): Promise<Market[]> {
    const cacheKey = this.getCacheKey('markets');
    const cached = this.cache.get<Market[]>(cacheKey);
    if (cached) return cached;

    try {
      // Fetch from Polymarket's CLOB API
      const response = await this.queue.add(async () => {
        const { data } = await this.dataClient.get('/markets', {
          params: {
            closed: false,
            limit: 100
          }
        });
        return data;
      });

      const markets = response
        .filter((m: PolymarketMarket) => m.accepting_orders)
        .map((m: PolymarketMarket) => this.transformMarket(m));

      this.cache.set(cacheKey, markets, 30);
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
    return {
      id: data.id,
      exchangeId: data.id,
      exchange: this.name,
      title: data.question,
      description: data.description || data.question,
      closeTime: data.end_date_iso ? new Date(data.end_date_iso) : undefined,
      volume24h: data.volume_num,
      openInterest: data.liquidity_num,
      active: !data.closed && data.accepting_orders
    };
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