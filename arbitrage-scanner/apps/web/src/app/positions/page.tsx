'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { formatDistanceToNow, differenceInHours, format } from 'date-fns';
import { ScannerStatus } from '@/components/ScannerStatus';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ResolutionRiskBadge } from '@/components/ResolutionRiskBadge';
import { useWebSocket } from '@/lib/useWebSocket';
import { apiClient } from '@/lib/api';

interface Position {
  id: string;
  opportunityId?: string;
  exchange1: string;
  exchange1MarketId: string;
  exchange2: string;
  exchange2MarketId: string;
  entryProfit: number;
  resolutionScore: number;
  status: 'open' | 'closed' | 'expired';
  createdAt: string;
  closedAt?: string;
  exitProfit?: number;
  notes?: string;
}

export default function PositionsPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkClosing, setBulkClosing] = useState(false);

  const { connected } = useWebSocket();

  useEffect(() => {
    loadPositions();
  }, []);

  async function loadPositions() {
    try {
      setLoading(true);
      const result = await apiClient.getPositions();
      setPositions(result.data || []);
    } catch (error) {
      console.error('Failed to load positions:', error);
    } finally {
      setLoading(false);
    }
  }

  async function closePosition(id: string, exitProfit: number) {
    try {
      await apiClient.updatePosition(id, {
        status: 'closed',
        closedAt: new Date().toISOString(),
        exitProfit
      });
      loadPositions();
    } catch (error) {
      console.error('Failed to close position:', error);
    }
  }

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    const openIds = filteredPositions.filter(p => p.status === 'open').map(p => p.id);
    const allSelected = openIds.every(id => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(openIds));
    }
  }, []);

  const closeSelectedPositions = async () => {
    const exitProfit = prompt('Enter exit profit % for all selected positions:', '0');
    if (exitProfit === null) return;

    const profit = parseFloat(exitProfit);
    if (isNaN(profit)) return;

    setBulkClosing(true);
    try {
      const promises = Array.from(selectedIds).map(id =>
        apiClient.updatePosition(id, {
          status: 'closed',
          closedAt: new Date().toISOString(),
          exitProfit: profit
        })
      );
      await Promise.all(promises);
      setSelectedIds(new Set());
      loadPositions();
    } catch (error) {
      console.error('Failed to close positions:', error);
    } finally {
      setBulkClosing(false);
    }
  };

  const exportToCSV = useCallback(() => {
    const positionsToExport = selectedIds.size > 0
      ? positions.filter(p => selectedIds.has(p.id))
      : filteredPositions;

    const headers = ['ID', 'Exchange 1', 'Exchange 2', 'Entry Profit', 'Exit Profit', 'Resolution Score', 'Status', 'Created', 'Closed', 'Notes'];
    const rows = positionsToExport.map(p => [
      p.id,
      p.exchange1,
      p.exchange2,
      p.entryProfit.toFixed(2),
      p.exitProfit?.toFixed(2) || '',
      p.resolutionScore.toFixed(0),
      p.status,
      format(new Date(p.createdAt), 'yyyy-MM-dd HH:mm'),
      p.closedAt ? format(new Date(p.closedAt), 'yyyy-MM-dd HH:mm') : '',
      p.notes || ''
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `positions-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [selectedIds, positions]);

  const filteredPositions = statusFilter === 'all'
    ? positions
    : positions.filter(p => p.status === statusFilter);

  const openPositions = positions.filter(p => p.status === 'open');
  const closedPositions = positions.filter(p => p.status === 'closed');

  const totalPnL = closedPositions.reduce((sum, p) => {
    const pnl = (p.exitProfit || 0) - p.entryProfit;
    return sum + pnl;
  }, 0);

  const avgResolutionScore = positions.length > 0
    ? positions.reduce((sum, p) => sum + p.resolutionScore, 0) / positions.length
    : 0;

  const openFilteredIds = filteredPositions.filter(p => p.status === 'open').map(p => p.id);
  const allOpenSelected = openFilteredIds.length > 0 && openFilteredIds.every(id => selectedIds.has(id));
  const someSelected = selectedIds.size > 0;

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
                  <Link href="/positions" className="text-primary-600 font-medium">Positions</Link>
                  <Link href="/analytics" className="text-gray-600 hover:text-gray-900">Analytics</Link>
                </nav>
              </div>
              <ScannerStatus connected={connected} />
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white shadow rounded-lg p-6">
              <div className="text-sm text-gray-500">Open Positions</div>
              <div className="text-3xl font-bold text-gray-900">{openPositions.length}</div>
            </div>
            <div className="bg-white shadow rounded-lg p-6">
              <div className="text-sm text-gray-500">Closed Positions</div>
              <div className="text-3xl font-bold text-gray-900">{closedPositions.length}</div>
            </div>
            <div className="bg-white shadow rounded-lg p-6">
              <div className="text-sm text-gray-500">Total P&L</div>
              <div className={`text-3xl font-bold ${totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {totalPnL >= 0 ? '+' : ''}{totalPnL.toFixed(2)}%
              </div>
            </div>
            <div className="bg-white shadow rounded-lg p-6">
              <div className="text-sm text-gray-500">Avg Resolution Score</div>
              <div className="text-3xl font-bold text-gray-900">{avgResolutionScore.toFixed(0)}</div>
            </div>
          </div>

          <div className="bg-white shadow rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200 flex flex-wrap justify-between items-center gap-4">
              <div className="flex items-center gap-4">
                <h2 className="text-lg font-semibold text-gray-900">Positions</h2>
                {someSelected && (
                  <span className="text-sm text-gray-500">
                    {selectedIds.size} selected
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {someSelected && (
                  <>
                    <button
                      onClick={closeSelectedPositions}
                      disabled={bulkClosing}
                      className={`px-3 py-1.5 text-sm font-medium rounded-md text-white transition ${
                        bulkClosing ? 'bg-gray-400' : 'bg-red-600 hover:bg-red-700'
                      }`}
                    >
                      {bulkClosing ? 'Closing...' : `Close ${selectedIds.size}`}
                    </button>
                    <button
                      onClick={() => setSelectedIds(new Set())}
                      className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900"
                    >
                      Clear
                    </button>
                  </>
                )}

                <button
                  onClick={exportToCSV}
                  className="px-3 py-1.5 text-sm font-medium rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Export CSV
                </button>

                <div className="flex space-x-1 ml-2">
                  {(['all', 'open', 'closed'] as const).map(status => (
                    <button
                      key={status}
                      onClick={() => setStatusFilter(status)}
                      className={`px-3 py-1 rounded-md text-sm font-medium ${
                        statusFilter === status
                          ? 'bg-primary-100 text-primary-700'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {loading ? (
              <div className="text-center py-12 text-gray-500">
                Loading positions...
              </div>
            ) : filteredPositions.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                <p className="mt-2">No positions found</p>
                <p className="text-sm">Track positions from the dashboard or opportunity details page</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left">
                        <input
                          type="checkbox"
                          checked={allOpenSelected}
                          onChange={toggleSelectAll}
                          className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                        />
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Position
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Entry Profit
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Resolution
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Age
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredPositions.map(position => {
                      const hoursOpen = differenceInHours(new Date(), new Date(position.createdAt));
                      const isSelected = selectedIds.has(position.id);
                      const isOpen = position.status === 'open';

                      return (
                        <tr
                          key={position.id}
                          className={`hover:bg-gray-50 ${isSelected ? 'bg-primary-50' : ''}`}
                        >
                          <td className="px-4 py-4">
                            {isOpen ? (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelect(position.id)}
                                className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                              />
                            ) : (
                              <div className="h-4 w-4" />
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm font-medium text-gray-900">
                              {position.exchange1} ↔ {position.exchange2}
                            </div>
                            <div className="text-xs text-gray-500 font-mono">
                              {position.id}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`text-sm font-semibold ${
                              position.entryProfit >= 5 ? 'text-green-600' : 'text-green-500'
                            }`}>
                              {position.entryProfit.toFixed(2)}%
                            </span>
                            {position.status === 'closed' && position.exitProfit !== undefined && (
                              <div className={`text-xs ${
                                position.exitProfit >= position.entryProfit
                                  ? 'text-green-600'
                                  : 'text-red-600'
                              }`}>
                                Exit: {position.exitProfit.toFixed(2)}%
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <ResolutionRiskBadge score={position.resolutionScore} showTooltip={false} />
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500">
                            {formatDistanceToNow(new Date(position.createdAt), { addSuffix: true })}
                            {hoursOpen >= 24 && position.status === 'open' && (
                              <div className="text-xs text-yellow-600">
                                {Math.floor(hoursOpen / 24)}d old
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                              position.status === 'open'
                                ? 'bg-blue-100 text-blue-800'
                                : position.status === 'closed'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              {position.status}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            {position.status === 'open' && (
                              <div className="flex space-x-2">
                                <button
                                  onClick={() => {
                                    const exitProfit = prompt('Enter exit profit %:', position.entryProfit.toString());
                                    if (exitProfit !== null) {
                                      closePosition(position.id, parseFloat(exitProfit));
                                    }
                                  }}
                                  className="text-sm text-primary-600 hover:text-primary-800"
                                >
                                  Close
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>
    </ErrorBoundary>
  );
}
