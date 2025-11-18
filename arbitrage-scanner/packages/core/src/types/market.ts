export type ExchangeName = 'KALSHI' | 'POLYMARKET' | 'MOCK';
export type MarketOutcome = 'YES' | 'NO';
export type ArbitrageDirection = 'KALSHI_YES_POLY_NO' | 'KALSHI_NO_POLY_YES';

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

export interface QuotePair {
  kalshi: Quote;
  polymarket: Quote;
  timestamp: Date;
}