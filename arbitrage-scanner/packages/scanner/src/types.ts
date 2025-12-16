import { Market, ExchangeName, MarketCategory } from '@arb/core';

export type PriceCombo = 'YES_NO' | 'NO_YES';

export interface PriceSignal {
  combo: PriceCombo;
  totalCost: number;
  grossArbitrage: number;
}

export interface PriceCandidate {
  market1: Market;
  market2: Market;
  exchange1: ExchangeName;
  exchange2: ExchangeName;
  priceSignal: PriceSignal;
}

export interface PriceScreenConfig {
  maxTotalCost: number;
  minGrossArbitrage: number;
  includeCategories?: MarketCategory[];
  excludeCategories?: MarketCategory[];
  maxMarketsPerExchange?: number;
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  confidence: number;
}

export interface ArbitrageScanResult {
  candidates: PriceCandidate[];
  validated: PriceCandidate[];
  opportunities: ArbitrageOpportunity[];
  scanTime: number;
  marketsScanned: Record<ExchangeName, number>;
}

export interface ArbitrageOpportunity {
  id: string;
  candidate: PriceCandidate;
  netProfitPercent: number;
  grossProfitPercent: number;
  totalCost: number;
  fees: {
    exchange1: number;
    exchange2: number;
    total: number;
  };
  direction: PriceCombo;
  confidence: number;
  timestamp: Date;
}

export const DEFAULT_PRICE_SCREEN_CONFIG: PriceScreenConfig = {
  maxTotalCost: 1.02,
  minGrossArbitrage: 0.01,
  includeCategories: ['politics'],
  maxMarketsPerExchange: 2000
};
