import { ArbitrageOpportunity } from '../types/arbitrage.js';
import { MarketPair } from '../types/market.js';

export interface IStorage {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  saveOpportunity(opportunity: ArbitrageOpportunity): Promise<void>;
  saveOpportunities(opportunities: ArbitrageOpportunity[]): Promise<void>;

  getOpportunity(id: string): Promise<ArbitrageOpportunity | null>;
  getOpportunities(filter?: OpportunityFilter): Promise<ArbitrageOpportunity[]>;

  saveMarketPair(pair: MarketPair): Promise<void>;
  getMarketPairs(): Promise<MarketPair[]>;
  getMarketPair(id: string): Promise<MarketPair | null>;

  clear?(): Promise<void>;
}

export interface OpportunityFilter {
  fromDate?: Date;
  toDate?: Date;
  minProfit?: number;
  maxProfit?: number;
  exchange?: string;
  marketPairId?: string;
  limit?: number;
  offset?: number;
  orderBy?: 'timestamp' | 'profit' | 'confidence';
  order?: 'asc' | 'desc';
}