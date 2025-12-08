'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { format, subDays, parseISO, startOfDay } from 'date-fns';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell
} from 'recharts';
import { ScannerStatus } from '@/components/ScannerStatus';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useWebSocket } from '@/lib/useWebSocket';
import { apiClient } from '@/lib/api';
import type { ArbitrageOpportunity, PositionRecord, StatsData } from '@/types';

type Period = '7d' | '30d' | '90d' | 'all';

interface AnalyticsData {
  opportunities: ArbitrageOpportunity[];
  positions: PositionRecord[];
  stats: StatsData | null;
}

const COLORS = ['#10B981', '#EF4444', '#3B82F6', '#F59E0B', '#8B5CF6'];

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>('30d');
  const [data, setData] = useState<AnalyticsData>({ opportunities: [], positions: [], stats: null });
  const [loading, setLoading] = useState(true);

  const { connected } = useWebSocket();

  useEffect(() => {
    loadData();
  }, [period]);

  async function loadData() {
    try {
      setLoading(true);
      const days = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 365;

      const [oppsData, positionsData, statsData] = await Promise.all([
        apiClient.getOpportunities({ limit: 500 }),
        apiClient.getPositions(),
        apiClient.getStats()
      ]);

      const cutoffDate = subDays(new Date(), days);
      const filteredOpps = (oppsData.data || []).filter((opp: ArbitrageOpportunity) =>
        new Date(opp.timestamp) >= cutoffDate
      );

      setData({
        opportunities: filteredOpps,
        positions: positionsData.data || [],
        stats: statsData.data
      });
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setLoading(false);
    }
  }

  const profitOverTime = useMemo(() => {
    const dayMap = new Map<string, { total: number; count: number; valid: number }>();

    data.opportunities.forEach(opp => {
      const day = format(new Date(opp.timestamp), 'MMM dd');
      const existing = dayMap.get(day) || { total: 0, count: 0, valid: 0 };
      dayMap.set(day, {
        total: existing.total + opp.profitPercent,
        count: existing.count + 1,
        valid: existing.valid + (opp.valid ? 1 : 0)
      });
    });

    return Array.from(dayMap.entries())
      .map(([date, vals]) => ({
        date,
        avgProfit: vals.total / vals.count,
        count: vals.count,
        validRate: (vals.valid / vals.count) * 100
      }))
      .slice(-14);
  }, [data.opportunities]);

  const profitDistribution = useMemo(() => {
    const buckets = [
      { range: '0-1%', min: 0, max: 1, count: 0 },
      { range: '1-2%', min: 1, max: 2, count: 0 },
      { range: '2-5%', min: 2, max: 5, count: 0 },
      { range: '5-10%', min: 5, max: 10, count: 0 },
      { range: '10%+', min: 10, max: 100, count: 0 }
    ];

    data.opportunities.forEach(opp => {
      const bucket = buckets.find(b => opp.profitPercent >= b.min && opp.profitPercent < b.max);
      if (bucket) bucket.count++;
    });

    return buckets;
  }, [data.opportunities]);

  const exchangeBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};

    data.opportunities.forEach(opp => {
      const ex1 = opp.marketPair?.market1?.exchange || opp.exchange1 || 'Unknown';
      const ex2 = opp.marketPair?.market2?.exchange || opp.exchange2 || 'Unknown';
      counts[ex1] = (counts[ex1] || 0) + 1;
      counts[ex2] = (counts[ex2] || 0) + 1;
    });

    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [data.opportunities]);

  const positionStats = useMemo(() => {
    const open = data.positions.filter(p => p.status === 'open').length;
    const closed = data.positions.filter(p => p.status === 'closed').length;
    const totalProfit = data.positions
      .filter(p => p.status === 'closed' && p.exitProfit)
      .reduce((sum, p) => sum + (p.exitProfit || 0), 0);
    const avgProfit = closed > 0 ? totalProfit / closed : 0;

    return { open, closed, totalProfit, avgProfit };
  }, [data.positions]);

  const summaryStats = useMemo(() => {
    if (!data.stats) return null;
    return {
      total: data.opportunities.length,
      avgProfit: data.stats.avgProfit,
      maxProfit: data.stats.maxProfit,
      avgConfidence: data.stats.avgConfidence,
      validRate: data.stats.validCount / Math.max(1, data.stats.total) * 100
    };
  }, [data.stats, data.opportunities]);

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
                  <Link href="/" className="text-gray-600 hover:text-gray-900">Dashboard</Link>
                  <Link href="/monitor" className="text-gray-600 hover:text-gray-900">Monitor</Link>
                  <Link href="/positions" className="text-gray-600 hover:text-gray-900">Positions</Link>
                  <Link href="/analytics" className="text-primary-600 font-medium">Analytics</Link>
                </nav>
              </div>
              <ScannerStatus connected={connected} />
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-gray-900">Performance Analytics</h2>
            <div className="flex gap-2">
              {(['7d', '30d', '90d', 'all'] as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition ${
                    period === p
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {p === 'all' ? 'All Time' : p.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
              <p className="mt-4 text-gray-500">Loading analytics...</p>
            </div>
          ) : (
            <div className="space-y-6">
              {summaryStats && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="bg-white shadow rounded-lg p-4">
                    <div className="text-2xl font-bold text-gray-900">{summaryStats.total}</div>
                    <div className="text-sm text-gray-500">Total Opportunities</div>
                  </div>
                  <div className="bg-white shadow rounded-lg p-4">
                    <div className="text-2xl font-bold text-green-600">{summaryStats.avgProfit.toFixed(2)}%</div>
                    <div className="text-sm text-gray-500">Avg Profit</div>
                  </div>
                  <div className="bg-white shadow rounded-lg p-4">
                    <div className="text-2xl font-bold text-green-600">{summaryStats.maxProfit.toFixed(2)}%</div>
                    <div className="text-sm text-gray-500">Max Profit</div>
                  </div>
                  <div className="bg-white shadow rounded-lg p-4">
                    <div className="text-2xl font-bold text-gray-900">{summaryStats.avgConfidence.toFixed(0)}%</div>
                    <div className="text-sm text-gray-500">Avg Confidence</div>
                  </div>
                  <div className="bg-white shadow rounded-lg p-4">
                    <div className="text-2xl font-bold text-blue-600">{summaryStats.validRate.toFixed(0)}%</div>
                    <div className="text-sm text-gray-500">Valid Rate</div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white shadow rounded-lg p-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Profit Over Time</h3>
                  {profitOverTime.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={profitOverTime}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="avgProfit" name="Avg Profit %" stroke="#10B981" strokeWidth={2} />
                        <Line type="monotone" dataKey="validRate" name="Valid Rate %" stroke="#3B82F6" strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="text-center py-12 text-gray-500">No data available</div>
                  )}
                </div>

                <div className="bg-white shadow rounded-lg p-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Profit Distribution</h3>
                  {profitDistribution.some(b => b.count > 0) ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={profitDistribution}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="range" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip />
                        <Bar dataKey="count" name="Opportunities" fill="#10B981" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="text-center py-12 text-gray-500">No data available</div>
                  )}
                </div>

                <div className="bg-white shadow rounded-lg p-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Exchange Breakdown</h3>
                  {exchangeBreakdown.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={exchangeBreakdown}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          outerRadius={100}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {exchangeBreakdown.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="text-center py-12 text-gray-500">No data available</div>
                  )}
                </div>

                <div className="bg-white shadow rounded-lg p-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Position Summary</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-4 bg-blue-50 rounded-lg">
                      <div className="text-3xl font-bold text-blue-600">{positionStats.open}</div>
                      <div className="text-sm text-gray-600">Open Positions</div>
                    </div>
                    <div className="text-center p-4 bg-gray-50 rounded-lg">
                      <div className="text-3xl font-bold text-gray-700">{positionStats.closed}</div>
                      <div className="text-sm text-gray-600">Closed Positions</div>
                    </div>
                    <div className="text-center p-4 bg-green-50 rounded-lg">
                      <div className={`text-3xl font-bold ${positionStats.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {positionStats.totalProfit >= 0 ? '+' : ''}{positionStats.totalProfit.toFixed(2)}%
                      </div>
                      <div className="text-sm text-gray-600">Total Realized P&L</div>
                    </div>
                    <div className="text-center p-4 bg-green-50 rounded-lg">
                      <div className={`text-3xl font-bold ${positionStats.avgProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {positionStats.avgProfit >= 0 ? '+' : ''}{positionStats.avgProfit.toFixed(2)}%
                      </div>
                      <div className="text-sm text-gray-600">Avg Profit/Trade</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Daily Activity</h3>
                {profitOverTime.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={profitOverTime}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Bar dataKey="count" name="Opportunities Found" fill="#3B82F6" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center py-12 text-gray-500">No activity data available</div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </ErrorBoundary>
  );
}
