import { FeeStructure } from '../types/arbitrage.js';

export const DEFAULT_FEE_STRUCTURE: FeeStructure = {
  kalshiFeePerContract: 0.01,
  kalshiFeePercent: 0,
  polymarketFeeRate: 0.02,
  polymarketMinFee: 0,
  safetyMarginPercent: 0.005
};

export const AGGRESSIVE_FEE_STRUCTURE: FeeStructure = {
  kalshiFeePerContract: 0.01,
  kalshiFeePercent: 0,
  polymarketFeeRate: 0.02,
  polymarketMinFee: 0,
  safetyMarginPercent: 0.002
};

export const CONSERVATIVE_FEE_STRUCTURE: FeeStructure = {
  kalshiFeePerContract: 0.015,
  kalshiFeePercent: 0.001,
  polymarketFeeRate: 0.025,
  polymarketMinFee: 0.01,
  safetyMarginPercent: 0.01
};

export const MIN_PROFIT_THRESHOLD = 0.001;
export const MIN_SIZE_THRESHOLD = 1;
export const MAX_EXPOSURE_PER_MARKET = 10000;