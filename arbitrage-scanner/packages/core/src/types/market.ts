export type ExchangeName = 'KALSHI' | 'POLYMARKET' | 'PREDICTIT' | 'MANIFOLD' | 'MOCK';
export type MarketOutcome = 'YES' | 'NO';

export type ArbitrageDirection =
  | 'EXCHANGE1_YES_EXCHANGE2_NO'
  | 'EXCHANGE1_NO_EXCHANGE2_YES'
  | 'KALSHI_YES_POLY_NO'      // Legacy - deprecated
  | 'KALSHI_NO_POLY_YES';     // Legacy - deprecated

export type MarketCategory = 'politics' | 'sports' | 'crypto' | 'economy' | 'technology' | 'entertainment' | 'science' | 'other';

export interface Market {
  id: string;
  exchangeId: string;
  exchange: ExchangeName;
  title: string;
  description: string;
  closeTime?: Date;
  volume24h?: number;
  openInterest?: number;
  active: boolean;
  categories?: MarketCategory[];
  primaryCategory?: MarketCategory;
  metadata?: Record<string, any>; // Exchange-specific data (resolution criteria, fees, etc.)
}

export interface Quote {
  marketId: string;
  exchange: ExchangeName;
  timestamp: Date;
  yes: PriceLevel;
  no: PriceLevel;
  lastUpdate: Date;
}

export interface PriceLevel {
  bid: number;
  ask: number;
  mid: number;
  liquidity?: number;
}

export interface CrossExchangePair {
  id: string;
  description: string;
  exchange1: ExchangeName;
  exchange2: ExchangeName;
  exchangePair: string;
  market1: Market;
  market2: Market;
  market1Id: string;
  market2Id: string;
  correlationScore?: number;
  lastChecked?: Date;
}

export interface CrossExchangeQuotePair {
  exchange1: ExchangeName;
  exchange2: ExchangeName;
  quote1: Quote;
  quote2: Quote;
  timestamp: Date;
}

/** @deprecated Use CrossExchangePair instead. Kept for backward compatibility. */
export interface MarketPair {
  id: string;
  description: string;
  kalshiMarket: Market;
  polymarketMarket: Market;
  kalshiId: string;
  polymarketId: string;
  correlationScore?: number;
  lastChecked?: Date;
}

/** @deprecated Use CrossExchangeQuotePair instead. Kept for backward compatibility. */
export interface QuotePair {
  kalshi: Quote;
  polymarket: Quote;
  timestamp: Date;
}

export interface PriceHistory {
  timestamp: Date;
  price: number;
}

export interface HistoricalSnapshot {
  timestamp: Date;
  marketPairId: string;
  exchange1: {
    marketId: string;
    yesPrice: number;
    noPrice: number;
    volume?: number;
  };
  exchange2: {
    marketId: string;
    yesPrice: number;
    noPrice: number;
    volume?: number;
  };
  arbitrage: {
    exists: boolean;
    profitPercent: number;
    direction: ArbitrageDirection;
    totalCost: number;
  };
}

export interface HistoricalResolution {
  marketPairId: string;
  resolvedAt: Date;
  exchange1: {
    outcome: MarketOutcome;
    result: string;
  };
  exchange2: {
    outcome: MarketOutcome;
    result: string;
  };
  sameOutcome: boolean;
}