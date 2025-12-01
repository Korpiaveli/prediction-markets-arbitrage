'use client';

import { useState, useEffect } from 'react';

interface RiskMetrics {
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  profitFactor: number;
  averageProfit: number;
  averageLoss: number;
  totalTrades: number;
  consecutiveLosses: number;
  volatility: number;
}

interface RiskLevel {
  level: 'low' | 'medium' | 'high' | 'critical';
  score: number;
  label: string;
  color: string;
}

interface RiskDashboardProps {
  metrics?: RiskMetrics;
}

export function RiskDashboard({ metrics }: RiskDashboardProps) {
  const [riskLevel, setRiskLevel] = useState<RiskLevel>(calculateRiskLevel(metrics));

  useEffect(() => {
    setRiskLevel(calculateRiskLevel(metrics));
  }, [metrics]);

  if (!metrics || metrics.totalTrades === 0) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Risk Assessment
        </h2>
        <div className="text-center py-8 text-gray-500">
          No trading history available. Start trading to see risk metrics.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-900">
          Risk Assessment
        </h2>
        <div className={`px-4 py-2 rounded-full text-sm font-medium ${riskLevel.color}`}>
          {riskLevel.label}
        </div>
      </div>

      {/* Risk Score Circle */}
      <div className="flex justify-center mb-8">
        <div className="relative w-48 h-48">
          <svg className="transform -rotate-90 w-48 h-48">
            <circle
              cx="96"
              cy="96"
              r="88"
              stroke="#e5e7eb"
              strokeWidth="12"
              fill="none"
            />
            <circle
              cx="96"
              cy="96"
              r="88"
              stroke={getRiskColor(riskLevel.level)}
              strokeWidth="12"
              fill="none"
              strokeDasharray={`${(riskLevel.score / 100) * 552.92} 552.92`}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-4xl font-bold text-gray-900">
              {riskLevel.score}
            </span>
            <span className="text-sm text-gray-500 mt-1">Risk Score</span>
          </div>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <MetricCard
          label="Sharpe Ratio"
          value={metrics.sharpeRatio.toFixed(2)}
          subtitle={getSharpeLabel(metrics.sharpeRatio)}
          trend={metrics.sharpeRatio > 1 ? 'good' : metrics.sharpeRatio > 0 ? 'neutral' : 'bad'}
        />
        <MetricCard
          label="Win Rate"
          value={`${metrics.winRate.toFixed(1)}%`}
          subtitle={`${metrics.totalTrades} trades`}
          trend={metrics.winRate > 60 ? 'good' : metrics.winRate > 40 ? 'neutral' : 'bad'}
        />
        <MetricCard
          label="Profit Factor"
          value={metrics.profitFactor.toFixed(2)}
          subtitle={getProfitFactorLabel(metrics.profitFactor)}
          trend={metrics.profitFactor > 1.5 ? 'good' : metrics.profitFactor > 1 ? 'neutral' : 'bad'}
        />
        <MetricCard
          label="Max Drawdown"
          value={`$${metrics.maxDrawdown.toFixed(0)}`}
          subtitle="Maximum loss"
          trend={metrics.maxDrawdown < 100 ? 'good' : metrics.maxDrawdown < 500 ? 'neutral' : 'bad'}
        />
      </div>

      {/* Warnings */}
      {(metrics.consecutiveLosses >= 3 || metrics.winRate < 50) && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 mb-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">
                Risk Warnings
              </h3>
              <div className="mt-2 text-sm text-yellow-700">
                <ul className="list-disc pl-5 space-y-1">
                  {metrics.consecutiveLosses >= 3 && (
                    <li>{metrics.consecutiveLosses} consecutive losses - consider pause</li>
                  )}
                  {metrics.winRate < 50 && (
                    <li>Win rate below 50% - review strategy</li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Detailed Stats */}
      <div className="border-t pt-4">
        <h3 className="text-sm font-medium text-gray-900 mb-3">Performance Details</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Average Profit</span>
            <span className="font-medium text-green-600">${metrics.averageProfit.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Average Loss</span>
            <span className="font-medium text-red-600">${metrics.averageLoss.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Volatility</span>
            <span className="font-medium text-gray-900">${metrics.volatility.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Total Trades</span>
            <span className="font-medium text-gray-900">{metrics.totalTrades}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, subtitle, trend }: {
  label: string;
  value: string;
  subtitle: string;
  trend: 'good' | 'neutral' | 'bad';
}) {
  const trendColors = {
    good: 'text-green-600',
    neutral: 'text-yellow-600',
    bad: 'text-red-600'
  };

  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <div className="text-sm text-gray-600 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${trendColors[trend]} mb-1`}>
        {value}
      </div>
      <div className="text-xs text-gray-500">{subtitle}</div>
    </div>
  );
}

function calculateRiskLevel(metrics?: RiskMetrics): RiskLevel {
  if (!metrics || metrics.totalTrades === 0) {
    return {
      level: 'medium',
      score: 50,
      label: 'No Data',
      color: 'bg-gray-100 text-gray-800'
    };
  }

  let score = 50; // Start at medium

  // Sharpe Ratio (higher is better)
  if (metrics.sharpeRatio > 2) score -= 15;
  else if (metrics.sharpeRatio > 1) score -= 10;
  else if (metrics.sharpeRatio < 0) score += 15;
  else if (metrics.sharpeRatio < 0.5) score += 10;

  // Win Rate (higher is better)
  if (metrics.winRate > 70) score -= 10;
  else if (metrics.winRate > 60) score -= 5;
  else if (metrics.winRate < 40) score += 15;
  else if (metrics.winRate < 50) score += 10;

  // Profit Factor (higher is better)
  if (metrics.profitFactor > 2) score -= 10;
  else if (metrics.profitFactor > 1.5) score -= 5;
  else if (metrics.profitFactor < 1) score += 20;
  else if (metrics.profitFactor < 1.2) score += 10;

  // Max Drawdown (lower is better)
  if (metrics.maxDrawdown < 100) score -= 5;
  else if (metrics.maxDrawdown > 1000) score += 20;
  else if (metrics.maxDrawdown > 500) score += 10;

  // Consecutive Losses (fewer is better)
  if (metrics.consecutiveLosses >= 5) score += 20;
  else if (metrics.consecutiveLosses >= 3) score += 10;

  score = Math.max(0, Math.min(100, score));

  let level: RiskLevel['level'];
  let label: string;
  let color: string;

  if (score < 25) {
    level = 'low';
    label = 'Low Risk';
    color = 'bg-green-100 text-green-800';
  } else if (score < 50) {
    level = 'medium';
    label = 'Medium Risk';
    color = 'bg-yellow-100 text-yellow-800';
  } else if (score < 75) {
    level = 'high';
    label = 'High Risk';
    color = 'bg-orange-100 text-orange-800';
  } else {
    level = 'critical';
    label = 'Critical Risk';
    color = 'bg-red-100 text-red-800';
  }

  return { level, score, label, color };
}

function getRiskColor(level: RiskLevel['level']): string {
  switch (level) {
    case 'low': return '#10b981';
    case 'medium': return '#f59e0b';
    case 'high': return '#f97316';
    case 'critical': return '#ef4444';
  }
}

function getSharpeLabel(sharpe: number): string {
  if (sharpe > 2) return 'Excellent';
  if (sharpe > 1) return 'Good';
  if (sharpe > 0) return 'Acceptable';
  return 'Poor';
}

function getProfitFactorLabel(pf: number): string {
  if (pf > 2) return 'Excellent';
  if (pf > 1.5) return 'Good';
  if (pf > 1) return 'Profitable';
  return 'Losing';
}
