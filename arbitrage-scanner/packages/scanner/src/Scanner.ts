import {
  IScanner,
  IExchange,
  IArbitrageCalculator,
  IStorage,
  IPlugin,
  ScannerConfig,
  ArbitrageOpportunity,
  MarketPair,
  QuotePair,
  CrossExchangePair,
  CrossExchangeQuotePair,
  CrossExchangeArbitrageOpportunity,
  DEFAULT_FEE_STRUCTURE
} from '@arb/core';
import { ResolutionAnalyzer } from '@arb/math';
import { EventEmitter } from 'eventemitter3';
import pLimit from 'p-limit';

export class Scanner extends EventEmitter implements IScanner {
  readonly exchanges: Map<string, IExchange>;
  readonly calculator: IArbitrageCalculator;
  readonly storage?: IStorage;
  readonly plugins: IPlugin[];

  private config: ScannerConfig;
  private running: boolean = false;
  private scanInterval?: NodeJS.Timeout;
  private limit: any;
  private resolutionAnalyzer: ResolutionAnalyzer;

  constructor(config: ScannerConfig) {
    super();
    this.config = config;
    this.exchanges = new Map();
    this.calculator = config.calculator;
    this.storage = config.storage;
    this.plugins = config.plugins || [];
    this.resolutionAnalyzer = new ResolutionAnalyzer();

    // Add exchanges
    for (const exchange of config.exchanges) {
      this.addExchange(exchange);
    }

    // Create concurrency limiter
    this.limit = pLimit(config.maxConcurrent || 5);

    // Initialize plugins
    this.initializePlugins();
  }

  private async initializePlugins(): Promise<void> {
    // Sort plugins by priority (higher priority runs first)
    this.plugins.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    for (const plugin of this.plugins) {
      await plugin.initialize(this);
      console.log(`[Scanner] Initialized plugin: ${plugin.name}`);
    }
  }

  addExchange(exchange: IExchange): void {
    this.exchanges.set(exchange.name, exchange);
    this.emit('exchange:added', exchange.name);
  }

  removeExchange(name: string): void {
    this.exchanges.delete(name);
    this.emit('exchange:removed', name);
  }

  addPlugin(plugin: IPlugin): void {
    this.plugins.push(plugin);
    plugin.initialize(this);
  }

  removePlugin(name: string): void {
    const index = this.plugins.findIndex(p => p.name === name);
    if (index >= 0) {
      const plugin = this.plugins[index];
      if (plugin.destroy) {
        plugin.destroy();
      }
      this.plugins.splice(index, 1);
    }
  }

  async scan(): Promise<ArbitrageOpportunity[]> {
    console.log('[Scanner] Starting scan...');
    this.emit('scan:start');

    // Run beforeScan hooks
    for (const plugin of this.plugins) {
      if (plugin.beforeScan) {
        await plugin.beforeScan();
      }
    }

    // Get market pairs
    const marketPairs = await this.getMarketPairs();
    console.log(`[Scanner] Found ${marketPairs.length} market pairs to scan`);

    // Scan all pairs in parallel with concurrency limit
    const scanPromises = marketPairs.map(pair =>
      this.limit(() => this.scanPair(pair))
    );

    const results = await Promise.all(scanPromises);
    const opportunities = results.filter((opp): opp is ArbitrageOpportunity => opp !== null);

    console.log(`[Scanner] Found ${opportunities.length} arbitrage opportunities`);

    // Run afterScan hooks
    for (const plugin of this.plugins) {
      if (plugin.afterScan) {
        await plugin.afterScan(opportunities);
      }
    }

    // Save opportunities if storage is configured
    if (this.storage && opportunities.length > 0) {
      await this.storage.saveOpportunities(opportunities);
    }

    this.emit('scan:complete', opportunities);
    return opportunities;
  }

