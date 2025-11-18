import { Market, MarketPair, IExchange } from '@arb/core';

export class MarketMatcher {

  /**
   * Match markets across exchanges based on similarity
   */
  async matchMarkets(
    kalshi: IExchange,
    polymarket: IExchange
  ): Promise<MarketPair[]> {
    const [kalshiMarkets, polyMarkets] = await Promise.all([
      kalshi.getMarkets(),
      polymarket.getMarkets()
    ]);

    const pairs: MarketPair[] = [];

    for (const kMarket of kalshiMarkets) {
      const match = this.findBestMatch(kMarket, polyMarkets);

      if (match && match.score > 0.7) { // 70% similarity threshold
        pairs.push({
          id: `${kMarket.id}_${match.market.id}`,
          description: kMarket.title,
          kalshiMarket: kMarket,
          polymarketMarket: match.market,
          kalshiId: kMarket.id,
          polymarketId: match.market.id,
          correlationScore: match.score
        });
      }
    }

    return pairs;
  }

  /**
   * Find the best matching market using string similarity
   */
  private findBestMatch(
    target: Market,
    candidates: Market[]
  ): { market: Market; score: number } | null {
    let bestMatch: Market | null = null;
    let bestScore = 0;

    for (const candidate of candidates) {
      const score = this.calculateSimilarity(target, candidate);

      if (score > bestScore) {
        bestScore = score;
        bestMatch = candidate;
      }
    }

    return bestMatch ? { market: bestMatch, score: bestScore } : null;
  }

  /**
   * Calculate similarity between two markets
   */
  private calculateSimilarity(market1: Market, market2: Market): number {
    // Combine title and description for comparison
    const text1 = `${market1.title} ${market1.description}`.toLowerCase();
    const text2 = `${market2.title} ${market2.description}`.toLowerCase();

    // Simple word-based similarity
    const words1 = this.extractKeywords(text1);
    const words2 = this.extractKeywords(text2);

    // Calculate Jaccard similarity
    const intersection = words1.filter(w => words2.includes(w)).length;
    const union = new Set([...words1, ...words2]).size;

    if (union === 0) return 0;

    const similarity = intersection / union;

    // Boost score if key terms match
    const keyTermBoost = this.checkKeyTerms(text1, text2);

    return Math.min(1, similarity + keyTermBoost);
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
   * Check for important matching terms
   */
  private checkKeyTerms(text1: string, text2: string): number {
    const importantTerms = [
      // Sports
      ['nfl', 'football'],
      ['nba', 'basketball'],
      ['mlb', 'baseball'],
      ['raiders', 'cowboys', 'patriots', 'chiefs'],

      // Politics
      ['election', 'president', 'presidential'],
      ['democrat', 'republican'],
      ['trump', 'biden', 'desantis'],

      // Finance
      ['bitcoin', 'btc', 'ethereum', 'eth'],
      ['stock', 'spy', 'nasdaq'],
      ['fed', 'rates', 'inflation']
    ];

    let boost = 0;
    for (const terms of importantTerms) {
      const match1 = terms.some(term => text1.includes(term));
      const match2 = terms.some(term => text2.includes(term));

      if (match1 && match2) {
        boost += 0.1; // 10% boost for each matching important term group
      }
    }

    return boost;
  }

  /**
   * Load market mappings from configuration
   */
  async loadMappings(filePath?: string): Promise<MarketPair[]> {
    // In production, this would load from a JSON file
    // For now, return empty array
    return [];
  }
}