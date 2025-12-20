import { ExchangeConfig } from '@arb/core';

export interface DraftKingsConfig extends ExchangeConfig {
  filterSports?: boolean;
}

export interface DraftKingsMarket {
  id: string;
  eventId: string;
  question: string;
  description?: string;
  status: 'open' | 'closed' | 'resolved';
  closeTime: string;
  resolutionTime?: string;

  outcomes: DraftKingsOutcome[];

  volume?: number;
  volume24h?: number;
  liquidity?: number;

  category?: string;
  tags?: string[];

  rules?: string;
  result?: 'yes' | 'no' | null;
}

export interface DraftKingsOutcome {
  id: string;
  name: 'Yes' | 'No';
  price: number;
  bidPrice?: number;
  askPrice?: number;
}

export interface DraftKingsMarketsResponse {
  markets: DraftKingsMarket[];
  cursor?: string;
  hasMore?: boolean;
}

export interface DraftKingsQuoteResponse {
  marketId: string;
  outcomes: Array<{
    name: string;
    bid: number;
    ask: number;
    lastPrice: number;
  }>;
  timestamp: string;
}

export interface DraftKingsOrderRequest {
  marketId: string;
  outcome: 'yes' | 'no';
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
}

export interface DraftKingsOrderResponse {
  orderId: string;
  status: 'pending' | 'filled' | 'partial' | 'cancelled' | 'rejected';
  filledQuantity: number;
  averagePrice: number;
  createdAt: string;
}
