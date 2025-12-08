const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async fetch(path: string, options?: RequestInit) {
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `API error: ${response.statusText}`);
      }

      return data;
    } catch (error) {
      if (error instanceof Error) {
        console.error(`[API] ${options?.method || 'GET'} ${path} failed:`, error.message);
        throw error;
      }
      throw new Error('Unknown API error');
    }
  }

  async getOpportunities(params?: { limit?: number; minProfit?: number }) {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.minProfit) query.set('minProfit', params.minProfit.toString());

    const queryString = query.toString();
    return this.fetch(`/api/opportunities${queryString ? `?${queryString}` : ''}`);
  }

  async getStats() {
    return this.fetch('/api/opportunities/stats/summary');
  }

  async getScannerStatus() {
    return this.fetch('/api/scanner/status');
  }

  async triggerScan() {
    return this.fetch('/api/scanner/scan', { method: 'POST' });
  }

  async getConfig() {
    return this.fetch('/api/config');
  }

  async getMarkets(exchange?: string) {
    const query = exchange ? `?exchange=${exchange}` : '';
    return this.fetch(`/api/markets${query}`);
  }

  async getRiskMetrics() {
    return this.fetch('/api/stats/risk');
  }

  async getForecast() {
    return this.fetch('/api/stats/forecast');
  }

  async getPositions() {
    return this.fetch('/api/positions');
  }

  async createPosition(position: any) {
    return this.fetch('/api/positions', {
      method: 'POST',
      body: JSON.stringify(position)
    });
  }

  async updatePosition(id: string, data: any) {
    return this.fetch(`/api/positions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async getOpportunity(id: string) {
    return this.fetch(`/api/opportunities/${id}`);
  }

  async getHistoricalOpportunities(params?: { days?: number }) {
    const query = params?.days ? `?days=${params.days}` : '';
    return this.fetch(`/api/opportunities/history${query}`);
  }

  async getAnalytics(params?: { period?: '7d' | '30d' | '90d' | 'all' }) {
    const query = params?.period ? `?period=${params.period}` : '';
    return this.fetch(`/api/stats/analytics${query}`);
  }

  async getRecommendations(params?: {
    top?: number;
    minScore?: number;
    minProfit?: number;
    maxHours?: number;
    categories?: string[];
    riskLevels?: string[];
  }) {
    const query = new URLSearchParams();
    if (params?.top) query.set('top', params.top.toString());
    if (params?.minScore) query.set('minScore', params.minScore.toString());
    if (params?.minProfit) query.set('minProfit', params.minProfit.toString());
    if (params?.maxHours) query.set('maxHours', params.maxHours.toString());
    if (params?.categories?.length) query.set('categories', params.categories.join(','));
    if (params?.riskLevels?.length) query.set('riskLevels', params.riskLevels.join(','));

    const queryString = query.toString();
    return this.fetch(`/api/recommendations${queryString ? `?${queryString}` : ''}`);
  }

  async generateRecommendations(config?: {
    topN?: number;
    weights?: { time: number; profit: number; confidence: number };
    filters?: Record<string, any>;
  }) {
    return this.fetch('/api/recommendations/generate', {
      method: 'POST',
      body: JSON.stringify(config || {})
    });
  }

  async getRecommendation(id: string) {
    return this.fetch(`/api/recommendations/${id}`);
  }

  async getRecommendationStats() {
    return this.fetch('/api/recommendations/stats/summary');
  }
}

export const apiClient = new ApiClient(API_URL);
