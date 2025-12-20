import {
  ExchangeName,
  ArbitrageDirection,
  HistoricalSnapshot,
  MarketOutcome
} from '@arb/core';
export type { CrossExchangePair, HistoricalResolution } from '@arb/core';

// ============================================================================
// User Configuration Types
// ============================================================================

export type DurationType = 'days' | 'weeks' | 'months' | 'years';
export type ReportInterval = 'daily' | 'weekly' | 'monthly' | 'semi_annual' | 'annual';
export type SlippageModel = 'conservative' | 'realistic' | 'optimistic';

export interface BacktestUserConfig {
  capitalAvailable: number;
  simulationDuration: {
    type: DurationType;
    value: number;
  };
  startDate?: Date;
  endDate?: Date;
  reportingIntervals: ReportInterval[];
}

export interface BacktestExecutionConfig {
  slippageModel: SlippageModel;
  executionDelayMs: number;
  maxPositionPercent: number;
  minProfitPercent: number;
  requireResolutionAlignment: boolean;
  minResolutionScore: number;
  cooldownMs: number;
}

export interface RealBacktestConfig {
  userConfig: BacktestUserConfig;
  executionConfig: BacktestExecutionConfig;
}

// ============================================================================
// Enhanced Historical Data Types
// ============================================================================

export interface RealHistoricalSnapshot extends HistoricalSnapshot {
  source: 'API' | 'CACHED' | 'SYNTHETIC';
  fetchedAt: Date;
  exchange1Liquidity?: number;
  exchange2Liquidity?: number;
}

export type ResolutionOutcome = 'YES' | 'NO' | 'PENDING' | 'VOIDED';

export interface RealResolution {
  marketPairId: string;
  exchange1: {
    marketId: string;
    exchange: ExchangeName;
    outcome: ResolutionOutcome;
    resolvedAt?: Date;
    resolutionSource?: string;
  };
  exchange2: {
    marketId: string;
    exchange: ExchangeName;
    outcome: ResolutionOutcome;
    resolvedAt?: Date;
    resolutionSource?: string;
  };
  sameOutcome: boolean | null;
  verifiedAt?: Date;
}

// ============================================================================
// Collection & Job Tracking Types
// ============================================================================

export type CollectionJobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface CollectionJob {
  id: string;
  status: CollectionJobStatus;
  marketPairs: string[];
  dateRange: {
    start: Date;
    end: Date;
  };
  progress: {
    pairsCompleted: number;
    pairsTotal: number;
    snapshotsCollected: number;
    resolutionsCollected: number;
  };
  errors: CollectionError[];
  startedAt?: Date;
  completedAt?: Date;
}

export interface CollectionError {
  marketPairId: string;
  exchange: ExchangeName;
  error: string;
  timestamp: Date;
}

// ============================================================================
// Backtest Trade & Position Types
// ============================================================================

export type TradeOutcome = 'win' | 'loss' | 'break_even' | 'pending' | 'voided';
export type PositionStatus = 'open' | 'closed' | 'pending_resolution';

export interface SimulatedTrade {
  id: string;
  marketPairId: string;
  marketPairDescription: string;
  entryDate: Date;
  exitDate?: Date;
  direction: ArbitrageDirection;
  entryProfitPercent: number;
  actualProfitPercent?: number;
  positionSize: number;
  cost: number;
  payout?: number;
  profit?: number;
  outcome: TradeOutcome;
  exchange1Resolution?: ResolutionOutcome;
  exchange2Resolution?: ResolutionOutcome;
  slippage: number;
  fees: number;
  notes: string[];
}

export interface SimulatedPosition {
  id: string;
  marketPairId: string;
  marketPairDescription: string;
  openedAt: Date;
  direction: ArbitrageDirection;
  exchange1Side: MarketOutcome;
  exchange2Side: MarketOutcome;
  exchange1EntryPrice: number;
  exchange2EntryPrice: number;
  positionSize: number;
  entryProfitPercent: number;
  cost: number;
  status: PositionStatus;
}

// ============================================================================
// Reporting Types
// ============================================================================

export interface IntervalMetrics {
  startingCapital: number;
  endingCapital: number;
  netProfit: number;
  returnPercent: number;
  tradesExecuted: number;
  wins: number;
  losses: number;
  pending: number;
  winRate: number;
  avgProfitPerTrade: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  capitalUtilization: number;
  avgDaysToResolution: number;
}

