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
  PositionType,
  EventType,
  PoliticalParty
} from '@arb/core';
import { BaseExchange, GetMarketsOptions } from '../base/BaseExchange.js';

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
    this.setBaseURL(this.apiUrl);
  }

  async getMarkets(options?: GetMarketsOptions): Promise<Market[]> {
    const cacheKey = this.getCacheKey('markets', options ? JSON.stringify(options) : undefined);
    const cached = this.cache.get<Market[]>(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.queue.add(async () => {
        const { data } = await this.client.get<PredictItResponse>('/marketdata/all');
        return data;
      }) as PredictItResponse;

      const maxMarkets = options?.maxMarkets || Infinity;
      const filteredMarkets: Market[] = [];

      for (const m of response.markets) {
        if (m.status !== 'Open' || m.contracts.length === 0) continue;

        const transformed = this.transformMarket(m);
        for (const market of transformed) {
          if (market && this.shouldIncludeMarket(market, options)) {
            filteredMarkets.push(market);
            if (filteredMarkets.length >= maxMarkets) break;
          }
        }
        if (filteredMarkets.length >= maxMarkets) break;
      }

      console.log(`[${this.name}] Fetched ${response.markets.length} markets → ${filteredMarkets.length} matching contracts`);

      this.cache.set(cacheKey, filteredMarkets, 60);
      return filteredMarkets;
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

  async placeOrder(order: OrderRequest): Promise<OrderResult> {
    if (!this.config.apiKey) {
      throw new Error('[PredictIt] API key required for trading');
    }

    try {
      const [_marketId, contractId] = order.marketId.split('-');

      const piOrder = {
        contractId: parseInt(contractId),
        side: order.side === 'YES' ? 'buy' : 'sell',
        quantity: Math.floor(order.size),
        price: Math.floor(order.price * 100),
        orderType: order.type === 'limit' ? 'LIMIT' : 'MARKET'
      };

      const response = await this.queue.add(async () => {
        const { data } = await this.client.post('/trade/order', piOrder);
        return data;
      });

      const orderResult: OrderResult = {
        orderId: response.orderId.toString(),
        status: this.mapPredictItStatus(response.status),
        filledSize: response.quantityFilled || 0,
        filledPrice: response.avgPrice ? response.avgPrice / 100 : order.price,
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
      throw new Error('[PredictIt] API key required for trading');
    }

    try {
      await this.queue.add(async () => {
        await this.client.delete(`/trade/order/${orderId}`);
      });
      console.log(`[${this.name}] Cancelled order ${orderId}`);
    } catch (error) {
      console.error(`[${this.name}] Failed to cancel order ${orderId}:`, error);
      throw error;
    }
  }

  async getOrderStatus(orderId: string): Promise<OrderStatus> {
    if (!this.config.apiKey) {
      throw new Error('[PredictIt] API key required for trading');
    }

    try {
      const response = await this.queue.add(async () => {
        const { data } = await this.client.get(`/trade/order/${orderId}`);
        return data;
      });

      const status: OrderStatus = {
        orderId: response.orderId.toString(),
        status: this.mapPredictItStatus(response.status),
        filledSize: response.quantityFilled || 0,
        remainingSize: response.quantity - (response.quantityFilled || 0),
        averagePrice: response.avgPrice ? response.avgPrice / 100 : 0,
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
      throw new Error('[PredictIt] API key required for trading');
    }

    try {
      const response = await this.queue.add(async () => {
        const { data } = await this.client.get('/profile/balance');
        return data;
      });

      const balance: Balance = {
        available: parseFloat(response.availableBalance) / 100,
        allocated: parseFloat(response.investedBalance || '0') / 100,
        total: parseFloat(response.totalBalance) / 100,
        currency: 'USD'
      };

      return balance;
    } catch (error) {
      console.error(`[${this.name}] Failed to get account balance:`, error);
      throw error;
    }
  }

  private mapPredictItStatus(status: string): 'pending' | 'filled' | 'partial' | 'cancelled' | 'rejected' {
    switch (status.toUpperCase()) {
      case 'OPEN':
      case 'PENDING':
        return 'pending';
      case 'FILLED':
      case 'EXECUTED':
        return 'filled';
      case 'PARTIALLY_FILLED':
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

    const marketId = `${market.id}-${contract.id}`;
    const fullText = `${title} ${market.name}`;

    // Parse structured fields inline
    const positionType = this.parsePositionType(fullText);
    const eventType = this.parseEventType(fullText);
    const year = this.parseYear(fullText);
    const party = this.parseParty(fullText);

    return {
      id: marketId,
      exchangeId: marketId,
      exchange: this.name,
      title,
      description: market.name,
      closeTime,
      volume24h: 0,
      openInterest: 0,
      active: contract.status === 'Open' && market.status === 'Open',
      positionType: positionType !== 'OTHER' ? positionType : undefined,
      eventType: eventType !== 'OTHER' ? eventType : undefined,
      year: year ?? undefined,
      party: party ?? undefined,
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
      },
      priceSnapshot: {
        yesAsk: contract.bestBuyYesCost ?? 0.5,
        yesBid: contract.bestSellYesCost ?? 0.5,
        noAsk: contract.bestBuyNoCost ?? 0.5,
        noBid: contract.bestSellNoCost ?? 0.5,
        timestamp: new Date()
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

  /**
   * PredictIt does NOT support historical data via API.
   * Historical prices must be downloaded as CSV files from the website.
   * API only provides live data (updated every 60 seconds).
   */
  getHistoricalTrades(_marketId: string, _options?: any): Promise<{trades: any[], cursor?: string}> {
    throw new Error('PredictIt does not support historical data via API. Download CSV files from predictit.org website.');
  }

  subscribe(_marketId: string, _callback: (quote: Quote) => void): void {
    console.log(`[${this.name}] WebSocket subscription not supported`);
  }

  unsubscribe(_marketId: string): void {
    console.log(`[${this.name}] WebSocket unsubscription not supported`);
  }
}
