import { Market } from '@arb/core';

/**
 * Exchange-specific text normalization interface
 *
 * Different exchanges use different writing styles:
 * - Kalshi: Concise, question format (26-50 chars)
 * - Polymarket: Verbose, marketing language (150+ chars)
 * - PredictIt: Question + multi-contract format
 *
 * Normalizers standardize text for cross-platform matching
 */
export interface ExchangeNormalizer {
  /**
   * Normalize market title for comparison
   * - Remove filler words, questions, formatting
   * - Extract core entities (names, dates, events)
   * - Standardize to ~50 words max
   */
  normalizeTitle(title: string): string;

  /**
   * Normalize market description for comparison
   * - Remove resolution criteria boilerplate
   * - Extract core event description
   * - Standardize to ~100 words max
   */
  normalizeDescription(description: string): string;

  /**
   * Extract meaningful keywords from text
   * - Focus on entities, events, outcomes
   * - Remove stop words and boilerplate
   * - Return top 15-20 keywords
   */
  extractKeywords(text: string): string[];

  /**
   * Full normalization of market for matching
   * Convenience method that combines title + description
   */
  normalize(market: Market): string;
}

/**
 * Base normalizer with common utility functions
 */
export abstract class BaseNormalizer implements ExchangeNormalizer {
  protected readonly stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from',
    'will', 'be', 'is', 'are', 'was', 'were', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
    'this', 'that', 'these', 'those', 'what', 'which', 'who', 'when', 'where', 'why', 'how',
    'if', 'as', 'up', 'down', 'out', 'over', 'under', 'again', 'further', 'then', 'once'
  ]);

  protected readonly questionPatterns = [
    /^will\s+/i,
    /^does\s+/i,
    /^can\s+/i,
    /^is\s+/i,
    /^are\s+/i,
    /\?$/
  ];

  /**
   * Clean and normalize text
   */
  protected cleanText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s'-]/g, ' ')  // Keep hyphens and apostrophes
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Remove question formatting
   */
  protected removeQuestions(text: string): string {
    let cleaned = text;
    for (const pattern of this.questionPatterns) {
      cleaned = cleaned.replace(pattern, '');
    }
    return cleaned.trim();
  }

  /**
   * Extract entities (proper nouns, years, key terms)
   */
  protected extractEntities(text: string): string[] {
    const entities: string[] = [];

    // Years (2020-2099)
    const years = text.match(/\b20\d{2}\b/g);
    if (years) entities.push(...years);

    // Proper nouns (capitalized words)
    const words = text.split(/\s+/);
    for (const word of words) {
      if (word.length > 2 && /^[A-Z]/.test(word)) {
        entities.push(word.toLowerCase());
      }
    }

    // Numbers (excluding years already captured)
    const numbers = text.match(/\b\d+\b/g);
    if (numbers) {
      entities.push(...numbers.filter(n => !years?.includes(n)));
    }

    return entities;
  }

  /**
   * Limit text to max words
   */
  protected limitWords(text: string, maxWords: number): string {
    const words = text.split(/\s+/);
    if (words.length <= maxWords) return text;
    return words.slice(0, maxWords).join(' ');
  }

  abstract normalizeTitle(title: string): string;
  abstract normalizeDescription(description: string): string;
  abstract extractKeywords(text: string): string[];

  /**
   * Default implementation: combine normalized title + description
   */
  normalize(market: Market): string {
    const title = this.normalizeTitle(market.title);
    const description = market.description
      ? this.normalizeDescription(market.description)
      : '';

    return `${title} ${description}`.trim();
  }
}
