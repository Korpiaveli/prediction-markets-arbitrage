'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { format, differenceInDays } from 'date-fns';
import { ScannerStatus } from '@/components/ScannerStatus';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ResolutionScoreBar } from '@/components/ResolutionRiskBadge';
import { useWebSocket } from '@/lib/useWebSocket';
import { apiClient } from '@/lib/api';

function parseDirection(direction: string): { leg1: string; leg2: string } {
  if (!direction) return { leg1: '?', leg2: '?' };
  if (direction.includes('EXCHANGE1_YES') || direction.includes('KALSHI_YES')) {
    return { leg1: 'YES', leg2: 'NO' };
  } else if (direction.includes('EXCHANGE1_NO') || direction.includes('KALSHI_NO')) {
    return { leg1: 'NO', leg2: 'YES' };
  }
  return { leg1: '?', leg2: '?' };
}

const QUICK_STAKES = [10, 50, 100, 500];

export default function OpportunityDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [opportunity, setOpportunity] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stake, setStake] = useState<number>(10);

  const { connected } = useWebSocket();

  useEffect(() => {
    if (params.id) {
      loadOpportunity(params.id as string);
    }
  }, [params.id]);

  async function loadOpportunity(id: string) {
    try {
      setLoading(true);
      setError(null);
      const result = await apiClient.getOpportunity(id);
      setOpportunity(result.data);
    } catch (err) {
      setError('Failed to load opportunity details');
      console.error('Failed to load opportunity:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreatePosition() {
    if (!opportunity) return;

    try {
      await apiClient.createPosition({
        opportunityId: opportunity.id,
        exchange1: opportunity.marketPair?.market1?.exchange || opportunity.exchange1,
        exchange1MarketId: opportunity.marketPair?.market1?.id || opportunity.market1Id,
        exchange2: opportunity.marketPair?.market2?.exchange || opportunity.exchange2,
        exchange2MarketId: opportunity.marketPair?.market2?.id || opportunity.market2Id,
        entryProfit: opportunity.profitPercent,
        resolutionScore: opportunity.resolutionScore || opportunity.resolution?.score || 0
      });
      router.push('/positions');
    } catch (err) {
      console.error('Failed to create position:', err);
    }
  }

  const getMarket1 = () => opportunity?.marketPair?.market1 || opportunity?.pair?.market1 || {};
  const getMarket2 = () => opportunity?.marketPair?.market2 || opportunity?.pair?.market2 || {};

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
                  <Link href="/analytics" className="text-gray-600 hover:text-gray-900">Analytics</Link>
                </nav>
              </div>
              <ScannerStatus connected={connected} />
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-6">
            <Link href="/" className="text-sm text-gray-600 hover:text-gray-900 flex items-center">
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Dashboard
            </Link>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
              <p className="mt-4 text-gray-500">Loading opportunity details...</p>
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
              <p className="text-red-800">{error}</p>
              <button
                onClick={() => router.push('/')}
                className="mt-4 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Return to Dashboard
              </button>
            </div>
          ) : opportunity ? (
            <div className="space-y-6">
              <div className="bg-white shadow rounded-lg p-6">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">
                      {getMarket1().title || 'Opportunity Details'}
                    </h2>
                    <p className="text-gray-500 mt-1">
                      {getMarket1().exchange} ↔ {getMarket2().exchange}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className={`text-3xl font-bold ${
                      opportunity.profitPercent >= 5 ? 'text-green-600' : 'text-green-500'
                    }`}>
                      {opportunity.profitPercent?.toFixed(2)}%
                    </div>
                    <div className="text-sm text-gray-500">Potential Profit</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="text-sm font-medium text-gray-700 mb-3">
                      {getMarket1().exchange || 'Exchange 1'}
                    </h3>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Title</span>
                        <span className="text-gray-900 text-right max-w-xs truncate">
                          {getMarket1().title}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Market ID</span>
                        <span className="text-gray-900 font-mono text-sm">
                          {getMarket1().id || getMarket1().exchangeId}
                        </span>
                      </div>
                      {getMarket1().closeTime && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Close Time</span>
                          <span className="text-gray-900">
                            {format(new Date(getMarket1().closeTime), 'MMM d, yyyy HH:mm')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="text-sm font-medium text-gray-700 mb-3">
                      {getMarket2().exchange || 'Exchange 2'}
                    </h3>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Title</span>
                        <span className="text-gray-900 text-right max-w-xs truncate">
                          {getMarket2().title}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Market ID</span>
                        <span className="text-gray-900 font-mono text-sm">
                          {getMarket2().id || getMarket2().exchangeId}
                        </span>
                      </div>
                      {getMarket2().closeTime && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Close Time</span>
                          <span className="text-gray-900">
                            {format(new Date(getMarket2().closeTime), 'MMM d, yyyy HH:mm')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="border-t border-gray-200 pt-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Resolution Analysis</h3>
                  <ResolutionScoreBar
                    score={opportunity.resolutionScore || opportunity.resolution?.score || 0}
                  />

                  {(opportunity.resolution || opportunity.marketPair?.resolutionAlignment) && (
                    <div className="mt-4 grid grid-cols-3 gap-4">
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <div className="text-2xl font-semibold text-gray-900">
                          {(opportunity.resolution?.timingMatch || opportunity.marketPair?.resolutionAlignment?.timingMatch || 0)}%
                        </div>
                        <div className="text-sm text-gray-500">Timing Match</div>
                      </div>
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <div className="text-2xl font-semibold text-gray-900">
                          {(opportunity.resolution?.semanticMatch || opportunity.marketPair?.resolutionAlignment?.semanticMatch || 0)}%
                        </div>
                        <div className="text-sm text-gray-500">Semantic Match</div>
                      </div>
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <div className="text-2xl font-semibold text-gray-900">
                          {(opportunity.resolution?.rulesMatch || opportunity.marketPair?.resolutionAlignment?.rulesMatch || 0)}%
                        </div>
                        <div className="text-sm text-gray-500">Rules Match</div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-6 flex justify-end space-x-3">
                  <button
                    onClick={() => router.push('/')}
                    className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreatePosition}
                    className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
                  >
                    Track Position
                  </button>
                </div>
              </div>

              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Trade Direction</h3>
                {(() => {
                  const dir = parseDirection(opportunity.direction);
                  const ex1 = getMarket1().exchange || 'Exchange 1';
                  const ex2 = getMarket2().exchange || 'Exchange 2';
                  return (
                    <div className="grid grid-cols-2 gap-4">
                      <div className={`p-4 rounded-lg border-2 ${
                        dir.leg1 === 'YES' ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'
                      }`}>
                        <div className="text-sm font-medium text-gray-600 mb-1">{ex1}</div>
                        <div className={`text-2xl font-bold ${
                          dir.leg1 === 'YES' ? 'text-green-700' : 'text-red-700'
                        }`}>
                          BUY {dir.leg1}
                        </div>
                      </div>
                      <div className={`p-4 rounded-lg border-2 ${
                        dir.leg2 === 'YES' ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'
                      }`}>
                        <div className="text-sm font-medium text-gray-600 mb-1">{ex2}</div>
                        <div className={`text-2xl font-bold ${
                          dir.leg2 === 'YES' ? 'text-green-700' : 'text-red-700'
                        }`}>
                          BUY {dir.leg2}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Payout Calculator</h3>
                {(() => {
                  const totalCost = opportunity.totalCost || 1;
                  const contracts = stake / totalCost;
                  const profit = contracts * (opportunity.profitPercent / 100);
                  const maxStake = opportunity.maxSize || 1000;
                  const maxProfit = (maxStake / totalCost) * (opportunity.profitPercent / 100);

                  return (
                    <div className="space-y-4">
                      <div className="flex items-center gap-4">
                        <div className="flex-1">
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Stake Amount
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-2 text-gray-500">$</span>
                            <input
                              type="number"
                              min="1"
                              max={maxStake}
                              step="1"
                              value={stake}
                              onChange={(e) => setStake(Math.max(1, parseFloat(e.target.value) || 1))}
                              className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2 pt-6">
                          {QUICK_STAKES.map((amount) => (
                            <button
                              key={amount}
                              onClick={() => setStake(amount)}
                              className={`px-3 py-2 text-sm font-medium rounded-md transition ${
                                stake === amount
                                  ? 'bg-primary-600 text-white'
                                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                              }`}
                            >
                              ${amount}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="text-center p-3 bg-gray-50 rounded-lg">
                          <div className="text-2xl font-semibold text-gray-900">${stake.toFixed(2)}</div>
                          <div className="text-sm text-gray-500">Your Stake</div>
                        </div>
                        <div className="text-center p-3 bg-gray-50 rounded-lg">
                          <div className="text-2xl font-semibold text-gray-900">{contracts.toFixed(1)}</div>
                          <div className="text-sm text-gray-500">Contracts</div>
                        </div>
                        <div className="text-center p-3 bg-gray-50 rounded-lg">
                          <div className="text-2xl font-semibold text-gray-900">${(stake + profit).toFixed(2)}</div>
                          <div className="text-sm text-gray-500">Total Payout</div>
                        </div>
                        <div className="text-center p-3 bg-green-50 rounded-lg">
                          <div className="text-2xl font-semibold text-green-600">+${profit.toFixed(2)}</div>
                          <div className="text-sm text-gray-500">Net Profit</div>
                        </div>
                      </div>

                      <div className="text-xs text-gray-500 flex justify-between pt-2 border-t border-gray-200">
                        <span>Max available: ${maxStake.toFixed(2)}</span>
                        <span>Max potential profit: +${maxProfit.toFixed(2)}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Resolution Timeline</h3>
                {(() => {
                  const close1 = getMarket1().closeTime;
                  const close2 = getMarket2().closeTime;
                  const date1 = close1 ? new Date(close1) : null;
                  const date2 = close2 ? new Date(close2) : null;
                  const now = new Date();
                  const days1 = date1 ? differenceInDays(date1, now) : null;
                  const days2 = date2 ? differenceInDays(date2, now) : null;
                  const timingGap = days1 !== null && days2 !== null ? Math.abs(days1 - days2) : null;

                  return (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-gray-50 rounded-lg">
                          <div className="text-sm font-medium text-gray-600 mb-1">
                            {getMarket1().exchange || 'Exchange 1'}
                          </div>
                          {date1 ? (
                            <>
                              <div className="text-lg font-semibold text-gray-900">
                                {format(date1, 'MMM d, yyyy')}
                              </div>
                              <div className="text-sm text-gray-500">{days1} days</div>
                            </>
                          ) : (
                            <div className="text-gray-400">No close date</div>
                          )}
                        </div>
                        <div className="p-4 bg-gray-50 rounded-lg">
                          <div className="text-sm font-medium text-gray-600 mb-1">
                            {getMarket2().exchange || 'Exchange 2'}
                          </div>
                          {date2 ? (
                            <>
                              <div className="text-lg font-semibold text-gray-900">
                                {format(date2, 'MMM d, yyyy')}
                              </div>
                              <div className="text-sm text-gray-500">{days2} days</div>
                            </>
                          ) : (
                            <div className="text-gray-400">No close date</div>
                          )}
                        </div>
                      </div>
                      {timingGap !== null && timingGap > 0 && (
                        <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                          <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          <span className="text-yellow-800">
                            Markets resolve {timingGap} day{timingGap !== 1 ? 's' : ''} apart
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Trade Details</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <div className="text-sm text-gray-500">Confidence</div>
                    <div className="text-lg font-semibold text-gray-900">
                      {(opportunity.confidence || 0).toFixed(0)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Valid</div>
                    <div className={`text-lg font-semibold ${opportunity.valid ? 'text-green-600' : 'text-red-600'}`}>
                      {opportunity.valid ? 'Yes' : 'No'}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Total Cost</div>
                    <div className="text-lg font-semibold text-gray-900">
                      ${opportunity.totalCost?.toFixed(2) || 'N/A'}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Timestamp</div>
                    <div className="text-lg font-semibold text-gray-900">
                      {opportunity.timestamp ? format(new Date(opportunity.timestamp), 'HH:mm:ss') : 'N/A'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              Opportunity not found
            </div>
          )}
        </main>
      </div>
    </ErrorBoundary>
  );
}
