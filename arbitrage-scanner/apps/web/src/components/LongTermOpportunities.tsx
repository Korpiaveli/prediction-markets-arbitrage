'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../lib/api';

interface LongTermOpportunity {
  id: string;
  opportunityId: string;
  market1Title: string;
  market2Title: string;
  exchange1: string;
  exchange2: string;
  profitPercent: number;
  daysToResolution: number;
  resolutionDate: string | null;
  confidence: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  capitalLockupWarning: string;
}

interface LongTermOpportunitiesProps {
  minDays?: number;
  limit?: number;
}

export function LongTermOpportunities({
  minDays = 90,
  limit = 20
}: LongTermOpportunitiesProps) {
  const [opportunities, setOpportunities] = useState<LongTermOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'profit' | 'resolution' | 'confidence'>('profit');
  const [sortAsc, setSortAsc] = useState(false);

  const fetchOpportunities = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiClient.getOpportunities({ limit: 500 });

      if (response.success && response.data) {
        // Filter and transform to long-term opportunities
        const longTerm = response.data
          .filter((opp: any) => {
            const closeTime = opp.marketPair?.market1?.closeTime || opp.marketPair?.market2?.closeTime;
            if (!closeTime) return false;
            const daysToRes = (new Date(closeTime).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
            return daysToRes >= minDays;
          })
          .map((opp: any): LongTermOpportunity => {
            const closeTime = opp.marketPair?.market1?.closeTime || opp.marketPair?.market2?.closeTime;
            const daysToRes = closeTime
              ? Math.round((new Date(closeTime).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
              : 365;

            return {
              id: opp.id,
              opportunityId: opp.id,
              market1Title: opp.marketPair?.market1?.title || 'Unknown',
              market2Title: opp.marketPair?.market2?.title || 'Unknown',
              exchange1: opp.marketPair?.exchange1 || 'Unknown',
              exchange2: opp.marketPair?.exchange2 || 'Unknown',
              profitPercent: opp.profitPercent || 0,
              daysToResolution: daysToRes,
              resolutionDate: closeTime,
              confidence: opp.confidence || 0,
              riskLevel: getRiskLevel(opp.confidence, daysToRes),
              capitalLockupWarning: getCapitalLockupWarning(daysToRes)
            };
          })
          .slice(0, limit);

        setOpportunities(longTerm);
      }
    } catch (err) {
      console.error('Failed to fetch long-term opportunities:', err);
    } finally {
      setLoading(false);
    }
  }, [minDays, limit]);

  useEffect(() => {
    fetchOpportunities();
  }, [fetchOpportunities]);

  const sortedOpportunities = [...opportunities].sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case 'profit':
        cmp = a.profitPercent - b.profitPercent;
        break;
      case 'resolution':
        cmp = a.daysToResolution - b.daysToResolution;
        break;
      case 'confidence':
        cmp = a.confidence - b.confidence;
        break;
    }
    return sortAsc ? cmp : -cmp;
  });

  const handleSort = (field: 'profit' | 'resolution' | 'confidence') => {
    if (sortBy === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(field);
      setSortAsc(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white shadow rounded-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-amber-50 to-orange-50">
        <div className="flex items-center gap-2">
          <span className="text-2xl">📅</span>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Long-Term Opportunities</h3>
            <p className="text-sm text-gray-600">Markets resolving in {minDays}+ days - Capital Lock-up Required</p>
          </div>
        </div>
      </div>

      {/* Warning Banner */}
      <div className="px-6 py-3 bg-amber-50 border-b border-amber-200">
        <div className="flex items-start gap-2 text-amber-800">
          <span className="text-lg">⚠️</span>
          <div className="text-sm">
            <strong>Capital Lock-up Warning:</strong> These opportunities require holding positions for extended periods.
            Consider opportunity cost and ensure you won't need the capital before resolution.
          </div>
        </div>
      </div>

      {opportunities.length === 0 ? (
        <div className="px-6 py-12 text-center text-gray-500">
          No long-term opportunities found (markets resolving in {minDays}+ days)
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Markets
                </th>
                <th
                  className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('profit')}
                >
                  Profit {sortBy === 'profit' && (sortAsc ? '↑' : '↓')}
                </th>
                <th
                  className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('resolution')}
                >
                  Resolution {sortBy === 'resolution' && (sortAsc ? '↑' : '↓')}
                </th>
                <th
                  className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('confidence')}
                >
                  Confidence {sortBy === 'confidence' && (sortAsc ? '↑' : '↓')}
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Lock-up
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sortedOpportunities.map((opp) => (
                <tr key={opp.id} className="hover:bg-gray-50">
                  <td className="px-4 py-4">
                    <div className="text-sm font-medium text-gray-900 line-clamp-1">
                      {opp.market1Title}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {opp.exchange1} ↔ {opp.exchange2}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <span className="text-sm font-semibold text-green-600">
                      {opp.profitPercent.toFixed(2)}%
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="text-sm font-medium text-gray-900">
                      {opp.daysToResolution} days
                    </div>
                    {opp.resolutionDate && (
                      <div className="text-xs text-gray-500">
                        {new Date(opp.resolutionDate).toLocaleDateString()}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <ConfidenceBadge confidence={opp.confidence} />
                  </td>
                  <td className="px-4 py-4 text-center">
                    <LockupBadge days={opp.daysToResolution} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary Stats */}
      {opportunities.length > 0 && (
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
          <div className="grid grid-cols-3 gap-4 text-center text-sm">
            <div>
              <div className="font-semibold text-gray-900">
                {(opportunities.reduce((sum, o) => sum + o.profitPercent, 0) / opportunities.length).toFixed(2)}%
              </div>
              <div className="text-gray-500">Avg Profit</div>
            </div>
            <div>
              <div className="font-semibold text-gray-900">
                {Math.round(opportunities.reduce((sum, o) => sum + o.daysToResolution, 0) / opportunities.length)} days
              </div>
              <div className="text-gray-500">Avg Resolution</div>
            </div>
            <div>
              <div className="font-semibold text-gray-900">
                {Math.round(opportunities.reduce((sum, o) => sum + o.confidence, 0) / opportunities.length)}
              </div>
              <div className="text-gray-500">Avg Confidence</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const getColor = (c: number) => {
    if (c >= 90) return 'bg-green-100 text-green-800';
    if (c >= 75) return 'bg-blue-100 text-blue-800';
    if (c >= 60) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  return (
    <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${getColor(confidence)}`}>
      {confidence}
    </span>
  );
}

function LockupBadge({ days }: { days: number }) {
  const getColor = (d: number) => {
    if (d >= 365) return 'bg-red-100 text-red-800 border-red-200';
    if (d >= 180) return 'bg-orange-100 text-orange-800 border-orange-200';
    if (d >= 90) return 'bg-amber-100 text-amber-800 border-amber-200';
    return 'bg-yellow-100 text-yellow-800 border-yellow-200';
  };

  const getLabel = (d: number) => {
    if (d >= 365) return '1yr+';
    if (d >= 180) return '6mo+';
    if (d >= 90) return '3mo+';
    return `${d}d`;
  };

  return (
    <span className={`inline-flex px-2 py-1 rounded border text-xs font-medium ${getColor(days)}`}>
      🔒 {getLabel(days)}
    </span>
  );
}

function getRiskLevel(confidence: number, days: number): 'low' | 'medium' | 'high' | 'critical' {
  const confRisk = confidence < 60 ? 2 : confidence < 75 ? 1 : 0;
  const timeRisk = days > 365 ? 2 : days > 180 ? 1 : 0;
  const totalRisk = confRisk + timeRisk;

  if (totalRisk >= 3) return 'critical';
  if (totalRisk >= 2) return 'high';
  if (totalRisk >= 1) return 'medium';
  return 'low';
}

function getCapitalLockupWarning(days: number): string {
  if (days >= 365) return 'Very long lock-up period (1+ year). Consider opportunity cost carefully.';
  if (days >= 180) return 'Long lock-up period (6+ months). Capital will be tied up for extended time.';
  if (days >= 90) return 'Medium lock-up period (3+ months). Plan for capital allocation.';
  return 'Moderate lock-up period.';
}
