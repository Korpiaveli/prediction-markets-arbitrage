import { Market, Quote, ExchangeName } from '../types/market.js';

export interface IExchange {
  readonly name: ExchangeName;
  readonly apiUrl: string;
  readonly wsUrl?: string;
  readonly rateLimits?: RateLimits;

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  getMarkets(): Promise<Market[]>;
  getMarket(marketId: string): Promise<Market | null>;
  getQuote(marketId: string): Promise<Quote>;
  getBulkQuotes(marketIds: string[]): Promise<Quote[]>;

  subscribe?(marketId: string, callback: (quote: Quote) => void): void;
  unsubscribe?(marketId: string): void;
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