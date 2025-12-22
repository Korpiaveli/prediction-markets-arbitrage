import {
  LLMValidationRequest,
  LLMValidationResponse,
  LLMValidatorConfig,
  LLMValidatorStats,
  DEFAULT_LLM_CONFIG
} from './types.js';

interface CacheEntry {
  response: LLMValidationResponse;
  timestamp: number;
}

export class LLMValidator {
  private config: LLMValidatorConfig;
  private cache: Map<string, CacheEntry> = new Map();
  private stats: LLMValidatorStats = {
    totalRequests: 0,
    cacheHits: 0,
    apiCalls: 0,
    avgLatencyMs: 0,
    estimatedCost: 0,
    errors: 0
  };
  private pendingRequests: Map<string, Promise<LLMValidationResponse>> = new Map();
  private activeRequests = 0;

  constructor(config: Partial<LLMValidatorConfig> = {}) {
    this.config = { ...DEFAULT_LLM_CONFIG, ...config };
  }

  async validate(request: LLMValidationRequest): Promise<LLMValidationResponse> {
    this.stats.totalRequests++;
    const startTime = Date.now();

    const cacheKey = this.getCacheKey(request);

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.config.cacheTTLMs!) {
      this.stats.cacheHits++;
      return { ...cached.response, cached: true, latencyMs: Date.now() - startTime };
    }

    // Check if same request is already pending
    const pending = this.pendingRequests.get(cacheKey);
    if (pending) {
      return pending;
    }

    // Rate limit check
    if (this.activeRequests >= this.config.maxConcurrent!) {
      return this.getMockResponse(request, 'Rate limited', startTime);
    }

    // Create new request
    const requestPromise = this.executeValidation(request, cacheKey, startTime);
    this.pendingRequests.set(cacheKey, requestPromise);

    try {
      return await requestPromise;
    } finally {
      this.pendingRequests.delete(cacheKey);
    }
  }

  private async executeValidation(
    request: LLMValidationRequest,
    cacheKey: string,
    startTime: number
  ): Promise<LLMValidationResponse> {
    this.activeRequests++;

    try {
      let response: LLMValidationResponse;

      switch (this.config.provider) {
        case 'openai':
          response = await this.callOpenAI(request, startTime);
          break;
        case 'anthropic':
          response = await this.callAnthropic(request, startTime);
          break;
        default:
          response = this.getMockResponse(request, 'Mock provider', startTime);
      }

      // Cache successful response
      this.cache.set(cacheKey, {
        response,
        timestamp: Date.now()
      });

      this.stats.apiCalls++;
      this.stats.estimatedCost += this.config.costPerRequest!;
      this.updateAvgLatency(response.latencyMs);

      return response;
    } catch (error) {
      this.stats.errors++;
      return this.getMockResponse(request, `Error: ${error}`, startTime);
    } finally {
      this.activeRequests--;
    }
  }

  private async callOpenAI(
    request: LLMValidationRequest,
    startTime: number
  ): Promise<LLMValidationResponse> {
    // Placeholder for OpenAI integration
    // Would use fetch or axios to call OpenAI API with prompt

    const prompt = this.buildPrompt(request);
    console.log(`[LLMValidator] OpenAI prompt:\n${prompt.slice(0, 200)}...`);

    // For now, return mock response
    // TODO: Implement actual OpenAI API call when API key is provided
    return this.getMockResponse(request, 'OpenAI not configured', startTime);
  }

  private async callAnthropic(
    request: LLMValidationRequest,
    startTime: number
  ): Promise<LLMValidationResponse> {
    // Placeholder for Anthropic integration
    console.log(`[LLMValidator] Anthropic not yet implemented`);
    return this.getMockResponse(request, 'Anthropic not configured', startTime);
  }

  private buildPrompt(request: LLMValidationRequest): string {
    return `You are validating if two prediction market questions refer to the EXACT same event.

Market 1 (${request.market1Platform}): "${request.market1Title}"
Market 2 (${request.market2Platform}): "${request.market2Title}"

Questions:
1. Do both markets resolve on the SAME event? (Yes/No)
2. Would they resolve at the SAME time? (Yes/No/Unknown)
3. Are the resolution criteria compatible? (Yes/No/Unknown)
4. Confidence score (0-100)
5. Risk factors for different resolutions

Respond in JSON format:
{
  "sameEvent": boolean,
  "sameResolutionTime": boolean | null,
  "compatibleCriteria": boolean | null,
  "confidence": number,
  "riskFactors": string[],
  "reasoning": string
}`;
  }

  private getMockResponse(
    request: LLMValidationRequest,
    reason: string,
    startTime: number
  ): LLMValidationResponse {
    // Heuristic-based mock response
    const t1 = request.market1Title.toLowerCase();
    const t2 = request.market2Title.toLowerCase();

    // Simple word overlap heuristic
    const words1 = new Set(t1.split(/\s+/).filter(w => w.length > 3));
    const words2 = new Set(t2.split(/\s+/).filter(w => w.length > 3));
    const overlap = [...words1].filter(w => words2.has(w)).length;
    const maxWords = Math.max(words1.size, words2.size);
    const similarity = maxWords > 0 ? overlap / maxWords : 0;

    return {
      sameEvent: similarity > 0.4,
      sameResolutionTime: similarity > 0.5 ? true : null,
      compatibleCriteria: similarity > 0.4 ? true : null,
      confidence: Math.round(similarity * 100),
      riskFactors: similarity < 0.5 ? ['Low title similarity'] : [],
      reasoning: `Mock response: ${reason}. Similarity: ${(similarity * 100).toFixed(1)}%`,
      cached: false,
      latencyMs: Date.now() - startTime
    };
  }

  private getCacheKey(request: LLMValidationRequest): string {
    const normalized1 = request.market1Title.toLowerCase().trim();
    const normalized2 = request.market2Title.toLowerCase().trim();
    // Sort to ensure same key regardless of order
    const sorted = [normalized1, normalized2].sort();
    return `${sorted[0]}|||${sorted[1]}`;
  }

  private updateAvgLatency(latencyMs: number): void {
    const n = this.stats.apiCalls;
    this.stats.avgLatencyMs = ((this.stats.avgLatencyMs * (n - 1)) + latencyMs) / n;
  }

  getStats(): LLMValidatorStats {
    return { ...this.stats };
  }

  clearCache(): void {
    this.cache.clear();
  }

  resetStats(): void {
    this.stats = {
      totalRequests: 0,
      cacheHits: 0,
      apiCalls: 0,
      avgLatencyMs: 0,
      estimatedCost: 0,
      errors: 0
    };
  }

  setApiKey(key: string): void {
    this.config.apiKey = key;
  }

  setProvider(provider: 'openai' | 'anthropic' | 'mock'): void {
    this.config.provider = provider;
  }
}

export const llmValidator = new LLMValidator();