export interface IntervalReport {
  interval: ReportInterval;
  periodStart: Date;
  periodEnd: Date;
  periodLabel: string;
  metrics: IntervalMetrics;
  positions: PositionSummary[];
  notes: string[];
}

export interface PositionSummary {
  marketPairId: string;
  description: string;
  entryDate: Date;
  exitDate?: Date;
  entryProfit: number;
  actualProfit?: number;
  status: PositionStatus;
  outcome?: TradeOutcome;
}

// ============================================================================
// Backtest Result Types
// ============================================================================

export interface RealBacktestSummary {
  config: BacktestUserConfig;
  period: {
    start: Date;
    end: Date;
    durationDays: number;
  };
  performance: {
    initialCapital: number;
    finalCapital: number;
    netProfit: number;
    totalReturn: number;
    annualizedReturn: number;
  };
  trading: {
    totalTrades: number;
    wins: number;
    losses: number;
    pending: number;
    winRate: number;
    avgProfitPerTrade: number;
    avgDaysToResolution: number;
  };
  risk: {
    sharpeRatio: number;
    sortinoRatio: number;
    calmarRatio: number;
    maxDrawdown: number;
    maxDrawdownPercent: number;
    volatility: number;
  };
  resolution: {
    sameOutcomeRate: number;
    avgResolutionTime: number;
    voidedMarkets: number;
    divergentOutcomes: number;
  };
}

export interface RealBacktestResult {
  generatedAt: Date;
  config: RealBacktestConfig;
  summary: RealBacktestSummary;
  trades: SimulatedTrade[];
  reports: Map<ReportInterval, IntervalReport[]>;
  capitalPath: CapitalPathPoint[];
  warnings: string[];
}

export interface CapitalPathPoint {
  date: Date;
  capital: number;
  openPositions: number;
  availableCapital: number;
}

// ============================================================================
// Rate Limiting Types
// ============================================================================

export interface RateLimitConfig {
  maxRequestsPerMinute: number;
  maxConcurrent: number;
  retryOnRateLimit: boolean;
  maxRetries: number;
  backoffMultiplier: number;
}

export interface RateLimitStats {
  pending: number;
  active: number;
  completed: number;
  failed: number;
  rateLimitHits: number;
}

// ============================================================================
// Storage Types
// ============================================================================

export interface StorageIndex {
  marketPairs: string[];
  dateRange: {
    earliest: Date;
    latest: Date;
  };
  snapshotCount: number;
  resolutionCount: number;
  lastUpdated: Date;
}

// ============================================================================
// Default Configurations
// ============================================================================

export const DEFAULT_EXECUTION_CONFIG: BacktestExecutionConfig = {
  slippageModel: 'realistic',
  executionDelayMs: 2000,
  maxPositionPercent: 0.10,
  minProfitPercent: 1.0,
  requireResolutionAlignment: true,
  minResolutionScore: 70,
  cooldownMs: 60000
};

export const DEFAULT_RATE_LIMITS: Record<ExchangeName, RateLimitConfig> = {
  KALSHI: {
    maxRequestsPerMinute: 180,
    maxConcurrent: 5,
    retryOnRateLimit: true,
    maxRetries: 3,
    backoffMultiplier: 2
  },
  POLYMARKET: {
    maxRequestsPerMinute: 270,
    maxConcurrent: 8,
    retryOnRateLimit: true,
    maxRetries: 3,
    backoffMultiplier: 2
  },
  PREDICTIT: {
    maxRequestsPerMinute: 50,
    maxConcurrent: 2,
    retryOnRateLimit: true,
    maxRetries: 3,
    backoffMultiplier: 2
  },
  DRAFTKINGS: {
    maxRequestsPerMinute: 180,
    maxConcurrent: 5,
    retryOnRateLimit: true,
    maxRetries: 3,
    backoffMultiplier: 2
  },
  MOCK: {
    maxRequestsPerMinute: 1000,
    maxConcurrent: 10,
    retryOnRateLimit: false,
    maxRetries: 0,
    backoffMultiplier: 1
  }
};

export const SLIPPAGE_FACTORS: Record<SlippageModel, { base: number; sizeImpact: number; profitImpact: number }> = {
  conservative: { base: 0.005, sizeImpact: 0.001, profitImpact: 0.002 },
  realistic: { base: 0.002, sizeImpact: 0.0005, profitImpact: 0.001 },
  optimistic: { base: 0.001, sizeImpact: 0.0002, profitImpact: 0.0005 }
};
