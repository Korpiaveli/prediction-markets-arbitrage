import {
  IStorage,
  ArbitrageOpportunity,
  MarketPair,
  OpportunityFilter
} from '@arb/core';
import { promises as fs } from 'fs';
import path from 'path';

export interface JsonStorageConfig {
  dataDir: string;
  opportunitiesFile?: string;
  marketPairsFile?: string;
  prettyPrint?: boolean;
}

export class JsonStorage implements IStorage {
  private config: Required<JsonStorageConfig>;
  private connected: boolean = false;

  constructor(config: JsonStorageConfig) {
    this.config = {
      dataDir: config.dataDir,
      opportunitiesFile: config.opportunitiesFile || 'opportunities.json',
      marketPairsFile: config.marketPairsFile || 'market_pairs.json',
      prettyPrint: config.prettyPrint ?? true
    };
  }

  async connect(): Promise<void> {
    // Ensure data directory exists
    await fs.mkdir(this.config.dataDir, { recursive: true });
    this.connected = true;
    console.log(`[JsonStorage] Connected to ${this.config.dataDir}`);
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    console.log('[JsonStorage] Disconnected');
  }

  isConnected(): boolean {
    return this.connected;
  }

  async saveOpportunity(opportunity: ArbitrageOpportunity): Promise<void> {
    const opportunities = await this.loadOpportunities();
    opportunities.push(opportunity);
    await this.saveOpportunities(opportunities);
  }

  async saveOpportunities(opportunities: ArbitrageOpportunity[]): Promise<void> {
    const filePath = path.join(this.config.dataDir, this.config.opportunitiesFile);
    const data = this.config.prettyPrint
      ? JSON.stringify(opportunities, null, 2)
      : JSON.stringify(opportunities);

    await fs.writeFile(filePath, data, 'utf8');
  }

  async getOpportunity(id: string): Promise<ArbitrageOpportunity | null> {
    const opportunities = await this.loadOpportunities();
    return opportunities.find(opp => opp.id === id) || null;
  }

  async getOpportunities(filter?: OpportunityFilter): Promise<ArbitrageOpportunity[]> {
    let opportunities = await this.loadOpportunities();

    if (!filter) {
      return opportunities;
    }

    // Apply filters
    if (filter.fromDate) {
      opportunities = opportunities.filter(
        opp => new Date(opp.timestamp) >= filter.fromDate!
      );
    }

    if (filter.toDate) {
      opportunities = opportunities.filter(
        opp => new Date(opp.timestamp) <= filter.toDate!
      );
    }

    if (filter.minProfit !== undefined) {
      opportunities = opportunities.filter(
        opp => opp.profitPercent >= filter.minProfit!
      );
    }

    if (filter.maxProfit !== undefined) {
      opportunities = opportunities.filter(
        opp => opp.profitPercent <= filter.maxProfit!
      );
    }

    if (filter.marketPairId) {
      opportunities = opportunities.filter(
        opp => opp.marketPair.id === filter.marketPairId
      );
    }

    // Sort
    const orderBy = filter.orderBy || 'timestamp';
    const order = filter.order || 'desc';

    opportunities.sort((a, b) => {
      let aVal: any, bVal: any;

      switch (orderBy) {
        case 'profit':
          aVal = a.profitPercent;
          bVal = b.profitPercent;
          break;
        case 'confidence':
          aVal = a.confidence;
          bVal = b.confidence;
          break;
        default:
          aVal = new Date(a.timestamp).getTime();
          bVal = new Date(b.timestamp).getTime();
      }

      return order === 'asc' ? aVal - bVal : bVal - aVal;
    });

    // Apply limit and offset
    if (filter.offset) {
      opportunities = opportunities.slice(filter.offset);
    }

    if (filter.limit) {
      opportunities = opportunities.slice(0, filter.limit);
    }

    return opportunities;
  }

  async saveMarketPair(pair: MarketPair): Promise<void> {
    const pairs = await this.loadMarketPairs();
    const existingIndex = pairs.findIndex(p => p.id === pair.id);

    if (existingIndex >= 0) {
      pairs[existingIndex] = pair;
    } else {
      pairs.push(pair);
    }

    await this.saveMarketPairs(pairs);
  }

  async getMarketPairs(): Promise<MarketPair[]> {
    return this.loadMarketPairs();
  }

  async getMarketPair(id: string): Promise<MarketPair | null> {
    const pairs = await this.loadMarketPairs();
    return pairs.find(p => p.id === id) || null;
  }

  async clear(): Promise<void> {
    await this.saveOpportunities([]);
    await this.saveMarketPairs([]);
  }

  // Private helper methods

  private async loadOpportunities(): Promise<ArbitrageOpportunity[]> {
    const filePath = path.join(this.config.dataDir, this.config.opportunitiesFile);

    try {
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  private async loadMarketPairs(): Promise<MarketPair[]> {
    const filePath = path.join(this.config.dataDir, this.config.marketPairsFile);

    try {
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  private async saveMarketPairs(pairs: MarketPair[]): Promise<void> {
    const filePath = path.join(this.config.dataDir, this.config.marketPairsFile);
    const data = this.config.prettyPrint
      ? JSON.stringify(pairs, null, 2)
      : JSON.stringify(pairs);

    await fs.writeFile(filePath, data, 'utf8');
  }
}