import { ArbitrageDirection, MarketPair, QuotePair } from './market.js';

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
  valid: boolean;
  executionNotes?: string[];
}

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

export interface FeeBreakdown {
  kalshiFee: number;
  polymarketFee: number;
  totalFees: number;
  feePercent: number;
}

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