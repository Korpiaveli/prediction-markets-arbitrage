import { BaseNormalizer } from './ExchangeNormalizer.js';

/**
 * Kalshi-specific normalizer
 *
 * Kalshi characteristics:
 * - Concise, question format (26-50 chars)
 * - Already well-structured
 * - Minimal filler words
 * - Short descriptions or often empty
 *
 * Strategy:
 * - Minimal normalization (already concise)
 * - Basic cleanup only
 * - Preserve entities and structure
 * - This is the reference format others should match
 */
export class KalshiNormalizer extends BaseNormalizer {
  /**
   * Normalize Kalshi title
   * - Basic cleanup only
   * - Remove question marks
   * - Preserve concise format
   */
  normalizeTitle(title: string): string {
    let normalized = this.cleanText(title);

    // Remove question marks (but keep question words - they're meaningful)
    normalized = normalized.replace(/\?+/g, '').trim();

    // Limit to 50 words (should never hit this for Kalshi)
    normalized = this.limitWords(normalized, 50);

    return normalized;
  }

  /**
   * Normalize Kalshi description
   * - Basic cleanup only
   * - Kalshi often has empty descriptions
   */
  normalizeDescription(description: string): string {
    if (!description) return '';

    let normalized = this.cleanText(description);

    // Limit to 100 words (should rarely hit this for Kalshi)
    normalized = this.limitWords(normalized, 100);

    return normalized;
  }

  /**
   * Extract keywords from Kalshi text
   * - Kalshi is already concise, most words are meaningful
   * - Remove stop words only
   * - Extract entities
   */
  extractKeywords(text: string): string[] {
    const cleaned = this.cleanText(text);

    // Extract entities (years, proper nouns, numbers)
    const entities = this.extractEntities(text);

    // Split into words and filter
    const words = cleaned.split(/\s+/);
    const keywords = new Set<string>();

    // Add entities first
    entities.forEach(e => keywords.add(e));

    // Add all non-stop words (Kalshi is already concise)
    for (const word of words) {
      if (word.length > 2 && !this.stopWords.has(word)) {
        keywords.add(word);
      }
    }

    // Return top 20
    return Array.from(keywords).slice(0, 20);
  }
}
