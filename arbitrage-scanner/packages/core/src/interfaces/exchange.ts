import { Market, Quote, ExchangeName, MarketCategory } from '../types/market.js';
import { OrderRequest, OrderResult, OrderStatus, Balance } from '../types/trading.js';

export interface GetMarketsOptions {
  maxMarkets?: number;
  keywords?: string[];
  categories?: MarketCategory[];
}

export interface IExchange {
  readonly name: ExchangeName;
  readonly apiUrl: string;
  readonly wsUrl?: string;
  readonly rateLimits?: RateLimits;

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  getMarkets(options?: GetMarketsOptions): Promise<Market[]>;
  getMarket(marketId: string): Promise<Market | null>;
  getQuote(marketId: string): Promise<Quote>;
  getBulkQuotes(marketIds: string[]): Promise<Quote[]>;

  subscribe?(marketId: string, callback: (quote: Quote) => void): void;
  unsubscribe?(marketId: string): void;

  placeOrder(order: OrderRequest): Promise<OrderResult>;
  cancelOrder(orderId: string): Promise<void>;
  getOrderStatus(orderId: string): Promise<OrderStatus>;
  getAccountBalance(): Promise<Balance>;
}

export interface RateLimits {
  requestsPerSecond: number;
  requestsPerMinute: number;
  burstLimit?: number;
}

export interface ExchangeConfig {
  apiKey?: string;
  apiSecret?: string;
  testMode?: boolean;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
}