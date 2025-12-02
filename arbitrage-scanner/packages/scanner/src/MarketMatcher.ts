import { Market, MarketPair, IExchange } from '@arb/core';
import {
  EmbeddingService,
  getEmbeddingService,
  FeatureExtractor,
  FeatureVector
} from '@arb/ml';
import {
  ScoringStrategy,
  KalshiPolymarketStrategy
} from '@arb/ml/strategies';
import {
  ExchangeNormalizer,
  KalshiNormalizer,
  PolymarketNormalizer
} from '@arb/ml/normalizers';

export interface MatchAnalysis {
  titleSimilarity: number;
  descriptionSimilarity: number;
  keywordOverlap: number;
  embeddingSimilarity?: number;
  categoryMatch: boolean;
  timingMatch: boolean;
  confidence: number;
  level: 'high' | 'medium' | 'low' | 'uncertain';
  reasons: string[];
}

export interface MatcherConfig {
  minConfidence?: number;
  includeLowConfidence?: boolean;
  includeUncertain?: boolean;
  useEmbeddings?: boolean;
  strategy?: ScoringStrategy;
  kalshiNormalizer?: ExchangeNormalizer;
  polymarketNormalizer?: ExchangeNormalizer;
}

export class MarketMatcher {
  private readonly config: MatcherConfig;
  private embeddingService?: EmbeddingService;
  private embeddingsInitialized = false;
  private readonly strategy: ScoringStrategy;
  private readonly kalshiNormalizer: ExchangeNormalizer;
  private readonly polymarketNormalizer: ExchangeNormalizer;
  private readonly featureExtractor: FeatureExtractor;

  constructor(config: MatcherConfig = {}) {
    this.config = {
      minConfidence: config.minConfidence ?? 55,
      includeLowConfidence: config.includeLowConfidence ?? true,
      includeUncertain: config.includeUncertain ?? false,
      useEmbeddings: config.useEmbeddings ?? true
    };

    this.strategy = config.strategy ?? new KalshiPolymarketStrategy();
    this.kalshiNormalizer = config.kalshiNormalizer ?? new KalshiNormalizer();
    this.polymarketNormalizer = config.polymarketNormalizer ?? new PolymarketNormalizer();

    if (this.config.useEmbeddings) {
      this.embeddingService = getEmbeddingService();
    }

    this.featureExtractor = new FeatureExtractor(this.embeddingService);
  }

  /**
   * Initialize embedding service (loads model)
   */
  async initializeEmbeddings(): Promise<void> {
    if (this.embeddingService && !this.embeddingsInitialized) {
      try {
        console.log('[MarketMatcher] Initializing embedding model...');
        await this.embeddingService.initialize();
        this.embeddingsInitialized = true;
        console.log('[MarketMatcher] Embedding model ready');
      } catch (error) {
        console.warn('[MarketMatcher] Failed to initialize embeddings:', error);
        this.embeddingService = undefined;
      }
    }
  }

  /**
   * Match markets across exchanges using multi-strategy approach
   */
  async matchMarkets(
    kalshi: IExchange,
    polymarket: IExchange
  ): Promise<MarketPair[]> {
    console.log('[MarketMatcher] Fetching markets from both exchanges...');
    const [kalshiMarkets, polyMarkets] = await Promise.all([
      kalshi.getMarkets(),
      polymarket.getMarkets()
    ]);

    console.log(`[MarketMatcher] Kalshi: ${kalshiMarkets.length} markets`);
    console.log(`[MarketMatcher] Polymarket: ${polyMarkets.length} markets`);

    await this.initializeEmbeddings();

    // Diagnostic logging for embedding service status
    console.log('[DEBUG] Embedding service status:', {
      available: !!this.embeddingService,
      initialized: this.embeddingsInitialized,
      ready: this.embeddingService?.isReady() ?? false
    });

    console.log('[MarketMatcher] Analyzing matches...\n');

    const pairs: MarketPair[] = [];
    const allMatches: Array<{ pair: MarketPair; analysis: MatchAnalysis }> = [];

    for (const kMarket of kalshiMarkets) {
      const match = await this.findBestMatch(kMarket, polyMarkets);

      if (match && this.shouldIncludeMatch(match.analysis)) {
        const pair: MarketPair = {
          id: `${kMarket.id}_${match.market.id}`,
          description: kMarket.title,
          kalshiMarket: kMarket,
          polymarketMarket: match.market,
          kalshiId: kMarket.id,
          polymarketId: match.market.id,
          correlationScore: match.analysis.confidence / 100
        };

        pairs.push(pair);
        allMatches.push({ pair, analysis: match.analysis });
      }
    }

    this.logMatchResults(allMatches);
    return pairs;
  }

