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
 * Parsed timing information with date extraction
 */
export interface ParsedTiming {
  rawText: string | null;
  date: Date | null;
  confidence: number;  // 0-1 how confident we are in the parse
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
  temporalDistance?: number;  // Days between resolution dates, if known

  // Risk assessment
  risks: string[];
  warnings: string[];
  polymarket5050Risk?: boolean;  // Polymarket 50-50 outcome flag

  // Recommendations
  tradeable: boolean;         // Safe to trade?
  requiresReview: boolean;    // Needs manual review?
}

/**
 * Analyzes and compares resolution criteria between platforms
 */
export class ResolutionAnalyzer {
  private minThreshold: number = 40;  // Lowered to allow more opportunities through

  /**
   * Set minimum threshold for tradeable opportunities
   */
  setMinThreshold(threshold: number): void {
    if (threshold < 0 || threshold > 100) {
      throw new Error('Threshold must be between 0 and 100');
    }
    this.minThreshold = threshold;
  }

  /**
   * Get current minimum threshold
   */
  getMinThreshold(): number {
    return this.minThreshold;
  }

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
   * Parse timing text into a structured date with confidence score
   */
  parseTiming(text: string | null): ParsedTiming {
    if (!text) {
      return { rawText: null, date: null, confidence: 0 };
    }

    const normalizedText = text.trim();

    // Month name mappings
    const months: Record<string, number> = {
      'january': 0, 'jan': 0,
      'february': 1, 'feb': 1,
      'march': 2, 'mar': 2,
      'april': 3, 'apr': 3,
      'may': 4,
      'june': 5, 'jun': 5,
      'july': 6, 'jul': 6,
      'august': 7, 'aug': 7,
      'september': 8, 'sep': 8, 'sept': 8,
      'october': 9, 'oct': 9,
      'november': 10, 'nov': 10,
      'december': 11, 'dec': 11
    };

    // Pattern 1: "December 31, 2024" or "Dec 31 2024"
    const fullDatePattern = /([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})/i;
    let match = normalizedText.match(fullDatePattern);
    if (match) {
      const monthName = match[1].toLowerCase();
      const day = parseInt(match[2], 10);
      const year = parseInt(match[3], 10);
      const monthNum = months[monthName];
      if (monthNum !== undefined && day >= 1 && day <= 31 && year >= 2020 && year <= 2100) {
        return {
          rawText: normalizedText,
          date: new Date(year, monthNum, day),
          confidence: 0.95
        };
      }
    }

    // Pattern 2: "12/31/2024" or "12-31-2024" (US format)
    const usDatePattern = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/;
    match = normalizedText.match(usDatePattern);
    if (match) {
      const month = parseInt(match[1], 10) - 1;
      const day = parseInt(match[2], 10);
      const year = parseInt(match[3], 10);
      if (month >= 0 && month <= 11 && day >= 1 && day <= 31 && year >= 2020 && year <= 2100) {
        return {
          rawText: normalizedText,
          date: new Date(year, month, day),
          confidence: 0.90
        };
      }
    }

    // Pattern 3: "2024-12-31" (ISO format)
    const isoDatePattern = /(\d{4})-(\d{2})-(\d{2})/;
    match = normalizedText.match(isoDatePattern);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1;
      const day = parseInt(match[3], 10);
      if (month >= 0 && month <= 11 && day >= 1 && day <= 31 && year >= 2020 && year <= 2100) {
        return {
          rawText: normalizedText,
          date: new Date(year, month, day),
          confidence: 0.95
        };
      }
    }

    // Pattern 4: "end of 2024" or "by end of 2025"
    const endOfYearPattern = /end\s+of\s+(\d{4})/i;
    match = normalizedText.match(endOfYearPattern);
    if (match) {
      const year = parseInt(match[1], 10);
      if (year >= 2020 && year <= 2100) {
        return {
          rawText: normalizedText,
          date: new Date(year, 11, 31), // December 31st
          confidence: 0.80
        };
      }
    }

    // Pattern 5: Just year mentioned "2025" or "in 2025"
    const yearOnlyPattern = /(?:in\s+)?(\d{4})(?!\d)/;
    match = normalizedText.match(yearOnlyPattern);
    if (match) {
      const year = parseInt(match[1], 10);
      if (year >= 2020 && year <= 2100) {
        return {
          rawText: normalizedText,
          date: new Date(year, 11, 31), // Default to end of year
          confidence: 0.50
        };
      }
    }

    // Pattern 6: Relative timing "within X days/weeks/months"
    const relativePattern = /within\s+(\d+)\s+(day|week|month)s?/i;
    match = normalizedText.match(relativePattern);
    if (match) {
      const amount = parseInt(match[1], 10);
      const unit = match[2].toLowerCase();
      const now = new Date();
      let futureDate = new Date(now);

      if (unit === 'day') futureDate.setDate(now.getDate() + amount);
      else if (unit === 'week') futureDate.setDate(now.getDate() + amount * 7);
      else if (unit === 'month') futureDate.setMonth(now.getMonth() + amount);

      return {
        rawText: normalizedText,
        date: futureDate,
        confidence: 0.60
      };
    }

