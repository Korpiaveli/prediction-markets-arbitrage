import { ArbitrageOpportunity } from '../types/arbitrage.js';
import { MarketPair } from '../types/market.js';
import { IExchange } from './exchange.js';
import { IArbitrageCalculator } from './calculator.js';
import { IStorage } from './storage.js';

export interface IScanner {
  readonly exchanges: Map<string, IExchange>;
  readonly calculator: IArbitrageCalculator;
  readonly storage?: IStorage;
  readonly plugins: IPlugin[];

  addExchange(exchange: IExchange): void;
  removeExchange(name: string): void;

  addPlugin(plugin: IPlugin): void;
  removePlugin(name: string): void;

  scan(): Promise<ArbitrageOpportunity[]>;
  scanPair(pair: MarketPair): Promise<ArbitrageOpportunity | null>;

  start(intervalMs?: number): void;
  stop(): void;
  isRunning(): boolean;
}

export interface IPlugin {
  readonly name: string;
  readonly version: string;
  readonly priority?: number;

  initialize(scanner: IScanner): Promise<void>;
  destroy?(): Promise<void>;

  beforeScan?(): Promise<void>;
  afterScan?(opportunities: ArbitrageOpportunity[]): Promise<void>;

  processOpportunity?(opportunity: ArbitrageOpportunity): ArbitrageOpportunity;
  filterOpportunity?(opportunity: ArbitrageOpportunity): boolean;

  onError?(error: Error): void;
}

export interface ScannerConfig {
  exchanges: IExchange[];
  calculator: IArbitrageCalculator;
  storage?: IStorage;
  plugins?: IPlugin[];
  scanInterval?: number;
  maxConcurrent?: number;
  timeout?: number;
}