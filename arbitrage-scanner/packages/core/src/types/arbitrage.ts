import { ArbitrageDirection, MarketPair, QuotePair, CrossExchangePair, CrossExchangeQuotePair, ExchangeName } from './market.js';
import { ResolutionAlignment } from '@arb/math';

export interface CrossExchangeArbitrageOpportunity {
  id: string;
  timestamp: Date;
  marketPair: CrossExchangePair;
  quotePair: CrossExchangeQuotePair;
  direction: ArbitrageDirection;
  profitPercent: number;
  profitDollars: number;
  totalCost: number;
  maxSize: number;
  confidence: number;
  ttl: number;
  fees: CrossExchangeFeeBreakdown;
  liquidity: CrossExchangeLiquidityInfo;
  resolutionAlignment?: ResolutionAlignment;
  valid: boolean;
  executionNotes?: string[];
  turnoverMetrics?: TurnoverMetrics;
}

/**
 * Capital turnover metrics for compounding return optimization.
 * Prioritizes: Confidence > Resolution Time > Profit per trade
 */
export interface TurnoverMetrics {
  /** Days until market resolution */
  daysToResolution: number;
  /** Number of times capital can turn over in a year (365 / daysToResolution) */
  turnsPerYear: number;
  /** Projected annual return with compounding: ((1 + profit%)^turns - 1) * 100 */
  annualizedReturn: number;
  /** Composite score prioritizing confidence, time, then profit (0-100) */
  capitalTurnoverScore: number;
  /** Expected win rate based on confidence bucket */
  expectedWinRate: number;
  /** Position sizing recommendation */
  positionSizing?: PositionSizing;
}

/**
 * Kelly criterion-based position sizing recommendation
 */
export interface PositionSizing {
  /** Optimal position size (full Kelly) as % of bankroll */
  kellyPercent: number;
  /** Conservative position size (half Kelly) as % of bankroll */
  halfKellyPercent: number;
  /** Recommended dollar amount based on user's capital */
  recommendedAmount?: number;
  /** Maximum risk amount based on drawdown tolerance */
  maxRiskAmount?: number;
}

export interface CrossExchangeArbitrageResult {
  direction: ArbitrageDirection;
  profitPercent: number;
  totalCost: number;
  exchange1Leg: number;
  exchange2Leg: number;
  fees: CrossExchangeFeeBreakdown;
  breakEven: number;
  valid: boolean;
  validationErrors?: string[];
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

/** @deprecated Use CrossExchangeArbitrageOpportunity instead */
export interface ArbitrageOpportunity {
  id: string;
  timestamp: Date;
  marketPair: MarketPair;
  quotePair: QuotePair;
  direction: ArbitrageDirection;
  profitPercent: number;
  profitDollars: number;
  totalCost: number;
  maxSize: number;
  confidence: number;
  ttl: number;
  fees: FeeBreakdown;
  liquidity: LiquidityInfo;
  resolutionAlignment?: ResolutionAlignment;
  valid: boolean;
  executionNotes?: string[];
}

/** @deprecated Use CrossExchangeArbitrageResult instead */
export interface ArbitrageResult {
  direction: ArbitrageDirection;
  profitPercent: number;
  totalCost: number;
  kalshiLeg: number;
  polymarketLeg: number;
  fees: FeeBreakdown;
  breakEven: number;
  valid: boolean;
  validationErrors?: string[];
}

/** @deprecated Use CrossExchangeFeeBreakdown instead */
export interface FeeBreakdown {
  kalshiFee: number;
  polymarketFee: number;
  totalFees: number;
  feePercent: number;
}

/** @deprecated Use CrossExchangeLiquidityInfo instead */
export interface LiquidityInfo {
  kalshiAvailable: number;
  polymarketAvailable: number;
  maxExecutable: number;
  depthQuality: 'DEEP' | 'MEDIUM' | 'SHALLOW';
}

export interface FeeStructure {
  kalshiFeePerContract: number;
  kalshiFeePercent?: number;
  polymarketFeeRate: number;
  polymarketMinFee?: number;
  safetyMarginPercent: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  confidence: number;
}