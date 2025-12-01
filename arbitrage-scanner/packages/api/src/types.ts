import { Scanner } from '@arb/scanner';
import { IStorage } from '@arb/core';
import { BacktestEngine, PatternAnalyzer } from '@arb/ml';
import { IExchange } from '@arb/core';

export interface ApiConfig {
  port: number;
  corsOrigin?: string;
  enableWebSocket?: boolean;
  rateLimit?: {
    max: number;
    windowMs: number;
  };
  debug?: boolean;
}

export interface ApiContext {
  scanner?: Scanner;
  storage: IStorage;
  exchanges: IExchange[];
  backtester: BacktestEngine;
  patternAnalyzer: PatternAnalyzer;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  orderBy?: string;
  order?: 'asc' | 'desc';
}

export interface FilterParams {
  minProfit?: number;
  maxProfit?: number;
  minConfidence?: number;
  exchanges?: string[];
  categories?: string[];
  startDate?: string;
  endDate?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}
