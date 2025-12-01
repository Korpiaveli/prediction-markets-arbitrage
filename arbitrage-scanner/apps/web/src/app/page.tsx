'use client';

import { useState, useEffect } from 'react';
import { OpportunityList } from '@/components/OpportunityList';
import { StatsCards } from '@/components/StatsCards';
import { ScannerStatus } from '@/components/ScannerStatus';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useWebSocket } from '@/lib/useWebSocket';
import { apiClient } from '@/lib/api';

export default function DashboardPage() {
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const { connected, lastMessage } = useWebSocket();

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (lastMessage?.type === 'opportunity') {
      setOpportunities(prev => [lastMessage.data, ...prev].slice(0, 50));
    }
  }, [lastMessage]);

  async function loadData() {
    try {
      setLoading(true);
      const [oppsData, statsData] = await Promise.all([
        apiClient.getOpportunities({ limit: 50 }),
        apiClient.getStats()
      ]);
      setOpportunities(oppsData.data || []);
      setStats(statsData.data);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function triggerScan() {
    try {
      const result = await apiClient.triggerScan();
      if (result.data?.opportunities) {
        setOpportunities(result.data.opportunities);
      }
    } catch (error) {
      console.error('Scan failed:', error);
    }
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center">
              <h1 className="text-2xl font-bold text-gray-900">
                Arbitrage Scanner Dashboard
              </h1>
              <ScannerStatus connected={connected} />
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <div className="space-y-8">
            {stats && <StatsCards stats={stats} />}

            <div className="bg-white shadow rounded-lg p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold text-gray-900">
                  Opportunities
                </h2>
                <button
                  onClick={triggerScan}
                  className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition"
                >
                  Trigger Scan
                </button>
              </div>

              {loading ? (
                <div className="text-center py-12 text-gray-500">
                  Loading opportunities...
                </div>
              ) : (
                <OpportunityList opportunities={opportunities} />
              )}
            </div>
          </div>
        </main>
      </div>
    </ErrorBoundary>
  );
}
