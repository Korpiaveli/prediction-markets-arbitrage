/**
 * Embedding Service
 *
 * Generates semantic embeddings for market text using sentence-transformers.
 * Uses transformers.js (@xenova/transformers) for Node.js compatibility.
 */

import { pipeline, env } from '@xenova/transformers';

// Disable remote model loading progress bars in production
env.allowLocalModels = true;
env.allowRemoteModels = true;

export interface EmbeddingCache {
  [key: string]: number[];
}

export class EmbeddingService {
  private model: any = null;
  private modelName = 'Xenova/all-MiniLM-L6-v2'; // Lightweight model (384 dims, 80MB)
  private cache: EmbeddingCache = {};
  private isInitialized = false;
  private initializationAttempts = 0;
  private readonly maxRetries = 3;
  private lastHealthCheck: Date | null = null;

  /**
   * Initialize the embedding model with retry logic
   * Downloads model on first run (~80MB), cached locally after
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    const maxAttempts = this.maxRetries;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`[EmbeddingService] Loading model (attempt ${attempt}/${maxAttempts}):`, this.modelName);
        this.model = await pipeline('feature-extraction', this.modelName);
        this.isInitialized = true;
        this.initializationAttempts = attempt;
        this.lastHealthCheck = new Date();
        console.log('[EmbeddingService] Model loaded successfully');
        return;
      } catch (error) {
        lastError = error as Error;
        console.error(`[EmbeddingService] Attempt ${attempt}/${maxAttempts} failed:`, error);

        if (attempt < maxAttempts) {
          const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          console.log(`[EmbeddingService] Retrying in ${delayMs}ms...`);
          await this.sleep(delayMs);
        }
      }
    }

    console.error('[EmbeddingService] All initialization attempts failed');
    throw new Error(`Failed to initialize embedding model after ${maxAttempts} attempts: ${lastError?.message}`);
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Perform health check on the model
   * Returns true if model is healthy, false otherwise
   */
  async healthCheck(): Promise<boolean> {
    if (!this.isInitialized || !this.model) {
      return false;
    }

    try {
      const testText = 'health check';
      const output = await this.model(testText, {
        pooling: 'mean',
        normalize: true
      });

      if (!output || !output.data || output.data.length === 0) {
        console.warn('[EmbeddingService] Health check failed: invalid output');
        return false;
      }

      this.lastHealthCheck = new Date();
      return true;
    } catch (error) {
      console.error('[EmbeddingService] Health check failed:', error);
      return false;
    }
  }

  /**
   * Get health status
   */
  getHealthStatus(): {
    initialized: boolean;
    healthy: boolean;
    lastCheck: Date | null;
    cacheSize: number;
    initAttempts: number;
  } {
    return {
      initialized: this.isInitialized,
      healthy: this.model !== null,
      lastCheck: this.lastHealthCheck,
      cacheSize: Object.keys(this.cache).length,
      initAttempts: this.initializationAttempts
    };
  }

  /**
   * Generate embedding for text
   * Returns normalized 384-dimensional vector
   */
  async embed(text: string): Promise<number[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Check cache
    const cacheKey = this.getCacheKey(text);
    if (this.cache[cacheKey]) {
      return this.cache[cacheKey];
    }

    if (!this.model) {
      throw new Error('Model not initialized');
    }

    try {
      // Generate embedding
      const output = await this.model(text, {
        pooling: 'mean',
        normalize: true
      });

      // Extract array from tensor
      const embedding = Array.from(output.data) as number[];

      // Cache result
      this.cache[cacheKey] = embedding;

      return embedding;
    } catch (error) {
      console.error('[EmbeddingService] Failed to generate embedding:', error);
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map(text => this.embed(text)));
  }

  /**
   * Calculate cosine similarity between two embeddings
   * Returns value between 0 (dissimilar) and 1 (identical)
   */
  cosineSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length !== embedding2.length) {
      throw new Error('Embeddings must have same dimensions');
    }

    // Since embeddings are normalized, cosine similarity = dot product
    let dotProduct = 0;
    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
    }

    // Clamp to [0, 1] range (normalized vectors should already be in [-1, 1])
    return Math.max(0, Math.min(1, (dotProduct + 1) / 2));
  }

  /**
   * Calculate semantic similarity between two texts
   * Returns value between 0-100
   */
  async calculateSimilarity(text1: string, text2: string): Promise<number> {
    const [emb1, emb2] = await Promise.all([
      this.embed(text1),
      this.embed(text2)
    ]);

    const similarity = this.cosineSimilarity(emb1, emb2);
    return similarity * 100; // Scale to 0-100
  }

  /**
   * Generate cache key from text
   */
  private getCacheKey(text: string): string {
    // Normalize text for consistent caching
    const normalized = text.toLowerCase().trim();
    // Use first 100 chars as key (prevents huge keys)
    return normalized.substring(0, 100);
  }

  /**
   * Clear embedding cache
   */
  clearCache(): void {
    this.cache = {};
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: Object.keys(this.cache).length,
      keys: Object.keys(this.cache)
    };
  }

  /**
   * Check if model is ready
   */
  isReady(): boolean {
    return this.isInitialized && this.model !== null;
  }

  /**
   * Pre-warm cache with market texts
   * Useful for batch processing
   */
  async prewarmCache(texts: string[]): Promise<void> {
    console.log(`[EmbeddingService] Pre-warming cache with ${texts.length} texts...`);
    await this.embedBatch(texts);
    console.log(`[EmbeddingService] Cache pre-warmed. Size: ${Object.keys(this.cache).length}`);
  }
}

/**
 * Singleton instance for shared use across the application
 */
let sharedInstance: EmbeddingService | null = null;

export function getEmbeddingService(): EmbeddingService {
  if (!sharedInstance) {
    sharedInstance = new EmbeddingService();
  }
  return sharedInstance;
}

/**
 * Reset singleton (useful for testing)
 */
export function resetEmbeddingService(): void {
  sharedInstance = null;
}
