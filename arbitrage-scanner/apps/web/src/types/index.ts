export type ExchangeName = 'KALSHI' | 'POLYMARKET' | 'PREDICTIT' | 'MANIFOLD' | 'MOCK';
export type MarketOutcome = 'YES' | 'NO';
export type ArbitrageDirection =
  | 'EXCHANGE1_YES_EXCHANGE2_NO'
  | 'EXCHANGE1_NO_EXCHANGE2_YES'
  | 'KALSHI_YES_POLY_NO'
  | 'KALSHI_NO_POLY_YES';

export type MarketCategory = 'politics' | 'sports' | 'crypto' | 'economy' | 'technology' | 'entertainment' | 'science' | 'other';

export interface Market {
  id: string;
  exchangeId: string;
  exchange: ExchangeName;
  title: string;
  description: string;
  closeTime?: string;
  volume24h?: number;
  openInterest?: number;
  active: boolean;
  categories?: MarketCategory[];
  primaryCategory?: MarketCategory;
  metadata?: Record<string, unknown>;
}

export interface Quote {
  marketId: string;
  exchange: ExchangeName;
  timestamp: string;
  yes: PriceLevel;
  no: PriceLevel;
  lastUpdate: string;
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
  lastChecked?: string;
}

export interface CrossExchangeQuotePair {
  exchange1: ExchangeName;
  exchange2: ExchangeName;
  quote1: Quote;
  quote2: Quote;
  timestamp: string;
}

export interface CrossExchangeFeeBreakdown {
  exchange1Name: ExchangeName;
  exchange2Name: ExchangeName;
  exchange1Fee: number;
  exchange2Fee: number;
  totalFees: number;
  feePercent: number;
}

export interface CrossExchangeLiquidityInfo {
  exchange1Name: ExchangeName;
  exchange2Name: ExchangeName;
  exchange1Available: number;
  exchange2Available: number;
  maxExecutable: number;
  depthQuality: 'DEEP' | 'MEDIUM' | 'SHALLOW';
}

export interface ResolutionAlignment {
  score: number;
  level: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'CRITICAL';
  tradeable: boolean;
  requiresReview: boolean;
  sourcesMatch: boolean;
  timingMatch: number;
  conditionsMatch: boolean;
  semanticMatch?: number;
  rulesMatch?: number;
  temporalDistance?: number;
  risks: string[];
  warnings: string[];
}

export interface ArbitrageOpportunity {
  id: string;
  timestamp: string;
  marketPair?: CrossExchangePair;
  pair?: CrossExchangePair;
  quotePair?: CrossExchangeQuotePair;
  direction: ArbitrageDirection;
  profitPercent: number;
  profitDollars: number;
  totalCost: number;
  maxSize: number;
  confidence: number;
  ttl: number;
  fees: CrossExchangeFeeBreakdown | LegacyFeeBreakdown;
  liquidity: CrossExchangeLiquidityInfo | LegacyLiquidityInfo;
  resolutionAlignment?: ResolutionAlignment;
  resolutionScore?: number;
  resolution?: ResolutionAlignment;
  valid: boolean;
  executionNotes?: string[];
  exchange1?: ExchangeName;
  exchange2?: ExchangeName;
  market1Id?: string;
  market2Id?: string;
  market1Title?: string;
}

export interface LegacyFeeBreakdown {
  kalshiFee: number;
  polymarketFee: number;
  totalFees: number;
  feePercent: number;
}

export interface LegacyLiquidityInfo {
  kalshiAvailable: number;
  polymarketAvailable: number;
  maxExecutable: number;
  depthQuality: 'DEEP' | 'MEDIUM' | 'SHALLOW';
}

export type PositionStatus = 'open' | 'closed' | 'expired';

export interface PositionRecord {
  id: string;
  opportunityId?: string;
  exchange1: ExchangeName;
  exchange1MarketId: string;
  exchange2: ExchangeName;
  exchange2MarketId: string;
  entryProfit: number;
  resolutionScore: number;
  status: PositionStatus;
  createdAt: string;
  closedAt?: string;
  exitProfit?: number;
  notes?: string;
}

export interface StatsData {
  total: number;
  avgProfit: number;
  maxProfit: number;
  minProfit: number;
  avgConfidence: number;
  validCount: number;
}

export interface RiskMetrics {
  sharpeRatio: number;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  averageProfit: number;
  averageLoss: number;
  volatility: number;
  consecutiveLosses: number;
  totalTrades: number;
  riskScore: number;
  warnings: string[];
}

export interface ForecastTiming {
  nextOpportunity: string;
  confidence: number;
  probabilities: {
    next1Hour: number;
    next24Hours: number;
  };
}

export interface ForecastData {
  expected: number;
  avgProfit: { min: number; max: number };
  maxProfit: { min: number; max: number };
  bestScanTimes: {
    byHour: Array<{ hour: number; avgOpportunities: number }>;
    byDayOfWeek: Array<{ day: number; avgOpportunities: number }>;
  };
  marketConditions: {
    volatility: 'low' | 'medium' | 'high';
    volume: 'low' | 'medium' | 'high';
    news: 'low' | 'medium' | 'high';
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface WebSocketMessage {
  type: 'connected' | 'opportunity' | 'scan:complete' | 'ping' | 'pong' | 'error';
  data?: ArbitrageOpportunity | { count: number; timestamp: string };
  message?: string;
}

export interface FilterState {
  minProfit: number;
  maxProfit: number;
  minConfidence: number;
  exchanges: ExchangeName[];
  minResolutionDays: number;
  searchQuery: string;
}

export type SortField = 'profitPercent' | 'confidence' | 'resolutionDays' | 'timestamp';
export type SortDirection = 'asc' | 'desc';

export interface SortState {
  field: SortField;
  direction: SortDirection;
}
