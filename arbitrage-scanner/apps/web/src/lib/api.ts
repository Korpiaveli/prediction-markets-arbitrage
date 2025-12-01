const API_URL = process.env.API_URL || 'http://localhost:3001';

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
}

export const apiClient = new ApiClient(API_URL);
