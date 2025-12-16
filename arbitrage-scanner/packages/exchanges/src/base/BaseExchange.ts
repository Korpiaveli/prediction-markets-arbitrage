import {
  IExchange,
  Market,
  Quote,
  ExchangeName,
  RateLimits,
  ExchangeConfig,
  PriceLevel,
  categoryDetector,
  OrderRequest,
  OrderResult,
  OrderStatus,
  Balance
} from '@arb/core';
import axios, { AxiosInstance } from 'axios';
import PQueue from 'p-queue';
import NodeCache from 'node-cache';

export abstract class BaseExchange implements IExchange {
  abstract readonly name: ExchangeName;
  abstract readonly apiUrl: string;
  readonly wsUrl?: string;
  readonly rateLimits?: RateLimits;

  protected client: AxiosInstance;
  protected queue: PQueue;
  protected cache: NodeCache;
  protected config: ExchangeConfig;
  protected connected: boolean = false;

  constructor(config: ExchangeConfig = {}) {
    this.config = config;

    // Initialize HTTP client (apiUrl will be set by subclass)
    this.client = axios.create({
      timeout: config.timeout || 30000,
      headers: this.getHeaders()
    });

    // Initialize rate limiter
    const limits = this.rateLimits || { requestsPerSecond: 10, requestsPerMinute: 100 };
    this.queue = new PQueue({
      concurrency: limits.requestsPerSecond,
      interval: 1000,
      intervalCap: limits.requestsPerSecond
    });

    // Initialize cache (5 second TTL by default)
    this.cache = new NodeCache({
      stdTTL: 5,
      checkperiod: 10
    });

    this.setupInterceptors();
  }

  protected setBaseURL(url: string): void {
    this.client.defaults.baseURL = url;
  }

  protected getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'ArbitrageScanner/1.0'
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    return headers;
  }

  protected setupInterceptors(): void {
    // Request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        console.log(`[${this.name}] Request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        console.error(`[${this.name}] Request error:`, error);
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 429) {
          // Rate limited, retry after delay
          const retryAfter = error.response.headers['retry-after'] || 5;
          console.log(`[${this.name}] Rate limited, retrying after ${retryAfter}s`);
          await this.delay(retryAfter * 1000);
          return this.client.request(error.config);
        }

        if (error.response?.status >= 500) {
          // Server error, retry with exponential backoff
          const attempt = error.config.__retryCount || 0;
          if (attempt < (this.config.retryAttempts || 3)) {
            error.config.__retryCount = attempt + 1;
            const delay = Math.pow(2, attempt) * 1000;
            console.log(`[${this.name}] Server error, retry ${attempt + 1} after ${delay}ms`);
            await this.delay(delay);
            return this.client.request(error.config);
          }
        }

        return Promise.reject(error);
      }
    );
  }

  async connect(): Promise<void> {
    this.connected = true;
    console.log(`[${this.name}] Connected`);
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.cache.flushAll();
    console.log(`[${this.name}] Disconnected`);
  }

  isConnected(): boolean {
    return this.connected;
  }

  // Abstract methods that must be implemented by subclasses
  abstract getMarkets(): Promise<Market[]>;
  abstract getMarket(marketId: string): Promise<Market | null>;
  abstract getQuote(marketId: string): Promise<Quote>;
  abstract placeOrder(order: OrderRequest): Promise<OrderResult>;
  abstract cancelOrder(orderId: string): Promise<void>;
  abstract getOrderStatus(orderId: string): Promise<OrderStatus>;
  abstract getAccountBalance(): Promise<Balance>;

  async getBulkQuotes(marketIds: string[]): Promise<Quote[]> {
    // Default implementation - can be overridden for batch endpoints
    const quotes = await Promise.all(
      marketIds.map(id => this.getQuote(id))
    );
    return quotes;
  }

  // Utility methods
  protected delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  protected getCacheKey(type: string, id?: string): string {
    return id ? `${this.name}:${type}:${id}` : `${this.name}:${type}`;
  }

  protected normalizePriceLevel(bid: number, ask: number): PriceLevel {
    return {
      bid,
      ask,
      mid: (bid + ask) / 2,
      liquidity: undefined
    };
  }

  protected normalizePrice(price: number): number {
    // Ensure price is between 0 and 1
    return Math.max(0, Math.min(1, price));
  }

  protected enhanceMarketWithCategories(market: Market): Market {
    const categories = categoryDetector.detectCategories(market.title, market.description, market.metadata);
    const primaryCategory = categoryDetector.getPrimaryCategory(categories);

    return {
      ...market,
      categories,
      primaryCategory
    };
  }
}