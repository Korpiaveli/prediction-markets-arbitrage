'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../lib/api';
import { RecommendationReport, Recommendation, RiskLevel, RecommendationStats } from '../types';

type TurnoverStrategy = 'conservative' | 'balanced' | 'aggressive';

interface RecommendationPanelProps {
  initialTop?: number;
  autoRefresh?: boolean;
  refreshInterval?: number;
  showTurnoverMetrics?: boolean;
}

export function RecommendationPanel({
  initialTop = 10,
  autoRefresh = false,
  refreshInterval = 60000,
  showTurnoverMetrics = true
}: RecommendationPanelProps) {
  const [report, setReport] = useState<RecommendationReport | null>(null);
  const [stats, setStats] = useState<RecommendationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [strategy, setStrategy] = useState<TurnoverStrategy>('balanced');
  const [filters, setFilters] = useState({
    top: initialTop,
    minScore: 0,
    minProfit: 0,
    maxHours: 720,
    maxDays: 90,
    minAnnualizedReturn: 0,
    riskLevels: [] as RiskLevel[]
  });
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchRecommendations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [reportRes, statsRes] = await Promise.all([
        apiClient.getRecommendations({
          top: filters.top,
          minScore: filters.minScore,
          minProfit: filters.minProfit,
          maxHours: filters.maxHours,
          riskLevels: filters.riskLevels.length > 0 ? filters.riskLevels : undefined
        }),
        apiClient.getRecommendationStats()
      ]);

      if (reportRes.success) {
        setReport(reportRes.data);
      }
      if (statsRes.success) {
        setStats(statsRes.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch recommendations');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchRecommendations();

    if (autoRefresh) {
      const interval = setInterval(fetchRecommendations, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchRecommendations, autoRefresh, refreshInterval]);

  const toggleRiskLevel = (level: RiskLevel) => {
    setFilters(prev => ({
      ...prev,
      riskLevels: prev.riskLevels.includes(level)
        ? prev.riskLevels.filter(l => l !== level)
        : [...prev.riskLevels, level]
    }));
  };

  if (loading && !report) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-20 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      {stats && (
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Score Distribution</h3>
          <div className="grid grid-cols-4 gap-4">
            <StatBox label="Excellent (80+)" value={stats.scoreDistribution.excellent} color="green" />
            <StatBox label="Good (60-79)" value={stats.scoreDistribution.good} color="blue" />
            <StatBox label="Fair (40-59)" value={stats.scoreDistribution.fair} color="yellow" />
            <StatBox label="Poor (<40)" value={stats.scoreDistribution.poor} color="red" />
          </div>
          <div className="mt-4 grid grid-cols-4 gap-4 text-center text-sm">
            <div>
              <div className="font-semibold text-gray-900">{stats.avgScores.overall.toFixed(1)}</div>
              <div className="text-gray-500">Avg Overall</div>
            </div>
            <div>
              <div className="font-semibold text-gray-900">{stats.avgScores.time.toFixed(1)}</div>
              <div className="text-gray-500">Avg Time</div>
            </div>
            <div>
              <div className="font-semibold text-gray-900">{stats.avgScores.profit.toFixed(1)}</div>
              <div className="text-gray-500">Avg Profit</div>
            </div>
            <div>
              <div className="font-semibold text-gray-900">{stats.avgScores.confidence.toFixed(1)}</div>
              <div className="text-gray-500">Avg Confidence</div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Filters</h3>
          <button
            onClick={fetchRecommendations}
            disabled={loading}
            className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Top N</label>
            <select
              value={filters.top}
              onChange={(e) => setFilters(prev => ({ ...prev, top: parseInt(e.target.value) }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            >
              <option value="5">Top 5</option>
              <option value="10">Top 10</option>
              <option value="20">Top 20</option>
              <option value="50">Top 50</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Min Score</label>
            <input
              type="number"
              min="0"
              max="100"
              value={filters.minScore}
              onChange={(e) => setFilters(prev => ({ ...prev, minScore: parseInt(e.target.value) || 0 }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Min Profit %</label>
            <input
              type="number"
              min="0"
              step="0.1"
              value={filters.minProfit}
              onChange={(e) => setFilters(prev => ({ ...prev, minProfit: parseFloat(e.target.value) || 0 }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Max Hours</label>
            <input
              type="number"
              min="1"
              value={filters.maxHours}
              onChange={(e) => setFilters(prev => ({ ...prev, maxHours: parseInt(e.target.value) || 720 }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            />
          </div>
        </div>
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Risk Levels</label>
          <div className="flex gap-2">
            {(['low', 'medium', 'high', 'critical'] as RiskLevel[]).map(level => (
              <button
                key={level}
                onClick={() => toggleRiskLevel(level)}
                className={`px-3 py-1 rounded-full text-sm font-medium capitalize ${
                  filters.riskLevels.includes(level)
                    ? getRiskButtonActiveStyle(level)
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      )}

      {/* Recommendations List */}
      {report && (
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                Top Recommendations
              </h3>
              <div className="text-sm text-gray-500">
                {report.totalRecommended} of {report.totalOpportunities} opportunities
              </div>
            </div>
            {report.summary && (
              <div className="mt-2 flex gap-4 text-sm text-gray-600">
                <span>Avg Score: <strong>{report.summary.avgScore.toFixed(1)}</strong></span>
                <span>Avg Profit: <strong>{report.summary.avgProfit.toFixed(2)}%</strong></span>
                {report.summary.avgHoursToResolution && (
                  <span>Avg Resolution: <strong>{formatHours(report.summary.avgHoursToResolution)}</strong></span>
                )}
              </div>
            )}
          </div>

          <div className="divide-y divide-gray-200">
            {report.recommendations.length === 0 ? (
              <div className="px-6 py-12 text-center text-gray-500">
                No recommendations match current filters
              </div>
            ) : (
              report.recommendations.map((rec) => (
                <RecommendationCard
                  key={rec.id}
                  recommendation={rec}
                  expanded={expanded === rec.id}
                  onToggle={() => setExpanded(expanded === rec.id ? null : rec.id)}
                  showTurnoverMetrics={showTurnoverMetrics}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function RecommendationCard({
  recommendation,
  expanded,
  onToggle,
  showTurnoverMetrics = true
}: {
  recommendation: Recommendation;
  expanded: boolean;
  onToggle: () => void;
  showTurnoverMetrics?: boolean;
}) {
  const { score, riskLevel, profitPercent, hoursUntilResolution, reasoning, actionItems, riskFactors } = recommendation;

  // Calculate turnover metrics
  const daysToResolution = hoursUntilResolution !== null ? hoursUntilResolution / 24 : null;
  const turnsPerYear = daysToResolution ? 365 / Math.max(1, daysToResolution) : null;
  const annualizedReturn = turnsPerYear && profitPercent
    ? ((Math.pow(1 + profitPercent / 100, turnsPerYear) - 1) * 100)
    : null;

  return (
    <div className="px-6 py-4 hover:bg-gray-50 transition-colors">
      <div className="flex items-start justify-between cursor-pointer" onClick={onToggle}>
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center w-10 h-10 bg-primary-100 text-primary-700 font-bold rounded-full">
            #{recommendation.rank}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <ScoreBadge score={score.overall} />
              <RiskBadge level={riskLevel} />
              {showTurnoverMetrics && annualizedReturn !== null && (
                <AnnualizedReturnBadge return_={annualizedReturn} />
              )}
              <span className="text-sm text-gray-500">ID: {recommendation.opportunityId.slice(0, 8)}...</span>
            </div>
            <div className="mt-1 flex items-center gap-4 text-sm flex-wrap">
              <span className="text-green-600 font-semibold">{profitPercent.toFixed(2)}% profit</span>
              {hoursUntilResolution !== null && (
                <span className="text-gray-600">Resolves in {formatHours(hoursUntilResolution)}</span>
              )}
              {showTurnoverMetrics && daysToResolution !== null && (
                <span className="text-blue-600">{turnsPerYear?.toFixed(1)} turns/yr</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <ScoreBreakdown score={score} showAnnualized={showTurnoverMetrics} annualizedReturn={annualizedReturn} />
          </div>
          <svg
            className={`w-5 h-5 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 pl-14 space-y-4">
          {/* Turnover Metrics Section */}
          {showTurnoverMetrics && daysToResolution !== null && (
            <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-700 mb-3">Capital Turnover Analysis</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div>
                  <div className="text-lg font-bold text-gray-900">{daysToResolution.toFixed(1)}d</div>
                  <div className="text-xs text-gray-500">Days to Resolution</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-blue-600">{turnsPerYear?.toFixed(1)}</div>
                  <div className="text-xs text-gray-500">Turns/Year</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-green-600">
                    {annualizedReturn !== null ? `${annualizedReturn.toFixed(0)}%` : 'N/A'}
                  </div>
                  <div className="text-xs text-gray-500">Annualized Return</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-purple-600">
                    {profitPercent.toFixed(2)}%
                  </div>
                  <div className="text-xs text-gray-500">Per-Trade Profit</div>
                </div>
              </div>
            </div>
          )}

          {reasoning.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Reasoning</h4>
              <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
                {reasoning.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          {actionItems.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Action Items</h4>
              <ul className="space-y-1">
                {actionItems.map((item, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-gray-600">
                    <span className="text-primary-600">→</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {riskFactors.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Risk Factors</h4>
              <ul className="space-y-1">
                {riskFactors.map((factor, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-orange-600">
                    <span>⚠</span>
                    {factor}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const getScoreColor = (s: number) => {
    if (s >= 80) return 'bg-green-100 text-green-800';
    if (s >= 60) return 'bg-blue-100 text-blue-800';
    if (s >= 40) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getScoreColor(score)}`}>
      {score.toFixed(0)}
    </span>
  );
}

function RiskBadge({ level }: { level: RiskLevel }) {
  const colors: Record<RiskLevel, string> = {
    low: 'bg-green-100 text-green-800',
    medium: 'bg-yellow-100 text-yellow-800',
    high: 'bg-orange-100 text-orange-800',
    critical: 'bg-red-100 text-red-800'
  };

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${colors[level]}`}>
      {level}
    </span>
  );
}

function AnnualizedReturnBadge({ return_ }: { return_: number }) {
  const getReturnColor = (r: number) => {
    if (r >= 200) return 'bg-green-500 text-white';
    if (r >= 100) return 'bg-green-400 text-white';
    if (r >= 50) return 'bg-green-100 text-green-800';
    if (r >= 0) return 'bg-blue-100 text-blue-800';
    return 'bg-red-100 text-red-800';
  };

  const formatReturn = (r: number) => {
    if (r >= 1000) return `${(r / 1000).toFixed(0)}K%`;
    return `${r.toFixed(0)}%`;
  };

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getReturnColor(return_)}`}>
      {formatReturn(return_)} APY
    </span>
  );
}

function ScoreBreakdown({
  score,
  showAnnualized = false,
  annualizedReturn
}: {
  score: Recommendation['score'];
  showAnnualized?: boolean;
  annualizedReturn?: number | null;
}) {
  return (
    <div className="flex gap-2 text-xs">
      {showAnnualized && annualizedReturn != null && (
        <div className="text-center border-r border-gray-200 pr-2">
          <div className="font-semibold text-green-600">
            {annualizedReturn >= 1000 ? `${(annualizedReturn / 1000).toFixed(0)}K` : annualizedReturn.toFixed(0)}%
          </div>
          <div className="text-gray-500">Annual</div>
        </div>
      )}
      <div className="text-center">
        <div className="font-semibold text-gray-900">{score.timeScore.toFixed(0)}</div>
        <div className="text-gray-500">Time</div>
      </div>
      <div className="text-center">
        <div className="font-semibold text-gray-900">{score.profitScore.toFixed(0)}</div>
        <div className="text-gray-500">Profit</div>
      </div>
      <div className="text-center">
        <div className="font-semibold text-gray-900">{score.confidenceScore.toFixed(0)}</div>
        <div className="text-gray-500">Conf</div>
      </div>
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: number; color: string }) {
  const colorClasses: Record<string, string> = {
    green: 'bg-green-50 text-green-800',
    blue: 'bg-blue-50 text-blue-800',
    yellow: 'bg-yellow-50 text-yellow-800',
    red: 'bg-red-50 text-red-800'
  };

  return (
    <div className={`rounded-lg p-3 text-center ${colorClasses[color]}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs mt-1">{label}</div>
    </div>
  );
}

function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  if (hours < 168) return `${(hours / 24).toFixed(1)}d`;
  return `${(hours / 168).toFixed(1)}w`;
}

function getRiskButtonActiveStyle(level: RiskLevel): string {
  const styles: Record<RiskLevel, string> = {
    low: 'bg-green-500 text-white',
    medium: 'bg-yellow-500 text-white',
    high: 'bg-orange-500 text-white',
    critical: 'bg-red-500 text-white'
  };
  return styles[level];
}
