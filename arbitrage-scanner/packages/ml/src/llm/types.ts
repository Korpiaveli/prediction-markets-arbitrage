export interface LLMValidationRequest {
  market1Title: string;
  market1Platform: string;
  market2Title: string;
  market2Platform: string;
  profitPercent?: number;
  context?: Record<string, unknown>;
}

export interface LLMValidationResponse {
  sameEvent: boolean;
  sameResolutionTime: boolean | null;
  compatibleCriteria: boolean | null;
  confidence: number;
  riskFactors: string[];
  reasoning: string;
  cached: boolean;
  latencyMs: number;
}

export interface LLMValidatorConfig {
  provider: 'openai' | 'anthropic' | 'mock';
  apiKey?: string;
  model?: string;
  maxConcurrent?: number;
  cacheTTLMs?: number;
  maxRetries?: number;
  timeoutMs?: number;
  costPerRequest?: number;
}

export interface LLMValidatorStats {
  totalRequests: number;
  cacheHits: number;
  apiCalls: number;
  avgLatencyMs: number;
  estimatedCost: number;
  errors: number;
}

export const DEFAULT_LLM_CONFIG: LLMValidatorConfig = {
  provider: 'mock',
  model: 'gpt-4o-mini',
  maxConcurrent: 2,
  cacheTTLMs: 24 * 60 * 60 * 1000, // 24 hours
  maxRetries: 2,
  timeoutMs: 30000,
  costPerRequest: 0.01
};
