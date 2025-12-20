'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { differenceInDays } from 'date-fns';
import { OpportunityList } from '@/components/OpportunityList';
import { OpportunityFilters } from '@/components/OpportunityFilters';
import { StatsCards } from '@/components/StatsCards';
import { ScannerStatus } from '@/components/ScannerStatus';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { RiskDashboard } from '@/components/RiskDashboard';
import { ForecastPanel } from '@/components/ForecastPanel';
import { AlertSettings } from '@/components/AlertSettings';
import { useWebSocket } from '@/lib/useWebSocket';
import { apiClient } from '@/lib/api';
import { showOpportunityNotification } from '@/lib/notifications';
import type { ArbitrageOpportunity, StatsData, RiskMetrics, ForecastData, ForecastTiming, WebSocketMessage, FilterState, SortState, ExchangeName } from '@/types';

const DEFAULT_FILTERS: FilterState = {
  minProfit: 0,
  maxProfit: 100,
  minConfidence: 0,
  exchanges: ['KALSHI', 'POLYMARKET', 'PREDICTIT'],
  minResolutionDays: 0,
  searchQuery: ''
};

const DEFAULT_SORT: SortState = {
  field: 'profitPercent',
  direction: 'desc'
};

export default function DashboardPage() {
  const [opportunities, setOpportunities] = useState<ArbitrageOpportunity[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [riskMetrics, setRiskMetrics] = useState<RiskMetrics | null>(null);
  const [forecast, setForecast] = useState<{ forecast: ForecastData; timing: ForecastTiming } | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
  const [showAlertSettings, setShowAlertSettings] = useState(false);

  const { connected, lastMessage } = useWebSocket();

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const msg = lastMessage as WebSocketMessage | null;
    if (msg?.type === 'opportunity' && msg.data) {
      const opp = msg.data as ArbitrageOpportunity;
      setOpportunities(prev => {
        const filtered = prev.filter(p => p.id !== opp.id);
        return [opp, ...filtered].slice(0, 50);
      });
      showOpportunityNotification(opp);
    }
    if (msg?.type === 'scan:complete') {
      setScanning(false);
      loadData();
    }
  }, [lastMessage]);

  async function loadData() {
    try {
      setLoading(true);
      const [oppsData, statsData, riskData, forecastData] = await Promise.all([
        apiClient.getOpportunities({ limit: 50 }),
        apiClient.getStats(),
        apiClient.getRiskMetrics().catch(() => ({ data: null })),
        apiClient.getForecast().catch(() => ({ data: null }))
      ]);
      setOpportunities(oppsData.data || []);
      setStats(statsData.data);
      setRiskMetrics(riskData.data);
      setForecast(forecastData.data);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function triggerScan() {
    try {
      setScanning(true);
      const result = await apiClient.triggerScan();
      if (result.data?.opportunities) {
        setOpportunities(result.data.opportunities);
      }
    } catch (error) {
      console.error('Scan failed:', error);
    } finally {
      setScanning(false);
    }
  }

  const getResolutionDays = useCallback((opp: ArbitrageOpportunity): number => {
    const close1 = opp.marketPair?.market1?.closeTime || opp.pair?.market1?.closeTime;
    const close2 = opp.marketPair?.market2?.closeTime || opp.pair?.market2?.closeTime;
    const date1 = close1 ? new Date(close1) : null;
    const date2 = close2 ? new Date(close2) : null;
    if (!date1 && !date2) return 999;
    if (!date1) return differenceInDays(date2!, new Date());
    if (!date2) return differenceInDays(date1, new Date());
    const earliest = date1 < date2 ? date1 : date2;
    return differenceInDays(earliest, new Date());
  }, []);

  const getExchange = useCallback((opp: ArbitrageOpportunity): ExchangeName => {
    return opp.marketPair?.market1?.exchange ||
           opp.pair?.market1?.exchange ||
           opp.exchange1 ||
           'KALSHI';
  }, []);

  const getMarketTitle = useCallback((opp: ArbitrageOpportunity): string => {
    return opp.marketPair?.market1?.title ||
           opp.pair?.market1?.title ||
           opp.market1Title ||
           '';
  }, []);

  const filteredAndSortedOpportunities = useMemo(() => {
    let result = opportunities.filter(opp => {
      if (opp.profitPercent < filters.minProfit) return false;
      if (opp.profitPercent > filters.maxProfit) return false;
      if (opp.confidence < filters.minConfidence) return false;

      const exchange = getExchange(opp);
      if (!filters.exchanges.includes(exchange)) return false;

      const days = getResolutionDays(opp);
      if (days < filters.minResolutionDays) return false;

      if (filters.searchQuery) {
        const title = getMarketTitle(opp).toLowerCase();
        if (!title.includes(filters.searchQuery.toLowerCase())) return false;
      }

      return true;
    });

    result.sort((a, b) => {
      let aVal: number, bVal: number;

      switch (sort.field) {
        case 'profitPercent':
          aVal = a.profitPercent;
          bVal = b.profitPercent;
          break;
        case 'confidence':
          aVal = a.confidence;
          bVal = b.confidence;
          break;
        case 'resolutionDays':
          aVal = getResolutionDays(a);
          bVal = getResolutionDays(b);
          break;
        case 'timestamp':
          aVal = new Date(a.timestamp).getTime();
          bVal = new Date(b.timestamp).getTime();
          break;
        default:
          aVal = a.profitPercent;
          bVal = b.profitPercent;
      }

      return sort.direction === 'asc' ? aVal - bVal : bVal - aVal;
    });

    return result;
  }, [opportunities, filters, sort, getExchange, getResolutionDays, getMarketTitle]);

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-8">
                <h1 className="text-2xl font-bold text-gray-900">
                  Arbitrage Scanner
                </h1>
                <nav className="hidden md:flex space-x-4">
                  <Link href="/" className="text-primary-600 font-medium">Dashboard</Link>
                  <Link href="/monitor" className="text-gray-600 hover:text-gray-900">Monitor</Link>
                  <Link href="/positions" className="text-gray-600 hover:text-gray-900">Positions</Link>
                  <Link href="/analytics" className="text-gray-600 hover:text-gray-900">Analytics</Link>
                  <Link href="/settings" className="text-gray-600 hover:text-gray-900">Settings</Link>
                </nav>
              </div>
              <div className="flex items-center gap-4">
                <div className="relative">
                  <button
                    onClick={() => setShowAlertSettings(!showAlertSettings)}
                    className="p-2 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100"
                    title="Alert Settings"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                  </button>
                  {showAlertSettings && (
                    <div className="absolute right-0 mt-2 z-50">
                      <AlertSettings onClose={() => setShowAlertSettings(false)} />
                    </div>
                  )}
                </div>
                <ScannerStatus connected={connected} />
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <div className="space-y-8">
            {stats && <StatsCards stats={stats} />}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2">
                <div className="bg-white shadow rounded-lg p-6">
                  <div className="flex justify-between items-center mb-4">
                    <div>
                      <h2 className="text-xl font-semibold text-gray-900">
                        Opportunities
                      </h2>
                      <p className="text-sm text-gray-500 mt-1">
                        Showing {filteredAndSortedOpportunities.length} of {opportunities.length}
                      </p>
                    </div>
                    <button
                      onClick={triggerScan}
                      disabled={scanning}
                      className={`px-4 py-2 rounded-md transition flex items-center space-x-2 ${
                        scanning
                          ? 'bg-gray-400 cursor-not-allowed'
                          : 'bg-primary-600 hover:bg-primary-700'
                      } text-white`}
                    >
                      {scanning && (
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      )}
                      <span>{scanning ? 'Scanning...' : 'Trigger Scan'}</span>
                    </button>
                  </div>

                  <OpportunityFilters
                    filters={filters}
                    sort={sort}
                    onFiltersChange={setFilters}
                    onSortChange={setSort}
                  />

                  <OpportunityList
                    opportunities={filteredAndSortedOpportunities}
                    loading={loading}
                  />
                </div>
              </div>

              <div className="space-y-6">
                <RiskDashboard metrics={riskMetrics ?? undefined} />
                <ForecastPanel forecast={forecast?.forecast} timing={forecast?.timing} />
              </div>
            </div>
          </div>
        </main>
      </div>
    </ErrorBoundary>
  );
}
