import {
  Market,
  Quote,
  ExchangeName,
  RateLimits,
  ExchangeConfig
} from '@arb/core';
import { BaseExchange } from '../base/BaseExchange.js';

interface PredictItContract {
  id: number;
  dateEnd: string;
  name: string;
  shortName: string;
  status: string;
  lastTradePrice: number;
  bestBuyYesCost: number | null;
  bestBuyNoCost: number | null;
  bestSellYesCost: number | null;
  bestSellNoCost: number | null;
  lastClosePrice: number;
  displayOrder: number;
}

interface PredictItMarket {
  id: number;
  name: string;
  shortName: string;
  image: string;
  url: string;
  contracts: PredictItContract[];
  timeStamp: string;
  status: string;
}

interface PredictItResponse {
  markets: PredictItMarket[];
}

export class PredictItAdapter extends BaseExchange {
  readonly name: ExchangeName = 'PREDICTIT';
  readonly apiUrl = 'https://www.predictit.org/api';
  readonly rateLimits: RateLimits = {
    requestsPerSecond: 5,
    requestsPerMinute: 60,
    burstLimit: 10
  };

  constructor(config: ExchangeConfig = {}) {
    super(config);
    this.setBaseURL(this.apiUrl);
  }

  async getMarkets(): Promise<Market[]> {
    const cacheKey = this.getCacheKey('markets');
    const cached = this.cache.get<Market[]>(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.queue.add(async () => {
        const { data } = await this.client.get<PredictItResponse>('/marketdata/all');
        return data;
      }) as PredictItResponse;

      // Filter and transform markets
      const markets = response.markets
        .filter((m: PredictItMarket) => m.status === 'Open' && m.contracts.length > 0)
        .flatMap((m: PredictItMarket) => this.transformMarket(m))
        .filter((m: Market | null): m is Market => m !== null);

      console.log(`[${this.name}] Fetched ${response.markets.length} markets → ${markets.length} active contracts`);

      this.cache.set(cacheKey, markets, 60); // Cache for 1 minute
      return markets;
    } catch (error) {
      console.error(`[${this.name}] Failed to fetch markets:`, error);
      throw error;
    }
  }

  async getMarket(marketId: string): Promise<Market | null> {
    // PredictIt doesn't have a single market endpoint, fetch all and filter
    const markets = await this.getMarkets();
    return markets.find(m => m.id === marketId) || null;
  }

  async getQuote(marketId: string): Promise<Quote> {
    const cacheKey = this.getCacheKey('quote', marketId);
    const cached = this.cache.get<Quote>(cacheKey);
    if (cached) return cached;

    try {
      const market = await this.getMarket(marketId);
      if (!market) {
        throw new Error(`Market ${marketId} not found`);
      }

      // Extract pricing from metadata
      const bestBuyYes = market.metadata?.bestBuyYesCost ?? 0.5;
      const bestSellYes = market.metadata?.bestSellYesCost ?? 0.5;
      const bestBuyNo = market.metadata?.bestBuyNoCost ?? 0.5;
      const bestSellNo = market.metadata?.bestSellNoCost ?? 0.5;

      const quote: Quote = {
        marketId,
        exchange: this.name,
        timestamp: new Date(),
        yes: {
          bid: this.normalizePrice(bestSellYes), // Sell = what you get when selling YES
          ask: this.normalizePrice(bestBuyYes),  // Buy = what you pay to buy YES
          mid: this.normalizePrice((bestBuyYes + bestSellYes) / 2),
          liquidity: 0 // PredictIt doesn't expose liquidity
        },
        no: {
          bid: this.normalizePrice(bestSellNo),
          ask: this.normalizePrice(bestBuyNo),
          mid: this.normalizePrice((bestBuyNo + bestSellNo) / 2),
          liquidity: 0
        },
        lastUpdate: new Date()
      };

      this.cache.set(cacheKey, quote, 10);
      return quote;
    } catch (error) {
      console.error(`[${this.name}] Failed to fetch quote for ${marketId}:`, error);
      throw error;
    }
  }

  /**
   * Transform PredictIt market to common Market interface
   * Note: PredictIt uses multi-contract markets, we create one Market per contract
   */
  private transformMarket(data: PredictItMarket): Market[] {
    // For binary-like contracts, we can use them directly
    // For multi-outcome markets, we'll create one market per contract

    if (data.contracts.length === 1) {
      // Single contract (binary market)
      const market = this.transformContract(data, data.contracts[0]);
      return market ? [market] : [];
    } else {
      // Multi-outcome market - create separate markets for each contract
      // This allows matching with binary markets on other exchanges
      return data.contracts
        .filter((c: PredictItContract) => c.status === 'Open')
        .map((contract: PredictItContract) => this.transformContract(data, contract))
        .filter((m: Market | null): m is Market => m !== null);
    }
  }

  private transformContract(market: PredictItMarket, contract: PredictItContract): Market | null {
    // Skip contracts with missing price data
    if (contract.bestBuyYesCost === null && contract.bestSellYesCost === null) {
      return null;
    }

    // Parse end date if available
    let closeTime: Date | undefined;
    if (contract.dateEnd && contract.dateEnd !== 'NA') {
      closeTime = new Date(contract.dateEnd);
      // Skip expired contracts
      if (closeTime < new Date()) {
        return null;
      }
    }

    // For multi-contract markets, include the contract option in the title
    const title = market.contracts.length > 1
      ? `${market.shortName}: ${contract.shortName}`
      : market.shortName;

    return {
      id: `${market.id}-${contract.id}`,
      exchangeId: `${market.id}-${contract.id}`,
      exchange: this.name,
      title,
      description: market.name,
      closeTime,
      volume24h: 0, // PredictIt doesn't expose volume in this endpoint
      openInterest: 0,
      active: contract.status === 'Open' && market.status === 'Open',
      metadata: {
        marketId: market.id,
        contractId: contract.id,
        marketUrl: market.url,
        imageUrl: market.image,
        lastTradePrice: contract.lastTradePrice,
        bestBuyYesCost: contract.bestBuyYesCost,
        bestSellYesCost: contract.bestSellYesCost,
        bestBuyNoCost: contract.bestBuyNoCost,
        bestSellNoCost: contract.bestSellNoCost,
        lastClosePrice: contract.lastClosePrice,
        category: this.extractCategory(market.name)
      }
    };
  }

  private extractCategory(text: string): string {
    const lowerText = text.toLowerCase();

    if (/president|election|senate|congress|house|democrat|republican|political|vote/.test(lowerText)) {
      return 'politics';
    }
    if (/supreme court|scotus|justice/.test(lowerText)) {
      return 'law';
    }
    if (/market|stock|economy|unemployment|gdp/.test(lowerText)) {
      return 'economy';
    }
    if (/war|military|conflict|ukraine|russia|china/.test(lowerText)) {
      return 'geopolitics';
    }

    return 'other';
  }

  subscribe(_marketId: string, _callback: (quote: Quote) => void): void {
    console.log(`[${this.name}] WebSocket subscription not supported`);
  }

  unsubscribe(_marketId: string): void {
    console.log(`[${this.name}] WebSocket unsubscription not supported`);
  }
}
