import { QuotePair } from '../types/market.js';
import { ArbitrageResult, FeeStructure, ValidationResult } from '../types/arbitrage.js';

export interface IArbitrageCalculator {
  calculate(quotes: QuotePair, fees: FeeStructure): ArbitrageResult[];
  validate(result: ArbitrageResult): ValidationResult;
  calculateMaxSize(result: ArbitrageResult, liquidity: number): number;
  estimateSlippage(size: number, depth: number[]): number;
}

export interface IFeeCalculator {
  calculateKalshiFee(contracts: number, price: number): number;
  calculatePolymarketFee(profit: number): number;
  calculateTotalFees(kalshiLeg: number, polyLeg: number, contracts: number): number;
}