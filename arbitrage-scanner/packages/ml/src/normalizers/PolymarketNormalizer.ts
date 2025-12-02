import { BaseNormalizer } from './ExchangeNormalizer.js';

/**
 * Polymarket-specific normalizer
 *
 * Polymarket characteristics:
 * - Verbose, marketing-heavy titles (150+ chars)
 * - Question format: "Will X happen by Y date?"
 * - Detailed descriptions with resolution criteria
 * - Lots of filler words and promotional language
 *
 * Strategy:
 * - Aggressively remove questions and filler
 * - Extract core entities and events
 * - Standardize to ~50 words (title) / ~100 words (description)
 */
export class PolymarketNormalizer extends BaseNormalizer {
  private readonly resolutionPatterns = [
    /this market will resolve/i,
    /resolution criteria/i,
    /resolves yes if/i,
    /resolves no if/i,
    /resolves to yes/i,
    /resolves to no/i,
    /will be resolved/i,
    /official source/i,
    /according to/i,
    /as reported by/i,
    /based on data from/i,
    /per official/i
  ];

  private readonly fillerPhrases = [
    /in this market/gi,
    /in the event/gi,
    /for the purposes of/gi,
    /it is important to note/gi,
    /please note that/gi,
    /for more information/gi,
    /click here/gi,
    /learn more/gi,
    /find out/gi
  ];

  /**
   * Normalize Polymarket title
   * - Remove question formatting
   * - Strip filler words
   * - Extract core entities
   * - Limit to 50 words
   */
  normalizeTitle(title: string): string {
    let normalized = this.cleanText(title);

    // Remove question formatting
    normalized = this.removeQuestions(normalized);

    // Remove filler phrases
    for (const pattern of this.fillerPhrases) {
      normalized = normalized.replace(pattern, '');
    }

    // Remove extra whitespace
    normalized = normalized.replace(/\s+/g, ' ').trim();

    // Limit to 50 words
    normalized = this.limitWords(normalized, 50);

    return normalized;
  }

  /**
   * Normalize Polymarket description
   * - Remove resolution criteria boilerplate
   * - Extract core event description
   * - Limit to 100 words
   */
  normalizeDescription(description: string): string {
    if (!description) return '';

    let normalized = this.cleanText(description);

    // Split into sentences and remove resolution boilerplate
    const sentences = normalized.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const filteredSentences = sentences.filter(sentence => {
      const trimmed = sentence.trim();

      // Skip resolution criteria sentences
      for (const pattern of this.resolutionPatterns) {
        if (pattern.test(trimmed)) {
          return false;
        }
      }

      return true;
    });

    // Rejoin and remove filler phrases
    normalized = filteredSentences.join(' ');
    for (const pattern of this.fillerPhrases) {
      normalized = normalized.replace(pattern, '');
    }

    // Clean up whitespace
    normalized = normalized.replace(/\s+/g, ' ').trim();

    // Limit to 100 words
    normalized = this.limitWords(normalized, 100);

    return normalized;
  }

  /**
   * Extract meaningful keywords from Polymarket text
   * - Focus on entities, events, outcomes
   * - Remove stop words and boilerplate
   * - Return top 15-20 keywords
   */
  extractKeywords(text: string): string[] {
    const cleaned = this.cleanText(text);

    // Extract entities (years, proper nouns, numbers)
    const entities = this.extractEntities(text);

    // Split into words and filter
    const words = cleaned.split(/\s+/);
    const keywords = new Set<string>();

    // Add entities first (highest priority)
    entities.forEach(e => keywords.add(e));

    // Add non-stop words longer than 3 characters
    for (const word of words) {
      if (
        word.length > 3 &&
        !this.stopWords.has(word) &&
        !/^\d+$/.test(word) // Skip plain numbers (already in entities)
      ) {
        keywords.add(word);
      }
    }

    // Return top 20
    return Array.from(keywords).slice(0, 20);
  }
}