    return { rawText: normalizedText, date: null, confidence: 0 };
  }

  /**
   * Calculate days between two dates
   */
  private daysBetween(date1: Date, date2: Date): number {
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.abs(Math.round((date1.getTime() - date2.getTime()) / msPerDay));
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

    return this.calculateAlignment(kalshiCriteria, polymarketCriteria, polymarketMarket);
  }

  /**
   * Calculate alignment score between two criteria
   */
  private calculateAlignment(
    criteria1: ResolutionCriteria,
    criteria2: ResolutionCriteria,
    market2?: Market
  ): ResolutionAlignment {
    const risks: string[] = [];
    const warnings: string[] = [];
    let score = 100;
    let polymarket5050Risk = false;

    // Check source alignment
    const sourcesMatch = this.checkSourcesMatch(criteria1.sources, criteria2.sources);
    if (!sourcesMatch) {
      score -= 40;
      risks.push('Different resolution sources - markets may resolve differently');
    }

    // Check timing alignment with date parsing
    const timingResult = this.checkTimingMatch(criteria1.timing, criteria2.timing);
    const timingMatch = timingResult.match;
    const temporalDistance = timingResult.temporalDistance;

    if (!timingMatch && (criteria1.timing || criteria2.timing)) {
      score -= 20;
      if (temporalDistance !== undefined) {
        warnings.push(`Different timing requirements - resolution dates differ by ${temporalDistance} days`);
      } else {
        warnings.push('Different timing requirements - resolution dates may differ');
      }
    } else if (temporalDistance !== undefined && temporalDistance > 0) {
      // Even if within tolerance, note the difference
      if (temporalDistance > 3) {
        score -= 5; // Small penalty for dates within tolerance but not exact
        warnings.push(`Resolution dates differ by ${temporalDistance} days (within tolerance)`);
      }
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

    // Check for Polymarket 50-50 outcome risk
    if (market2 && market2.metadata?.is_50_50_outcome === true) {
      polymarket5050Risk = true;
      score -= 5;  // Small score penalty
      warnings.push('Polymarket 50-50 outcome risk detected - position size will be reduced 50%');
    }

    // Missing criteria
    if (!criteria1.rawText || criteria1.rawText.length < 20) {
      score -= 10;
      warnings.push('Market 1 resolution criteria unclear');
    }
    if (!criteria2.rawText || criteria2.rawText.length < 20) {
      score -= 10;
      warnings.push('Market 2 resolution criteria unclear');
    }

    // Determine level (relative to threshold)
    let level: 'high' | 'medium' | 'low' | 'critical';
    if (score >= 85) level = 'high';
    else if (score >= this.minThreshold + 5) level = 'medium';
    else if (score >= this.minThreshold - 15) level = 'low';
    else level = 'critical';

    // Check for critical risks that should block trading
    const hasCriticalRisk = risks.some(r =>
      r.includes('Strict vs flexible') // This is a genuinely high-risk scenario
    );

    // Determine tradeability - allow trading if score meets threshold
    // Warnings and minor risks are ok, but critical risks block trading
    const tradeable = score >= this.minThreshold && !hasCriticalRisk && level !== 'critical';
    const requiresReview = score < 85 || risks.length > 0;

    return {
      score,
      level,
      sourcesMatch,
      timingMatch,
      conditionsMatch,
      temporalDistance,
      risks,
      warnings,
      polymarket5050Risk,
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
   * Check if timing matches with date parsing and tolerance
   * @param timing1 First timing string
   * @param timing2 Second timing string
   * @param toleranceDays Days of tolerance for matching (default 7)
   * @returns Object with match status and temporal distance if dates were parsed
   */
  private checkTimingMatch(
    timing1: string | null,
    timing2: string | null,
    toleranceDays: number = 7
  ): { match: boolean; temporalDistance?: number } {
    if (!timing1 || !timing2) {
      return { match: true }; // No timing specified = match
    }

    // Try to parse both timings as dates
    const parsed1 = this.parseTiming(timing1);
    const parsed2 = this.parseTiming(timing2);

    // If both dates were parsed with reasonable confidence
    if (parsed1.date && parsed2.date && parsed1.confidence >= 0.5 && parsed2.confidence >= 0.5) {
      const daysDiff = this.daysBetween(parsed1.date, parsed2.date);

      // Dates match if within tolerance
      const match = daysDiff <= toleranceDays;

      return {
        match,
        temporalDistance: daysDiff
      };
    }

    // Fallback to string comparison if dates couldn't be parsed
    const match = timing1.toLowerCase().includes(timing2.toLowerCase()) ||
                  timing2.toLowerCase().includes(timing1.toLowerCase());

    return { match };
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
