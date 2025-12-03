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