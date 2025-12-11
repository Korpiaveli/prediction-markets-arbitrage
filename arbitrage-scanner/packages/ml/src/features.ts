/**
 * Feature Extraction Module
 *
 * Extracts ML features from market pairs for model input.
 * Features are designed to capture the signals that predict:
 * 1. Whether two markets will match (same underlying event)
 * 2. Whether they will resolve identically (low resolution risk)
 */

import { Market, MarketPair } from '@arb/core';
import { FeatureVector } from './types';
import { EmbeddingService } from './embeddings';

export class FeatureExtractor {
  private readonly stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at',
    'to', 'for', 'of', 'with', 'by', 'from', 'will', 'be',
    'is', 'are', 'was', 'were', 'been', 'being', 'have',
    'has', 'had', 'do', 'does', 'did', 'this', 'that'
  ]);


  private embeddingService?: EmbeddingService;

  constructor(embeddingService?: EmbeddingService) {
    this.embeddingService = embeddingService;
  }

  /**
   * Extract feature vector from a market pair
   */
  async extractFeatures(kalshiMarket: Market, polyMarket: Market): Promise<FeatureVector> {
    const titleSimilarity = this.calculateTitleSimilarity(
      kalshiMarket.title,
      polyMarket.title
    );

    const descriptionSimilarity = this.calculateDescriptionSimilarity(
      kalshiMarket.description,
      polyMarket.description
    );

    const keywordOverlap = this.calculateKeywordOverlap(
      kalshiMarket.title + ' ' + kalshiMarket.description,
      polyMarket.title + ' ' + polyMarket.description
    );

    const categoryMatch = this.checkCategoryMatch(kalshiMarket, polyMarket) ? 1 : 0;
    const timingMatch = this.checkTimingMatch(kalshiMarket, polyMarket) ? 1 : 0;
    const sourcesMatch = this.checkSourcesMatch(kalshiMarket, polyMarket) ? 1 : 0;

    const alignmentScore = this.calculateAlignmentScore(
      kalshiMarket,
      polyMarket,
      sourcesMatch === 1,
      timingMatch === 1
    );

    const volumeRatio = this.calculateVolumeRatio(kalshiMarket, polyMarket);
    const priceCorrelation = this.calculatePriceCorrelation(kalshiMarket, polyMarket);
    const lengthRatio = this.calculateLengthRatio(kalshiMarket, polyMarket);
    const avgWordCount = this.calculateAvgWordCount(kalshiMarket, polyMarket);

    // Calculate embedding similarity with fallback
    let embeddingSimilarity = 0;
    let embeddingConfidence = 1.0;

    if (this.embeddingService && this.embeddingService.isReady()) {
      try {
        const text1 = kalshiMarket.title + ' ' + kalshiMarket.description;
        const text2 = polyMarket.title + ' ' + polyMarket.description;
        embeddingSimilarity = await this.embeddingService.calculateSimilarity(text1, text2);
      } catch (error) {
        console.warn('[FeatureExtractor] Embedding service failed, using fallback:', error);
        embeddingSimilarity = (titleSimilarity + descriptionSimilarity + keywordOverlap) / 3;
        embeddingConfidence = 0.3;
      }
    } else {
      embeddingSimilarity = (titleSimilarity + descriptionSimilarity + keywordOverlap) / 3;
      embeddingConfidence = 0.3;
    }

    const temporalDistance = this.calculateTemporalDistance(kalshiMarket, polyMarket);
    const outcomeMatch = this.checkOutcomeMatch(kalshiMarket, polyMarket) ? 1 : 0;

    // Critical: Check geographic/subject scope match
    const subjectMatch = this.checkSubjectMatch(kalshiMarket, polyMarket);

    return {
      titleSimilarity: subjectMatch.match ? titleSimilarity : titleSimilarity * 0.3,
      descriptionSimilarity: subjectMatch.match ? descriptionSimilarity : descriptionSimilarity * 0.3,
      keywordOverlap: subjectMatch.match ? keywordOverlap : keywordOverlap * 0.3,
      categoryMatch: subjectMatch.match ? categoryMatch : 0, // Hard fail if different subjects
      timingMatch,
      sourcesMatch,
      alignmentScore: subjectMatch.match ? alignmentScore : Math.min(alignmentScore, 40),
      volumeRatio,
      priceCorrelation,
      lengthRatio,
      avgWordCount,
      embeddingSimilarity: subjectMatch.match ? embeddingSimilarity : embeddingSimilarity * 0.3,
      temporalDistance,
      outcomeMatch,
      featureConfidence: {
        titleSimilarity: subjectMatch.match ? 1.0 : 0.3,
        descriptionSimilarity: subjectMatch.match ? 1.0 : 0.3,
        keywordOverlap: subjectMatch.match ? 1.0 : 0.3,
        categoryMatch: subjectMatch.match ? 1.0 : 0.1,
        timingMatch: 1.0,
        sourcesMatch: 1.0,
        alignmentScore: subjectMatch.match ? 1.0 : 0.3,
        volumeRatio: 1.0,
        priceCorrelation: 1.0,
        lengthRatio: 1.0,
        avgWordCount: 1.0,
        embeddingSimilarity: subjectMatch.match ? embeddingConfidence : 0.1,
        temporalDistance: 1.0,
        outcomeMatch: 1.0
      }
    };
  }

  /**
   * Extract features from a MarketPair object
   */
  async extractFeaturesFromPair(pair: MarketPair): Promise<FeatureVector> {
    return this.extractFeatures(pair.kalshiMarket, pair.polymarketMarket);
  }

  /**
   * Calculate title similarity using Levenshtein distance and word overlap
   */
  private calculateTitleSimilarity(title1: string, title2: string): number {
    const t1 = this.normalize(title1);
    const t2 = this.normalize(title2);

    if (t1 === t2) return 100;

    const distance = this.levenshteinDistance(t1, t2);
    const maxLen = Math.max(t1.length, t2.length);
    const similarity = maxLen > 0 ? (1 - distance / maxLen) * 100 : 0;

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
   * Extract keywords from text
   */
  private extractKeywords(text: string): string[] {
    return this.normalize(text)
      .split(/\W+/)
      .filter(word => word.length > 2 && !this.stopWords.has(word));
  }

  /**
   * Check if markets share a category
   */
  private checkCategoryMatch(market1: Market, market2: Market): boolean {
    const categories1 = this.extractCategories(market1);
    const categories2 = this.extractCategories(market2);
    return categories1.some(c => categories2.includes(c));
  }

  /**
   * Extract categories from market
   */
  private extractCategories(market: Market): string[] {
    const categories: string[] = [];
    const text = (market.title + ' ' + market.description).toLowerCase();

    if (/\b(nfl|nba|mlb|nhl|soccer|football|basketball|baseball|hockey)\b/.test(text)) {
      categories.push('sports');
    }
    if (/\b(election|vote|president|senate|congress|democrat|republican)\b/.test(text)) {
      categories.push('politics');
    }
    if (/\b(bitcoin|ethereum|crypto|btc|eth|blockchain)\b/.test(text)) {
      categories.push('crypto');
    }
    if (/\b(fed|rate|inflation|gdp|recession|economy)\b/.test(text)) {
      categories.push('economy');
    }
    if (/\b(ai|gpt|openai|tech|software|google|apple|microsoft)\b/.test(text)) {
      categories.push('technology');
    }

    return categories;
  }

  /**
   * Check if timing matches (enhanced with year validation)
   */
  private checkTimingMatch(market1: Market, market2: Market): boolean {
    const year1 = this.extractYear(market1.title + ' ' + market1.description);
    const year2 = this.extractYear(market2.title + ' ' + market2.description);

    if (year1 && year2 && year1 !== year2) {
      return false;
    }

    if (!market1.closeTime || !market2.closeTime) return true;
    const diff = Math.abs(market1.closeTime.getTime() - market2.closeTime.getTime());
    const daysDiff = diff / (1000 * 60 * 60 * 24);
    return daysDiff <= 7;
  }

  /**
   * Extract year from text (e.g., "2024", "2028")
   */
  private extractYear(text: string): number | null {
    const yearMatch = text.match(/\b(20\d{2})\b/);
    return yearMatch ? parseInt(yearMatch[1], 10) : null;
  }

  /**
   * Calculate temporal distance between markets
   * Returns 1.0 if same year, 0.3 if adjacent years, 0.0 if 2+ years apart
   */
  private calculateTemporalDistance(market1: Market, market2: Market): number {
    const year1 = this.extractYear(market1.title + ' ' + market1.description);
    const year2 = this.extractYear(market2.title + ' ' + market2.description);

    if (!year1 || !year2) {
      return 0.5;
    }

    const yearDiff = Math.abs(year1 - year2);

    if (yearDiff === 0) return 1.0;
    if (yearDiff === 1) return 0.3;
    return 0.0;
  }

  /**
   * Extract outcome from PredictIt-style title (e.g., "Which party wins House?: Republican")
   */
  private extractOutcome(title: string): string | null {
    const colonMatch = title.match(/:\s*([^:]+)$/);
    if (colonMatch) {
      return colonMatch[1].trim().toLowerCase();
    }
    return null;
  }

  /**
   * Check if outcome matches (for PredictIt multi-outcome contracts)
   * For PredictIt contracts, the outcome MUST appear in the other market's title
   * Also detects opposite outcomes (Republican vs Democrat, Yes vs No)
   */
  private checkOutcomeMatch(market1: Market, market2: Market): boolean {
    const outcome1 = this.extractOutcome(market1.title);
    const outcome2 = this.extractOutcome(market2.title);

    if (!outcome1 && !outcome2) {
      return true;
    }

    const text1 = (market1.title + ' ' + market1.description).toLowerCase();
    const text2 = (market2.title + ' ' + market2.description).toLowerCase();

    // Check for opposite outcomes (mutually exclusive)
    const opposites = [
      ['republican', 'democrat', 'democratic'],
      ['yes', 'no'],
      ['win', 'lose', 'loss'],
      ['increase', 'decrease'],
      ['above', 'below'],
      ['more', 'less', 'fewer']
    ];

    for (const oppositeSet of opposites) {
      const has1 = oppositeSet.some(term => text1.includes(term));
      const has2 = oppositeSet.some(term => text2.includes(term));

      if (has1 && has2) {
        // Both mention terms from same opposite set - check if they're different
        const terms1 = oppositeSet.filter(term => text1.includes(term));
        const terms2 = oppositeSet.filter(term => text2.includes(term));

        // If they have different terms from the opposite set, they're mismatched
        const overlap = terms1.filter(term => terms2.includes(term));
        if (overlap.length === 0) {
          return false;
        }
      }
    }

    // Check if extracted outcome appears in the other market
    if (outcome1 && !text2.includes(outcome1)) {
      return false;
    }

    if (outcome2 && !text1.includes(outcome2)) {
      return false;
    }

    return true;
  }

  /**
   * Check if resolution sources match
   */
  private checkSourcesMatch(market1: Market, market2: Market): boolean {
    const source1 = (market1.metadata?.source || market1.description || '').toLowerCase();
    const source2 = (market2.metadata?.source || market2.description || '').toLowerCase();

    const commonSources = [
      'associated press', 'ap', 'fox news', 'fox', 'nbc', 'cnn', 'abc',
      'official', 'state certification', 'media consensus', 'media calls'
    ];

    for (const source of commonSources) {
      if (source1.includes(source) && source2.includes(source)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Calculate alignment score (simplified ResolutionAnalyzer logic)
   */
  private calculateAlignmentScore(
    market1: Market,
    market2: Market,
    sourcesMatch: boolean,
    timingMatch: boolean
  ): number {
    let score = 100;

    if (!sourcesMatch) score -= 40;
    if (!timingMatch) score -= 20;

    const len1 = (market1.title + market1.description).length;
    const len2 = (market2.title + market2.description).length;
    const lengthRatio = Math.min(len1, len2) / Math.max(len1, len2);
    if (lengthRatio < 0.3) score -= 15;

    return Math.max(0, score);
  }

  /**
   * Check if markets have matching subjects (countries, people, events)
   * This is CRITICAL for preventing false positives like:
   * - "US President" matching "Honduras President"
   * - "Trump" matching "Biden"
   * Returns { match: boolean, reason: string }
   */
  private checkSubjectMatch(
    market1: Market,
    market2: Market
  ): { match: boolean; reason: string; countries1: string[]; countries2: string[] } {
    const text1 = (market1.title + ' ' + (market1.description || '') + ' ' +
      (market1.metadata?.rulesPrimary || '')).toLowerCase();
    const text2 = (market2.title + ' ' + (market2.description || '') + ' ' +
      (market2.metadata?.rulesPrimary || '')).toLowerCase();

    // Extract countries mentioned in each market
    const countries1 = this.extractCountries(text1);
    const countries2 = this.extractCountries(text2);


    // If both markets mention countries, they should match
    if (countries1.length > 0 && countries2.length > 0) {
      // Check for any overlap
      const hasOverlap = countries1.some(c1 =>
        countries2.some(c2 => this.countriesMatch(c1, c2))
      );

      if (!hasOverlap) {
        return {
          match: false,
          reason: `Geographic mismatch: ${countries1.join(', ')} vs ${countries2.join(', ')}`,
          countries1,
          countries2
        };
      }
    }

    // Check if one is US-specific and other is not
    const isUs1 = this.isUsContext(text1);
    const isUs2 = this.isUsContext(text2);

    // If one clearly references US and other references different country
    if (isUs1 && countries2.length > 0 && !countries2.some(c => this.isUsCountry(c))) {
      return {
        match: false,
        reason: `US market vs non-US country: ${countries2.join(', ')}`,
        countries1: ['united states'],
        countries2
      };
    }
    if (isUs2 && countries1.length > 0 && !countries1.some(c => this.isUsCountry(c))) {
      return {
        match: false,
        reason: `Non-US country vs US market: ${countries1.join(', ')}`,
        countries1,
        countries2: ['united states']
      };
    }

    // Extract person names (capitalized words that aren't common)
    const peopleText1 = market1.title + ' ' + (market1.metadata?.rulesPrimary || '');
    const peopleText2 = market2.title + ' ' + (market2.metadata?.rulesPrimary || '');
    const people1 = this.extractPeople(peopleText1);
    const people2 = this.extractPeople(peopleText2);

    // If both mention specific people, at least one should match
    if (people1.length > 0 && people2.length > 0) {
      const hasPersonOverlap = people1.some(p1 =>
        people2.some(p2 => this.namesMatch(p1, p2))
      );

      if (!hasPersonOverlap) {
        // Different people mentioned - likely different markets
        return {
          match: false,
          reason: `Different subjects: ${people1.join(', ')} vs ${people2.join(', ')}`,
          countries1,
          countries2
        };
      }
    }

    // Check for position type mismatch (President vs Vice President)
    const positionMismatch = this.checkPositionMismatch(text1, text2);
    if (positionMismatch) {
      return {
        match: false,
        reason: positionMismatch,
        countries1,
        countries2
      };
    }

    return { match: true, reason: 'Subjects compatible', countries1, countries2 };
  }

  /**
   * Check if markets have incompatible position types (e.g., President vs VP)
   *
   * This is CRITICAL for preventing false matches like:
   * - KXVPRESNOMR-28-JDV (VP nominee) vs "Republican presidential nominee 2028"
   * - "Vice Presidency" vs "Presidential election"
   */
  private checkPositionMismatch(text1: string, text2: string): string | null {
    // VP indicators - check FIRST (more specific takes priority)
    // Must detect: "Vice Presidency", "vice president", "vice presidential", "VP", "running mate"
    const vpPatterns = [
      /vice[- ]?president/i,
      /vice[- ]?presidential/i,
      /vice[- ]?presidency/i,
      /\bvp\b(?![a-z])/i,
      /running[- ]?mate/i,
      /vp[- ]?nomin/i
    ];

    // President-only indicators (explicitly NOT VP)
    // Must detect: "president", "presidential nominee", "presidential election"
    // Note: We check VP first, so these only match if NOT already VP
    const presidentPatterns = [
      /\bpresident/i,
      /\bpresidential/i
    ];

    const isVp1 = vpPatterns.some(p => p.test(text1));
    const isVp2 = vpPatterns.some(p => p.test(text2));

    // Only check president if NOT already detected as VP
    // This ensures "vice president" doesn't also trigger president detection
    const isPres1 = !isVp1 && presidentPatterns.some(p => p.test(text1));
    const isPres2 = !isVp2 && presidentPatterns.some(p => p.test(text2));

    // Cross-mismatch: One is VP, other is President = BLOCK
    if ((isVp1 && isPres2) || (isVp2 && isPres1)) {
      return 'Position type mismatch: Vice President vs President';
    }

    return null;
  }

  /**
   * Extract countries from text
   */
  private extractCountries(text: string): string[] {
    const found: string[] = [];
    const normalized = text.toLowerCase();

    // Multi-word countries first
    const multiWordCountries = [
      'united states', 'united kingdom', 'north korea', 'south korea', 'south africa'
    ];
    for (const country of multiWordCountries) {
      if (normalized.includes(country)) {
        found.push(country);
      }
    }

    // Single word countries
    const singleWordCountries = [
      'honduras', 'mexico', 'canada', 'britain', 'france', 'germany', 'china',
      'russia', 'brazil', 'india', 'japan', 'australia', 'argentina', 'venezuela',
      'colombia', 'peru', 'chile', 'israel', 'ukraine', 'iran', 'taiwan',
      'philippines', 'indonesia', 'vietnam', 'thailand', 'poland', 'italy',
      'spain', 'netherlands', 'belgium', 'sweden', 'norway', 'denmark',
      'finland', 'switzerland', 'austria', 'greece', 'turkey', 'egypt', 'nigeria', 'kenya'
    ];
    for (const country of singleWordCountries) {
      if (new RegExp(`\\b${country}\\b`, 'i').test(normalized)) {
        found.push(country);
      }
    }

    // Country adjectives/demonyms
    const demonymMap: Record<string, string> = {
      'american': 'united states',
      'british': 'united kingdom',
      'french': 'france',
      'german': 'germany',
      'chinese': 'china',
      'russian': 'russia',
      'brazilian': 'brazil',
      'indian': 'india',
      'japanese': 'japan',
      'australian': 'australia',
      'mexican': 'mexico',
      'canadian': 'canada',
      'italian': 'italy',
      'spanish': 'spain',
      'turkish': 'turkey',
      'israeli': 'israel',
      'iranian': 'iran',
      'ukrainian': 'ukraine',
      'honduran': 'honduras'
    };
    for (const [demonym, country] of Object.entries(demonymMap)) {
      if (new RegExp(`\\b${demonym}\\b`, 'i').test(normalized) && !found.includes(country)) {
        found.push(country);
      }
    }

    // USA abbreviations
    if (/\b(usa|u\.s\.a\.?|u\.s\.)\b/i.test(normalized) && !found.includes('united states')) {
      found.push('united states');
    }

    return [...new Set(found)];
  }

  /**
   * Check if text has US-specific context
   */
  private isUsContext(text: string): boolean {
    const usIndicators = [
      'president of the united states',
      'us president',
      'american president',
      'white house',
      'congress',
      'senate',
      'house of representatives',
      'democrat',
      'republican',
      'gop',
      'dnc',
      'rnc',
      'federal reserve',
      'scotus',
      'supreme court'
    ];
    return usIndicators.some(indicator => text.includes(indicator));
  }

  /**
   * Check if a country reference is US
   */
  private isUsCountry(country: string): boolean {
    return ['united states', 'usa', 'america', 'american'].includes(country.toLowerCase());
  }

  /**
   * Check if two country references match (accounting for aliases)
   */
  private countriesMatch(c1: string, c2: string): boolean {
    const n1 = c1.toLowerCase();
    const n2 = c2.toLowerCase();

    if (n1 === n2) return true;

    // US aliases
    const usAliases = ['united states', 'usa', 'us', 'america', 'american'];
    if (usAliases.includes(n1) && usAliases.includes(n2)) return true;

    // UK aliases
    const ukAliases = ['united kingdom', 'uk', 'britain', 'british'];
    if (ukAliases.includes(n1) && ukAliases.includes(n2)) return true;

    return false;
  }

  /**
   * Extract person names from text (simple heuristic)
   */
  private extractPeople(text: string): string[] {
    const commonWords = new Set([
      'will', 'the', 'president', 'of', 'united', 'states', 'before', 'after',
      'become', 'win', 'next', 'who', 'which', 'what', 'when', 'how', 'yes', 'no',
      'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
      'september', 'october', 'november', 'december', 'monday', 'tuesday',
      'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
    ]);

    // Find capitalized words that might be names
    const words = text.split(/\s+/);
    const people: string[] = [];

    for (let i = 0; i < words.length; i++) {
      const word = words[i].replace(/[^a-zA-Z]/g, '');
      if (word.length < 3) continue;

      // Check if capitalized (not at sentence start unless also has capital inside)
      if (/^[A-Z][a-z]+$/.test(word) && !commonWords.has(word.toLowerCase())) {
        // Likely a name - also grab next word if capitalized (full name)
        let name = word;
        if (i + 1 < words.length) {
          const nextWord = words[i + 1].replace(/[^a-zA-Z]/g, '');
          if (/^[A-Z][a-z]+$/.test(nextWord) && !commonWords.has(nextWord.toLowerCase())) {
            name = word + ' ' + nextWord;
            i++; // Skip next word
          }
        }
        people.push(name.toLowerCase());
      }
    }

    return [...new Set(people)];
  }

  /**
   * Check if two names match (accounting for first/last name only)
   */
  private namesMatch(name1: string, name2: string): boolean {
    const n1 = name1.toLowerCase();
    const n2 = name2.toLowerCase();

    if (n1 === n2) return true;

    // Check if one is a substring of the other (e.g., "Trump" matches "Donald Trump")
    if (n1.includes(n2) || n2.includes(n1)) return true;

    // Check last names
    const parts1 = n1.split(' ');
    const parts2 = n2.split(' ');
    const last1 = parts1[parts1.length - 1];
    const last2 = parts2[parts2.length - 1];

    return last1 === last2 && last1.length > 3;
  }

  /**
   * Calculate volume ratio
   */
  private calculateVolumeRatio(market1: Market, market2: Market): number {
    const v1 = market1.volume24h || 1;
    const v2 = market2.volume24h || 1;
    return Math.min(v1, v2) / Math.max(v1, v2);
  }

  /**
   * Calculate price correlation (simple)
   * Uses metadata.lastPrice if available, otherwise defaults to 0.5
   */
  private calculatePriceCorrelation(market1: Market, market2: Market): number {
    const p1 = market1.metadata?.lastPrice ?? 0.5;
    const p2 = market2.metadata?.lastPrice ?? 0.5;
    return 1 - Math.abs(p1 - p2);
  }

  /**
   * Calculate length ratio
   */
  private calculateLengthRatio(market1: Market, market2: Market): number {
    const len1 = (market1.title + market1.description).length;
    const len2 = (market2.title + market2.description).length;
    return Math.min(len1, len2) / Math.max(len1, len2);
  }

  /**
   * Calculate average word count
   */
  private calculateAvgWordCount(market1: Market, market2: Market): number {
    const words1 = market1.title.split(/\s+/).length;
    const words2 = market2.title.split(/\s+/).length;
    return (words1 + words2) / 2;
  }

  /**
   * Normalize text
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
   * Convert feature vector to array for model input
   */
  toArray(features: FeatureVector): number[] {
    return [
      features.titleSimilarity / 100,
      features.descriptionSimilarity / 100,
      features.keywordOverlap / 100,
      features.categoryMatch,
      features.timingMatch,
      features.sourcesMatch,
      features.alignmentScore / 100,
      features.volumeRatio,
      features.priceCorrelation,
      features.lengthRatio,
      features.avgWordCount / 20,
      features.embeddingSimilarity / 100,
      features.temporalDistance,
      features.outcomeMatch
    ];
  }

  /**
   * Get feature names
   */
  getFeatureNames(): string[] {
    return [
      'title_similarity',
      'description_similarity',
      'keyword_overlap',
      'category_match',
      'timing_match',
      'sources_match',
      'alignment_score',
      'volume_ratio',
      'price_correlation',
      'length_ratio',
      'avg_word_count',
      'embedding_similarity',
      'temporal_distance',
      'outcome_match'
    ];
  }
}