  async scanCrossExchangePair(pair: CrossExchangePair): Promise<CrossExchangeArbitrageOpportunity | null> {
    try {
      // Fetch quotes from both exchanges dynamically
      const exchange1 = this.exchanges.get(pair.exchange1);
      const exchange2 = this.exchanges.get(pair.exchange2);

      if (!exchange1 || !exchange2) {
        console.error(`[Scanner] Missing exchange adapters: ${pair.exchange1}=${!!exchange1}, ${pair.exchange2}=${!!exchange2}`);
        return null;
      }

      const [quote1, quote2] = await Promise.all([
        exchange1.getQuote(pair.market1Id),
        exchange2.getQuote(pair.market2Id)
      ]);

      const quotePair: CrossExchangeQuotePair = {
        exchange1: pair.exchange1,
        exchange2: pair.exchange2,
        quote1,
        quote2,
        timestamp: new Date()
      };

      // Calculate arbitrage using cross-exchange method
      const results: any[] = (this.calculator as any).calculateCrossExchange(quotePair, DEFAULT_FEE_STRUCTURE);

      // Find the best opportunity
      const bestResult = results.find((r: any) => r.valid);
      if (!bestResult) {
        return null;
      }

      // Validate the result
      const validation = this.calculator.validate(bestResult);
      if (!validation.valid) {
        console.warn(`[Scanner] Invalid opportunity for ${pair.description}: ${validation.errors.join(', ')}`);
        return null;
      }

      // Calculate max size based on liquidity
      const minLiquidity = Math.min(
        quote1.yes.liquidity || 0,
        quote2.no.liquidity || 0
      );
      const maxSize = this.calculator.calculateMaxSize(bestResult, minLiquidity);

      // Create opportunity object
      let opportunity: CrossExchangeArbitrageOpportunity = {
        id: `${pair.id}_${Date.now()}`,
        timestamp: new Date(),
        marketPair: pair,
        quotePair,
        direction: bestResult.direction,
        profitPercent: bestResult.profitPercent,
        profitDollars: bestResult.profitPercent * maxSize,
        totalCost: bestResult.totalCost,
        maxSize,
        confidence: validation.confidence,
        ttl: 30,
        fees: {
          exchange1Name: pair.exchange1,
          exchange2Name: pair.exchange2,
          exchange1Fee: bestResult.fees.kalshiFee,
          exchange2Fee: bestResult.fees.polymarketFee,
          totalFees: bestResult.fees.totalFees,
          feePercent: bestResult.fees.feePercent
        },
        liquidity: {
          exchange1Name: pair.exchange1,
          exchange2Name: pair.exchange2,
          exchange1Available: quote1.yes.liquidity || 0,
          exchange2Available: quote2.no.liquidity || 0,
          maxExecutable: maxSize,
          depthQuality: minLiquidity > 5000 ? 'DEEP' : minLiquidity > 1000 ? 'MEDIUM' : 'SHALLOW'
        },
        valid: true
      };

      // Analyze resolution criteria alignment
      const resolutionAlignment = this.resolutionAnalyzer.analyzeCrossExchangePair(pair);
      opportunity.resolutionAlignment = resolutionAlignment;

      // Filter based on resolution risk
      if (!this.config.disableResolutionFiltering && !resolutionAlignment.tradeable) {
        console.warn(
          `[Scanner] Filtering opportunity due to resolution risk (score: ${resolutionAlignment.score}):\n` +
          `  Market: ${pair.description}\n` +
          `  Risks: ${resolutionAlignment.risks.join(', ')}`
        );
        return null;
      }

      // Add resolution warnings to execution notes
      if (resolutionAlignment.warnings.length > 0) {
        opportunity.executionNotes = resolutionAlignment.warnings.map(w => `⚠️ ${w}`);
      }

      this.emit('opportunity:found', opportunity);
      return opportunity;

    } catch (error) {
      console.error(`[Scanner] Error scanning pair ${pair.description}:`, error);
      this.emit('scan:error', { pair, error });
      return null;
    }
  }