  /**
   * Check if match should be included based on config
   */
  private shouldIncludeMatch(analysis: MatchAnalysis): boolean {
    if (analysis.level === 'uncertain' && !this.config.includeUncertain) {
      return false;
    }
    if (analysis.level === 'low' && !this.config.includeLowConfidence) {
      return false;
    }
    return analysis.confidence >= (this.config.minConfidence ?? 0);
  }

  /**
   * Log match results summary
   */
  private logMatchResults(matches: Array<{ pair: MarketPair; analysis: MatchAnalysis }>) {
    const byLevel = {
      high: matches.filter(m => m.analysis.level === 'high'),
      medium: matches.filter(m => m.analysis.level === 'medium'),
      low: matches.filter(m => m.analysis.level === 'low'),
      uncertain: matches.filter(m => m.analysis.level === 'uncertain')
    };

    console.log('[MarketMatcher] Results:');
    console.log(`  High confidence (80+):   ${byLevel.high.length} pairs`);
    console.log(`  Medium confidence (60-79): ${byLevel.medium.length} pairs`);
    console.log(`  Low confidence (40-59):   ${byLevel.low.length} pairs`);
    console.log(`  Uncertain (<40):         ${byLevel.uncertain.length} pairs`);
    console.log(`  Total: ${matches.length} pairs\n`);

    // Show top matches
    if (byLevel.high.length > 0) {
      console.log('Top High-Confidence Matches:');
      byLevel.high.slice(0, 5).forEach(({ pair, analysis }) => {
        console.log(`  ✓ ${pair.description} (${analysis.confidence.toFixed(0)}%)`);
        console.log(`    Polymarket: ${pair.polymarketMarket.title.substring(0, 60)}`);
        console.log(`    Reasons: ${analysis.reasons.join(', ')}\n`);
      });
    }
  }

  /**
   * Find the best matching market using multi-strategy analysis
   */
  private async findBestMatch(
    target: Market,
    candidates: Market[]
  ): Promise<{ market: Market; analysis: MatchAnalysis } | null> {
    let bestMatch: Market | null = null;
    let bestAnalysis: MatchAnalysis | null = null;

    for (const candidate of candidates) {
      const analysis = await this.analyzeMatch(target, candidate);

      if (!bestAnalysis || analysis.confidence > bestAnalysis.confidence) {
        bestAnalysis = analysis;
        bestMatch = candidate;
      }
    }

    return bestMatch && bestAnalysis ? { market: bestMatch, analysis: bestAnalysis } : null;
  }

