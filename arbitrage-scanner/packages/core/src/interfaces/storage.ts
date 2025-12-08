import { ArbitrageOpportunity, CrossExchangeArbitrageOpportunity } from '../types/arbitrage.js';
import { MarketPair, CrossExchangePair } from '../types/market.js';

export type AnyArbitrageOpportunity = ArbitrageOpportunity | CrossExchangeArbitrageOpportunity;
export type AnyMarketPair = MarketPair | CrossExchangePair;

export interface PositionRecord {
  id: string;
  opportunityId?: string;
  exchange1: string;
  exchange1MarketId: string;
  exchange2: string;
  exchange2MarketId: string;
  entryProfit: number;
  resolutionScore: number;
  status: 'open' | 'closed' | 'expired';
  createdAt: string;
  closedAt?: string;
  exitProfit?: number;
  notes?: string;
}

export interface IStorage {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  saveOpportunity(opportunity: AnyArbitrageOpportunity): Promise<void>;
  saveOpportunities(opportunities: AnyArbitrageOpportunity[]): Promise<void>;

  getOpportunity(id: string): Promise<AnyArbitrageOpportunity | null>;
  getOpportunities(filter?: OpportunityFilter): Promise<AnyArbitrageOpportunity[]>;

  saveMarketPair(pair: AnyMarketPair): Promise<void>;
  getMarketPairs(): Promise<AnyMarketPair[]>;
  getMarketPair(id: string): Promise<AnyMarketPair | null>;

  getPositions?(): Promise<PositionRecord[]>;
  savePosition?(position: PositionRecord): Promise<void>;
  deletePosition?(id: string): Promise<void>;

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