  /** @deprecated Use scanCrossExchangePair instead */
  async scanPair(pair: MarketPair): Promise<ArbitrageOpportunity | null> {
    try {
      // Fetch quotes from both exchanges
      const kalshi = this.exchanges.get('KALSHI');
      const polymarket = this.exchanges.get('POLYMARKET');

      if (!kalshi || !polymarket) {
        console.error('[Scanner] Missing exchange adapters');
        return null;
      }

      const [kalshiQuote, polyQuote] = await Promise.all([
        kalshi.getQuote(pair.kalshiId),
        polymarket.getQuote(pair.polymarketId)
      ]);

      const quotePair: QuotePair = {
        kalshi: kalshiQuote,
        polymarket: polyQuote,
        timestamp: new Date()
      };

      // Calculate arbitrage
      const results = this.calculator.calculate(quotePair, DEFAULT_FEE_STRUCTURE);

      // Find the best opportunity
      const bestResult = results.find(r => r.valid);
      if (!bestResult) {
        return null;
      }

      // Validate the result
      const validation = this.calculator.validate(bestResult);
      if (!validation.valid) {
        console.warn(`[Scanner] Invalid opportunity for ${pair.description}: ${validation.errors.join(', ')}`);
        return null;
      }

      // Calculate max size based on liquidity
      const minLiquidity = Math.min(
        kalshiQuote.yes.liquidity || 0,
        polyQuote.no.liquidity || 0
      );
      const maxSize = this.calculator.calculateMaxSize(bestResult, minLiquidity);

      // Create opportunity object
      let opportunity: ArbitrageOpportunity = {
        id: `${pair.id}_${Date.now()}`,
        timestamp: new Date(),
        marketPair: pair,
        quotePair,
        direction: bestResult.direction,
        profitPercent: bestResult.profitPercent,
        profitDollars: bestResult.profitPercent * maxSize,
        totalCost: bestResult.totalCost,
        maxSize,
        confidence: validation.confidence,
        ttl: 30, // 30 seconds TTL
        fees: bestResult.fees,
        liquidity: {
          kalshiAvailable: kalshiQuote.yes.liquidity || 0,
          polymarketAvailable: polyQuote.no.liquidity || 0,
          maxExecutable: maxSize,
          depthQuality: minLiquidity > 5000 ? 'DEEP' : minLiquidity > 1000 ? 'MEDIUM' : 'SHALLOW'
        },
        valid: true
      };

      // Analyze resolution criteria alignment
      const resolutionAlignment = this.resolutionAnalyzer.analyzeMarketPair(pair);
      opportunity.resolutionAlignment = resolutionAlignment;

      // Filter based on resolution risk (unless filtering is disabled)
      if (!this.config.disableResolutionFiltering && !resolutionAlignment.tradeable) {
        console.warn(
          `[Scanner] Filtering opportunity due to resolution risk (score: ${resolutionAlignment.score}):\n` +
          `  Market: ${pair.description}\n` +
          `  Risks: ${resolutionAlignment.risks.join(', ')}`
        );
        return null;
      }

      // Log resolution data if filtering is disabled (data collection mode)
      if (this.config.disableResolutionFiltering) {
        console.log(
          `[Resolution Analysis] ${pair.description}:\n` +
          `  Score: ${resolutionAlignment.score}/100 | Level: ${resolutionAlignment.level}\n` +
          `  Tradeable: ${resolutionAlignment.tradeable} | Requires Review: ${resolutionAlignment.requiresReview}\n` +
          `  Sources Match: ${resolutionAlignment.sourcesMatch} | Timing Match: ${resolutionAlignment.timingMatch}\n` +
          `  Conditions Match: ${resolutionAlignment.conditionsMatch}`
        );
        if (resolutionAlignment.risks.length > 0) {
          console.log(`  Risks: ${resolutionAlignment.risks.join(', ')}`);
        }
        if (resolutionAlignment.warnings.length > 0) {
          console.log(`  Warnings: ${resolutionAlignment.warnings.join(', ')}`);
        }
      }

      // Add resolution warnings to execution notes
      if (resolutionAlignment.warnings.length > 0) {
        opportunity.executionNotes = [
          ...(opportunity.executionNotes || []),
          ...resolutionAlignment.warnings.map(w => `⚠️ ${w}`)
        ];
      }

      // Process through plugins
      for (const plugin of this.plugins) {
        if (plugin.processOpportunity) {
          opportunity = plugin.processOpportunity(opportunity);
        }
        if (plugin.filterOpportunity && !plugin.filterOpportunity(opportunity)) {
          return null;
        }
      }

      this.emit('opportunity:found', opportunity);
      return opportunity;

    } catch (error) {
      console.error(`[Scanner] Error scanning pair ${pair.description}:`, error);
      this.emit('scan:error', { pair, error });

      // Let plugins handle the error
      for (const plugin of this.plugins) {
        if (plugin.onError) {
          plugin.onError(error as Error);
        }
      }

      return null;
    }
  }

  private async getMarketPairs(): Promise<MarketPair[]> {
    // If storage has market pairs, use those
    if (this.storage) {
      const storedPairs = await this.storage.getMarketPairs();
      if (storedPairs.length > 0) {
        return storedPairs;
      }
    }

    // Otherwise, create mock pairs for testing
    // In production, this would match markets across exchanges
    return [
      {
        id: 'NFL_GAME_1',
        description: 'NFL: Raiders beat Cowboys',
        kalshiMarket: {} as any,
        polymarketMarket: {} as any,
        kalshiId: 'KALSHI_NFL_1',
        polymarketId: 'POLY_NFL_1',
        correlationScore: 0.95
      }
    ];
  }

  start(intervalMs?: number): void {
    if (this.running) {
      console.warn('[Scanner] Already running');
      return;
    }

    const interval = intervalMs || this.config.scanInterval || 5000;
    console.log(`[Scanner] Starting automatic scanning every ${interval}ms`);

    this.running = true;
    this.emit('scanner:start');

    // Run initial scan
    this.scan();

    // Schedule recurring scans
    this.scanInterval = setInterval(() => {
      this.scan();
    }, interval);
  }

  stop(): void {
    if (!this.running) {
      console.warn('[Scanner] Not running');
      return;
    }

    console.log('[Scanner] Stopping automatic scanning');
    this.running = false;

    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = undefined;
    }

    this.emit('scanner:stop');
  }

  isRunning(): boolean {
    return this.running;
  }

  async destroy(): Promise<void> {
    this.stop();

    // Destroy all plugins
    for (const plugin of this.plugins) {
      if (plugin.destroy) {
        await plugin.destroy();
      }
    }

    // Disconnect exchanges
    for (const exchange of this.exchanges.values()) {
      await exchange.disconnect();
    }

    // Disconnect storage
    if (this.storage) {
      await this.storage.disconnect();
    }

    this.removeAllListeners();
  }
}