  /**
   * Comprehensive match analysis using normalizers, feature extraction, and scoring strategy
   */
  private async analyzeMatch(market1: Market, market2: Market): Promise<MatchAnalysis> {
    const normalizedMarket1: Market = {
      ...market1,
      title: this.kalshiNormalizer.normalizeTitle(market1.title),
      description: this.kalshiNormalizer.normalizeDescription(market1.description || '')
    };

    const normalizedMarket2: Market = {
      ...market2,
      title: this.polymarketNormalizer.normalizeTitle(market2.title),
      description: this.polymarketNormalizer.normalizeDescription(market2.description || '')
    };

    const features: FeatureVector = await this.featureExtractor.extractFeatures(
      normalizedMarket1,
      normalizedMarket2
    );

    const confidence = this.strategy.calculateScore(features, market1, market2);
    const reasons = this.generateReasons(features, market1, market2);

    let level: 'high' | 'medium' | 'low' | 'uncertain';
    if (confidence >= 80) level = 'high';
    else if (confidence >= 60) level = 'medium';
    else if (confidence >= 40) level = 'low';
    else level = 'uncertain';

    // Diagnostic logging for feature-level analysis
    console.log(`\n[DEBUG] ${market1.title.substring(0, 40)} vs ${market2.title.substring(0, 40)}`);
    console.log(`  titleSimilarity: ${features.titleSimilarity.toFixed(1)}% (conf: ${features.featureConfidence.titleSimilarity.toFixed(2)})`);
    console.log(`  keywordOverlap: ${features.keywordOverlap.toFixed(1)}% (conf: ${features.featureConfidence.keywordOverlap.toFixed(2)})`);
    console.log(`  embeddingSimilarity: ${features.embeddingSimilarity?.toFixed(1) ?? 'N/A'}% (conf: ${features.featureConfidence.embeddingSimilarity?.toFixed(2) ?? 'N/A'})`);
    console.log(`  categoryMatch: ${features.categoryMatch} (conf: ${features.featureConfidence.categoryMatch.toFixed(2)})`);
    console.log(`  → Final confidence: ${confidence.toFixed(1)}% (level: ${level})`);

    return {
      titleSimilarity: features.titleSimilarity,
      descriptionSimilarity: features.descriptionSimilarity,
      keywordOverlap: features.keywordOverlap,
      embeddingSimilarity: features.embeddingSimilarity,
      categoryMatch: features.categoryMatch === 1,
      timingMatch: features.timingMatch === 1,
      confidence,
      level,
      reasons
    };
  }

  /**
   * Generate human-readable reasons for match confidence
   */
  private generateReasons(features: FeatureVector, market1: Market, _market2: Market): string[] {
    const reasons: string[] = [];

    if (features.titleSimilarity >= 80) {
      reasons.push(`High title match (${features.titleSimilarity.toFixed(0)}%)`);
    } else if (features.titleSimilarity >= 50) {
      reasons.push(`Moderate title match (${features.titleSimilarity.toFixed(0)}%)`);
    }

    if (features.descriptionSimilarity >= 60) {
      reasons.push(`Description overlap (${features.descriptionSimilarity.toFixed(0)}%)`);
    }

    if (features.keywordOverlap >= 50) {
      reasons.push(`Keyword match (${features.keywordOverlap.toFixed(0)}%)`);
    }

    if (features.embeddingSimilarity >= 70) {
      reasons.push(`Semantic match (${features.embeddingSimilarity.toFixed(0)}%)`);
    }

    if (features.categoryMatch === 1) {
      const cats = this.extractCategories(market1);
      if (cats.length > 0) {
        reasons.push(`Category: ${cats[0]}`);
      }
    }

    if (features.timingMatch === 1) {
      reasons.push('Similar dates');
    }

    if (features.featureConfidence.embeddingSimilarity < 1.0) {
      reasons.push('⚠️ Embedding fallback used');
    }

    return reasons;
  }

  /**
   * Extract market categories
   */
  private extractCategories(market: Market): string[] {
    const categories: string[] = [];
    const text = (market.title + ' ' + market.description).toLowerCase();

    if (/\b(nfl|nba|mlb|nhl|soccer|football|basketball|baseball|hockey)\b/.test(text)) {
      categories.push('sports');
    }
    if (/\b(election|vote|president|senate|congress|democrat|republican|caucus)\b/.test(text)) {
      categories.push('politics');
    }
    if (/\b(bitcoin|ethereum|crypto|btc|eth|blockchain|token|defi)\b/.test(text)) {
      categories.push('crypto');
    }
    if (/\b(fed|rate|inflation|gdp|recession|market|stock|economy)\b/.test(text)) {
      categories.push('economy');
    }
    if (/\b(ai|gpt|openai|tech|software|app|google|apple|microsoft)\b/.test(text)) {
      categories.push('technology');
    }

    const tags = market.metadata?.tags || [];
    categories.push(...tags
      .filter((t: any) => typeof t === 'string')
      .map((t: string) => t.toLowerCase())
    );

    return [...new Set(categories)];
  }

  /**
   * Load market mappings from configuration
   */
  async loadMappings(_filePath?: string): Promise<MarketPair[]> {
    // In production, this would load from a JSON file
    // For now, return empty array
    return [];
  }
}