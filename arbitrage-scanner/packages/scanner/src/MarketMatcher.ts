import { Market, MarketPair, IExchange } from '@arb/core';

export interface MatchAnalysis {
  titleSimilarity: number;
  descriptionSimilarity: number;
  keywordOverlap: number;
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
}

export class MarketMatcher {
  private readonly config: MatcherConfig;

  constructor(config: MatcherConfig = {}) {
    this.config = {
      minConfidence: config.minConfidence ?? 55,
      includeLowConfidence: config.includeLowConfidence ?? true,
      includeUncertain: config.includeUncertain ?? false
    };
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
    console.log('[MarketMatcher] Analyzing matches...\n');

    const pairs: MarketPair[] = [];
    const allMatches: Array<{ pair: MarketPair; analysis: MatchAnalysis }> = [];

    for (const kMarket of kalshiMarkets) {
      const match = this.findBestMatch(kMarket, polyMarkets);

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
  private findBestMatch(
    target: Market,
    candidates: Market[]
  ): { market: Market; analysis: MatchAnalysis } | null {
    let bestMatch: Market | null = null;
    let bestAnalysis: MatchAnalysis | null = null;

    for (const candidate of candidates) {
      const analysis = this.analyzeMatch(target, candidate);

      if (!bestAnalysis || analysis.confidence > bestAnalysis.confidence) {
        bestAnalysis = analysis;
        bestMatch = candidate;
      }
    }

    return bestMatch && bestAnalysis ? { market: bestMatch, analysis: bestAnalysis } : null;
  }

  /**
   * Comprehensive match analysis using multiple strategies
   */
  private analyzeMatch(market1: Market, market2: Market): MatchAnalysis {
    const titleSimilarity = this.calculateTitleSimilarity(market1.title, market2.title);
    const descriptionSimilarity = this.calculateDescriptionSimilarity(
      market1.description,
      market2.description
    );
    const keywordOverlap = this.calculateKeywordOverlap(
      market1.title + ' ' + market1.description,
      market2.title + ' ' + market2.description
    );
    const categoryMatch = this.checkCategoryMatch(market1, market2);
    const timingMatch = this.checkTimingMatch(market1, market2);

    const { confidence, reasons } = this.calculateConfidence({
      titleSimilarity,
      descriptionSimilarity,
      keywordOverlap,
      categoryMatch,
      timingMatch,
      confidence: 0,
      level: 'uncertain',
      reasons: []
    }, market1, market2);

    let level: 'high' | 'medium' | 'low' | 'uncertain';
    if (confidence >= 80) level = 'high';
    else if (confidence >= 60) level = 'medium';
    else if (confidence >= 40) level = 'low';
    else level = 'uncertain';

    return {
      titleSimilarity,
      descriptionSimilarity,
      keywordOverlap,
      categoryMatch,
      timingMatch,
      confidence,
      level,
      reasons
    };
  }

  /**
   * Calculate title similarity using fuzzy matching
   */
  private calculateTitleSimilarity(title1: string, title2: string): number {
    const t1 = this.normalize(title1);
    const t2 = this.normalize(title2);

    if (t1 === t2) return 100;

    // Levenshtein-based similarity
    const distance = this.levenshteinDistance(t1, t2);
    const maxLen = Math.max(t1.length, t2.length);
    const similarity = maxLen > 0 ? (1 - distance / maxLen) * 100 : 0;

    // Substring match bonus
    if (t1.includes(t2) || t2.includes(t1)) {
      return Math.min(100, similarity + 20);
    }

    // Word overlap
    const words1 = new Set(t1.split(/\s+/));
    const words2 = new Set(t2.split(/\s+/));
    const commonWords = [...words1].filter(w => words2.has(w)).length;
    const totalWords = Math.max(words1.size, words2.size);
    const wordOverlap = totalWords > 0 ? (commonWords / totalWords) * 100 : 0;

    return Math.max(similarity, wordOverlap);
  }

  /**
   * Calculate description similarity
   */
  private calculateDescriptionSimilarity(desc1: string, desc2: string): number {
    const d1 = this.normalize(desc1);
    const d2 = this.normalize(desc2);

    const phrases1 = new Set(d1.split(/\s+/).filter(w => w.length >= 3));
    const phrases2 = new Set(d2.split(/\s+/).filter(w => w.length >= 3));

    const common = [...phrases1].filter(p => phrases2.has(p)).length;
    const total = Math.max(phrases1.size, phrases2.size);

    return total > 0 ? (common / total) * 100 : 0;
  }

  /**
   * Calculate keyword overlap
   */
  private calculateKeywordOverlap(text1: string, text2: string): number {
    const keywords1 = this.extractKeywords(text1);
    const keywords2 = this.extractKeywords(text2);

    const common = keywords1.filter(k => keywords2.includes(k)).length;
    const total = Math.max(keywords1.length, keywords2.length);

    return total > 0 ? (common / total) * 100 : 0;
  }

  /**
   * Calculate overall confidence score
   */
  private calculateConfidence(
    signals: MatchAnalysis,
    market1: Market,
    market2: Market
  ): { confidence: number; reasons: string[] } {
    const reasons: string[] = [];
    let confidence = 0;

    // Title similarity (0-30 points) - Reduced weight, less reliable
    confidence += (signals.titleSimilarity / 100) * 30;
    if (signals.titleSimilarity >= 80) {
      reasons.push(`High title match (${signals.titleSimilarity.toFixed(0)}%)`);
    } else if (signals.titleSimilarity >= 50) {
      reasons.push(`Moderate title match (${signals.titleSimilarity.toFixed(0)}%)`);
    }

    // Description similarity (0-20 points) - Reduced weight
    confidence += (signals.descriptionSimilarity / 100) * 20;
    if (signals.descriptionSimilarity >= 60) {
      reasons.push(`Description overlap (${signals.descriptionSimilarity.toFixed(0)}%)`);
    }

    // Keyword overlap (0-30 points) - Increased weight, proven reliable
    confidence += (signals.keywordOverlap / 100) * 30;
    if (signals.keywordOverlap >= 50) {
      reasons.push(`Keyword match (${signals.keywordOverlap.toFixed(0)}%)`);
    }

    // Category match (0-15 points) - Increased weight, strong signal
    if (signals.categoryMatch) {
      confidence += 15;
      const cats = this.extractCategories(market1);
      if (cats.length > 0) {
        reasons.push(`Category: ${cats[0]}`);
      }
    }

    // Timing match (0-5 points)
    if (signals.timingMatch) {
      confidence += 5;
      reasons.push('Similar dates');
    }

    // Penalty for very different lengths
    const len1 = (market1.title + market1.description).length;
    const len2 = (market2.title + market2.description).length;
    const lengthRatio = Math.min(len1, len2) / Math.max(len1, len2);
    if (lengthRatio < 0.3) {
      confidence *= 0.8;
      reasons.push('⚠️ Different lengths');
    }

    return { confidence: Math.min(100, Math.max(0, confidence)), reasons };
  }

  /**
   * Extract keywords from text
   */
  private extractKeywords(text: string): string[] {
    // Remove common words and split
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at',
      'to', 'for', 'of', 'with', 'by', 'from', 'will', 'be',
      'is', 'are', 'was', 'were', 'been', 'being', 'have',
      'has', 'had', 'do', 'does', 'did', 'this', 'that'
    ]);

    return text
      .split(/\W+/)
      .filter(word => word.length > 2 && !stopWords.has(word));
  }

  /**
   * Check if markets are in same category
   */
  private checkCategoryMatch(market1: Market, market2: Market): boolean {
    const categories1 = this.extractCategories(market1);
    const categories2 = this.extractCategories(market2);
    return categories1.some(c => categories2.includes(c));
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
    categories.push(...tags.map((t: string) => t.toLowerCase()));

    return [...new Set(categories)];
  }

  /**
   * Check if timing/dates match
   */
  private checkTimingMatch(market1: Market, market2: Market): boolean {
    if (!market1.closeTime || !market2.closeTime) {
      return false;
    }
    const diff = Math.abs(market1.closeTime.getTime() - market2.closeTime.getTime());
    const daysDiff = diff / (1000 * 60 * 60 * 24);
    return daysDiff <= 7;
  }

  /**
   * Normalize text for comparison
   */
  private normalize(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Calculate Levenshtein distance
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;
    const dp: number[][] = Array(m + 1)
      .fill(0)
      .map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
    }

    return dp[m][n];
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