import { Market, MarketPair, CrossExchangePair } from '@arb/core';

/**
 * Resolution criteria extracted from market metadata
 */
export interface ResolutionCriteria {
  // Raw text
  rawText: string;

  // Parsed components
  sources: string[];          // e.g., ["New York Times", "White House"]
  timing: string | null;      // e.g., "by end of 2025", "within 24 hours"
  conditions: string[];       // Key conditions that must be met
  flexibility: 'strict' | 'flexible' | 'unknown';

  // Metadata
  platform: 'KALSHI' | 'POLYMARKET';
  marketId: string;
}

/**
 * Alignment analysis between two markets
 */
export interface ResolutionAlignment {
  score: number;              // 0-100, higher = more aligned
  level: 'high' | 'medium' | 'low' | 'critical';

  // Detailed comparison
  sourcesMatch: boolean;
  timingMatch: boolean;
  conditionsMatch: boolean;

  // Risk assessment
  risks: string[];
  warnings: string[];

  // Recommendations
  tradeable: boolean;         // Safe to trade?
  requiresReview: boolean;    // Needs manual review?
}

/**
 * Analyzes and compares resolution criteria between platforms
 */
export class ResolutionAnalyzer {

  /**
   * Extract resolution criteria from a market
   */
  extractCriteria(market: Market): ResolutionCriteria {
    const metadata = market.metadata || {};

    if (market.exchange === 'KALSHI') {
      return this.extractKalshiCriteria(market, metadata);
    } else if (market.exchange === 'POLYMARKET') {
      return this.extractPolymarketCriteria(market, metadata);
    }

    // Fallback for unknown exchanges
    return {
      rawText: market.description || '',
      sources: [],
      timing: null,
      conditions: [],
      flexibility: 'unknown',
      platform: market.exchange as any,
      marketId: market.id
    };
  }

  /**
   * Extract Kalshi resolution criteria
   */
  private extractKalshiCriteria(market: Market, metadata: any): ResolutionCriteria {
    const rawText = metadata.rulesPrimary || metadata.rulesSecondary || market.description || '';

    // Kalshi typically has strict source requirements
    const sources = this.extractSources(rawText, ['New York Times', 'NYT', 'White House', 'official']);
    const timing = this.extractTiming(rawText);
    const conditions = this.extractConditions(rawText);

    return {
      rawText,
      sources: sources.length > 0 ? sources : ['official source'],
      timing,
      conditions,
      flexibility: sources.length > 0 ? 'strict' : 'flexible',
      platform: 'KALSHI',
      marketId: market.id
    };
  }

  /**
   * Extract Polymarket resolution criteria
   */
  private extractPolymarketCriteria(market: Market, metadata: any): ResolutionCriteria {
    const rawText = metadata.resolutionRules || market.description || '';

    // Polymarket often has more flexible criteria
    const sources = this.extractSources(rawText, ['credible source', 'official', 'reported']);
    const timing = this.extractTiming(rawText);
    const conditions = this.extractConditions(rawText);

    return {
      rawText,
      sources,
      timing,
      conditions,
      flexibility: sources.length > 0 ? 'flexible' : 'unknown',
      platform: 'POLYMARKET',
      marketId: market.id
    };
  }

  /**
   * Extract mentioned sources from text
   */
  private extractSources(text: string, keywords: string[]): string[] {
    const sources: string[] = [];
    const lowerText = text.toLowerCase();

    // Common source patterns
    const sourcePatterns = [
      /according to ([^,\.]+)/gi,
      /as reported by ([^,\.]+)/gi,
      /per ([^,\.]+)/gi,
      /source[s]?:\s*([^,\.]+)/gi,
      /(new york times|nyt|white house|official|credible)/gi
    ];

    for (const pattern of sourcePatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) {
          sources.push(match[1].trim());
        }
      }
    }

    // Check for keyword matches
    for (const keyword of keywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        if (!sources.some(s => s.toLowerCase().includes(keyword.toLowerCase()))) {
          sources.push(keyword);
        }
      }
    }

    return [...new Set(sources)]; // Remove duplicates
  }

  /**
   * Extract timing requirements from text
   */
  private extractTiming(text: string): string | null {
    const timingPatterns = [
      /by (end of \d{4})/i,
      /before ([^,\.]+)/i,
      /within (\d+\s+(?:hours?|days?|weeks?|months?))/i,
      /by ([^,\.]+\d{4})/i,
      /(before|after|by) ([A-Z][a-z]+ \d{1,2},? \d{4})/i
    ];

    for (const pattern of timingPatterns) {
      const match = text.match(pattern);
      if (match) {
        return match[0];
      }
    }

    return null;
  }

  /**
   * Extract key conditions from text
   */
  private extractConditions(text: string): string[] {
    const conditions: string[] = [];

    // Split by common separators
    const sentences = text.split(/[.;]/).filter(s => s.trim().length > 10);

    // Look for conditional keywords
    const conditionalKeywords = [
      'if', 'must', 'will', 'shall', 'required', 'only if', 'provided that'
    ];

    for (const sentence of sentences) {
      const lowerSentence = sentence.toLowerCase();
      if (conditionalKeywords.some(kw => lowerSentence.includes(kw))) {
        conditions.push(sentence.trim());
      }
    }

    return conditions.slice(0, 5); // Limit to top 5
  }

  /**
   * Compare resolution criteria between two markets
   */
  compareResolution(kalshiMarket: Market, polymarketMarket: Market): ResolutionAlignment {
    const kalshiCriteria = this.extractCriteria(kalshiMarket);
    const polymarketCriteria = this.extractCriteria(polymarketMarket);

    return this.calculateAlignment(kalshiCriteria, polymarketCriteria);
  }

  /**
   * Calculate alignment score between two criteria
   */
  private calculateAlignment(
    criteria1: ResolutionCriteria,
    criteria2: ResolutionCriteria
  ): ResolutionAlignment {
    const risks: string[] = [];
    const warnings: string[] = [];
    let score = 100;

    // Check source alignment
    const sourcesMatch = this.checkSourcesMatch(criteria1.sources, criteria2.sources);
    if (!sourcesMatch) {
      score -= 40;
      risks.push('Different resolution sources - markets may resolve differently');
    }

    // Check timing alignment
    const timingMatch = this.checkTimingMatch(criteria1.timing, criteria2.timing);
    if (!timingMatch && (criteria1.timing || criteria2.timing)) {
      score -= 20;
      warnings.push('Different timing requirements - resolution dates may differ');
    }

    // Check conditions alignment
    const conditionsMatch = this.checkConditionsMatch(criteria1.conditions, criteria2.conditions);
    if (!conditionsMatch) {
      score -= 15;
      warnings.push('Different conditions - verify both markets resolve identically');
    }

    // Check flexibility mismatch
    if (criteria1.flexibility === 'strict' && criteria2.flexibility === 'flexible') {
      score -= 15;
      risks.push('Strict vs flexible resolution standards - high risk of divergence');
    }

    // Missing criteria
    if (!criteria1.rawText || criteria1.rawText.length < 20) {
      score -= 10;
      warnings.push('Kalshi resolution criteria unclear');
    }
    if (!criteria2.rawText || criteria2.rawText.length < 20) {
      score -= 10;
      warnings.push('Polymarket resolution criteria unclear');
    }

    // Determine level
    let level: 'high' | 'medium' | 'low' | 'critical';
    if (score >= 85) level = 'high';
    else if (score >= 70) level = 'medium';
    else if (score >= 50) level = 'low';
    else level = 'critical';

    // Determine tradeability
    const tradeable = score >= 70 && risks.length === 0;
    const requiresReview = score < 85 || risks.length > 0;

    return {
      score,
      level,
      sourcesMatch,
      timingMatch,
      conditionsMatch,
      risks,
      warnings,
      tradeable,
      requiresReview
    };
  }

  /**
   * Check if sources match between criteria
   */
  private checkSourcesMatch(sources1: string[], sources2: string[]): boolean {
    if (sources1.length === 0 || sources2.length === 0) {
      return false; // Can't verify
    }

    // Normalize sources for comparison
    const normalize = (s: string) => s.toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[,\.]/g, '')
      .trim();

    const sources1Lower = sources1.map(normalize);
    const sources2Lower = sources2.map(normalize);

    // Common source keywords that indicate alignment
    const commonSourceKeywords = [
      'associated press', 'ap',
      'fox news', 'fox',
      'nbc', 'cnn', 'abc',
      'official', 'state certification',
      'media consensus', 'media calls', 'media projections'
    ];

    // Check if both contain any common source keyword
    for (const keyword of commonSourceKeywords) {
      const in1 = sources1Lower.some(s => s.includes(keyword));
      const in2 = sources2Lower.some(s => s.includes(keyword));
      if (in1 && in2) {
        return true; // Both reference same authoritative source
      }
    }

    // Look for overlapping sources (substring match)
    for (const s1 of sources1Lower) {
      for (const s2 of sources2Lower) {
        if (s1.includes(s2) || s2.includes(s1)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check if timing matches
   */
  private checkTimingMatch(timing1: string | null, timing2: string | null): boolean {
    if (!timing1 || !timing2) {
      return true; // No timing specified = match
    }

    // Simple string comparison for now
    // Could be enhanced with date parsing
    return timing1.toLowerCase().includes(timing2.toLowerCase()) ||
           timing2.toLowerCase().includes(timing1.toLowerCase());
  }

  /**
   * Check if conditions match
   */
  private checkConditionsMatch(conditions1: string[], conditions2: string[]): boolean {
    if (conditions1.length === 0 && conditions2.length === 0) {
      return true; // No conditions = match
    }

    if (conditions1.length === 0 || conditions2.length === 0) {
      return false; // One has conditions, other doesn't
    }

    // Check for similar wording (simple heuristic)
    const combined1 = conditions1.join(' ').toLowerCase();
    const combined2 = conditions2.join(' ').toLowerCase();

    // Count common words (>3 letters)
    const words1 = combined1.split(/\s+/).filter(w => w.length > 3);
    const words2 = combined2.split(/\s+/).filter(w => w.length > 3);

    const commonWords = words1.filter(w => words2.includes(w));
    const similarity = commonWords.length / Math.max(words1.length, words2.length);

    return similarity > 0.3; // 30% word overlap
  }

  /**
   * Analyze a cross-exchange pair for resolution alignment
   */
  analyzeCrossExchangePair(pair: CrossExchangePair): ResolutionAlignment {
    return this.compareResolution(pair.market1, pair.market2);
  }

  /**
   * Analyze a market pair for resolution alignment
   * @deprecated Use analyzeCrossExchangePair instead
   */
  analyzeMarketPair(pair: MarketPair): ResolutionAlignment {
    return this.compareResolution(pair.kalshiMarket, pair.polymarketMarket);
  }
}
