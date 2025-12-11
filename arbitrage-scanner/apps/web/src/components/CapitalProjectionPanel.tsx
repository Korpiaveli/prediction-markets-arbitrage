'use client';

import { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  ComposedChart,
  Legend
} from 'recharts';

type TurnoverStrategy = 'conservative' | 'balanced' | 'aggressive';
type Period = 'monthly' | 'quarterly' | 'annual';

interface CapitalProjectionPanelProps {
  capital?: number;
  strategy?: TurnoverStrategy;
  period?: Period;
  showComparison?: boolean;
}

interface EquityPoint {
  day: number;
  capital: number;
  conservative?: number;
  balanced?: number;
  aggressive?: number;
  lowBound?: number;
  highBound?: number;
}

const STRATEGY_PARAMS = {
  conservative: {
    winRate: 0.99,
    avgProfitPercent: 2.0,
    avgDays: 15,
    lossPercent: 50,
    color: '#10B981' // green
  },
  balanced: {
    winRate: 0.95,
    avgProfitPercent: 2.0,
    avgDays: 30,
    lossPercent: 50,
    color: '#3B82F6' // blue
  },
  aggressive: {
    winRate: 0.90,
    avgProfitPercent: 1.5,
    avgDays: 7,
    lossPercent: 50,
    color: '#8B5CF6' // purple
  }
};

export function CapitalProjectionPanel({
  capital = 10000,
  strategy = 'balanced',
  period = 'annual',
  showComparison = false
}: CapitalProjectionPanelProps) {
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);

  const periodDays = period === 'monthly' ? 30 : period === 'quarterly' ? 90 : 365;

  // Generate equity curve data
  const equityCurve = useMemo(() => {
    const points: EquityPoint[] = [];
    const params = STRATEGY_PARAMS[strategy];

    // Monte Carlo simulation for confidence bands
    const simulations = 100;
    const paths: number[][] = [];

    for (let sim = 0; sim < simulations; sim++) {
      let cap = capital;
      const path = [cap];
      let day = 0;

      while (day < periodDays) {
        day += params.avgDays;
        const isWin = Math.random() < params.winRate;
        if (isWin) {
          cap *= (1 + params.avgProfitPercent / 100);
        } else {
          cap *= (1 - params.lossPercent / 100);
        }
        path.push(cap);
      }
      paths.push(path);
    }

    // Calculate percentiles for each day
    const maxSteps = Math.ceil(periodDays / params.avgDays);
    for (let step = 0; step <= maxSteps; step++) {
      const day = Math.min(step * params.avgDays, periodDays);
      const values = paths.map(p => p[Math.min(step, p.length - 1)]).sort((a, b) => a - b);

      const p5 = values[Math.floor(values.length * 0.05)];
      const p50 = values[Math.floor(values.length * 0.5)];
      const p95 = values[Math.floor(values.length * 0.95)];

      const point: EquityPoint = {
        day,
        capital: p50,
        lowBound: p5,
        highBound: p95
      };

      // Add comparison strategies if enabled
      if (showComparison) {
        point.conservative = simulateExpectedPath(capital, 'conservative', step);
        point.balanced = simulateExpectedPath(capital, 'balanced', step);
        point.aggressive = simulateExpectedPath(capital, 'aggressive', step);
      }

      points.push(point);
    }

    return points;
  }, [capital, strategy, periodDays, showComparison]);

  // Calculate summary stats
  const stats = useMemo(() => {
    const final = equityCurve[equityCurve.length - 1];
    const totalReturn = ((final.capital - capital) / capital) * 100;
    const maxDrawdown = calculateMaxDrawdown(equityCurve.map(p => p.capital));
    const params = STRATEGY_PARAMS[strategy];
    const expectedTrades = Math.floor(periodDays / params.avgDays);

    return {
      finalCapital: final.capital,
      totalReturn,
      lowEstimate: final.lowBound || final.capital * 0.8,
      highEstimate: final.highBound || final.capital * 1.2,
      maxDrawdown,
      expectedTrades,
      avgProfit: params.avgProfitPercent,
      winRate: params.winRate * 100
    };
  }, [equityCurve, capital, strategy, periodDays]);

  return (
    <div className="bg-white shadow rounded-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">Capital Growth Projection</h3>
        <p className="text-sm text-gray-600 mt-1">
          Monte Carlo simulation with {periodDays}-day horizon
        </p>
      </div>

      <div className="p-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard
            label="Expected Final"
            value={`$${formatCompact(stats.finalCapital)}`}
            subtext={`+${stats.totalReturn.toFixed(0)}%`}
            color="green"
          />
          <StatCard
            label="Confidence Range"
            value={`$${formatCompact(stats.lowEstimate)} - $${formatCompact(stats.highEstimate)}`}
            subtext="5th - 95th percentile"
            color="blue"
          />
          <StatCard
            label="Max Drawdown"
            value={`${stats.maxDrawdown.toFixed(1)}%`}
            subtext="Historical worst"
            color={stats.maxDrawdown > 20 ? 'red' : 'gray'}
          />
          <StatCard
            label="Expected Trades"
            value={stats.expectedTrades.toString()}
            subtext={`${stats.winRate.toFixed(0)}% win rate`}
            color="purple"
          />
        </div>

        {/* Equity Curve Chart */}
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={equityCurve}>
              <defs>
                <linearGradient id="capitalGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={STRATEGY_PARAMS[strategy].color} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={STRATEGY_PARAMS[strategy].color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis
                dataKey="day"
                stroke="#6B7280"
                fontSize={12}
                tickFormatter={(v) => `Day ${v}`}
              />
              <YAxis
                stroke="#6B7280"
                fontSize={12}
                tickFormatter={(v) => `$${formatCompact(v)}`}
                domain={['auto', 'auto']}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length > 0) {
                    const data = payload[0].payload as EquityPoint;
                    return (
                      <div className="bg-white shadow-lg rounded-lg p-3 border border-gray-200">
                        <div className="text-sm font-medium text-gray-900">Day {data.day}</div>
                        <div className="text-lg font-bold text-green-600">
                          ${data.capital.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </div>
                        {data.lowBound && data.highBound && (
                          <div className="text-xs text-gray-500 mt-1">
                            Range: ${formatCompact(data.lowBound)} - ${formatCompact(data.highBound)}
                          </div>
                        )}
                      </div>
                    );
                  }
                  return null;
                }}
              />

              {/* Confidence band */}
              <Area
                type="monotone"
                dataKey="highBound"
                stroke="none"
                fill={STRATEGY_PARAMS[strategy].color}
                fillOpacity={0.1}
              />
              <Area
                type="monotone"
                dataKey="lowBound"
                stroke="none"
                fill="#ffffff"
                fillOpacity={1}
              />

              {/* Main equity line */}
              <Line
                type="monotone"
                dataKey="capital"
                stroke={STRATEGY_PARAMS[strategy].color}
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 6 }}
              />

              {/* Strategy comparison lines */}
              {showComparison && (
                <>
                  <Line
                    type="monotone"
                    dataKey="conservative"
                    stroke="#10B981"
                    strokeWidth={1}
                    strokeDasharray="5 5"
                    dot={false}
                    name="Conservative"
                  />
                  <Line
                    type="monotone"
                    dataKey="balanced"
                    stroke="#3B82F6"
                    strokeWidth={1}
                    strokeDasharray="5 5"
                    dot={false}
                    name="Balanced"
                  />
                  <Line
                    type="monotone"
                    dataKey="aggressive"
                    stroke="#8B5CF6"
                    strokeWidth={1}
                    strokeDasharray="5 5"
                    dot={false}
                    name="Aggressive"
                  />
                  <Legend />
                </>
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Monthly Breakdown Table */}
        <div className="mt-6">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Milestone Projections</h4>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 font-medium text-gray-500">Day</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-500">Expected</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-500">Low (5%)</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-500">High (95%)</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-500">Return</th>
                </tr>
              </thead>
              <tbody>
                {equityCurve
                  .filter((_, i) => i === 0 || i % Math.max(1, Math.floor(equityCurve.length / 6)) === 0 || i === equityCurve.length - 1)
                  .map((point, i) => (
                    <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 px-3 text-gray-900">Day {point.day}</td>
                      <td className="py-2 px-3 text-right font-medium text-gray-900">
                        ${formatCompact(point.capital)}
                      </td>
                      <td className="py-2 px-3 text-right text-gray-500">
                        ${formatCompact(point.lowBound || point.capital * 0.8)}
                      </td>
                      <td className="py-2 px-3 text-right text-gray-500">
                        ${formatCompact(point.highBound || point.capital * 1.2)}
                      </td>
                      <td className={`py-2 px-3 text-right font-medium ${
                        point.capital >= capital ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {point.capital >= capital ? '+' : ''}
                        {(((point.capital - capital) / capital) * 100).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  subtext,
  color
}: {
  label: string;
  value: string;
  subtext: string;
  color: string;
}) {
  const colorClasses: Record<string, string> = {
    green: 'bg-green-50 border-green-200',
    blue: 'bg-blue-50 border-blue-200',
    purple: 'bg-purple-50 border-purple-200',
    red: 'bg-red-50 border-red-200',
    gray: 'bg-gray-50 border-gray-200'
  };

  return (
    <div className={`rounded-lg p-4 border ${colorClasses[color]}`}>
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-lg font-bold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500">{subtext}</div>
    </div>
  );
}

function simulateExpectedPath(capital: number, strategy: TurnoverStrategy, step: number): number {
  const params = STRATEGY_PARAMS[strategy];
  const expectedProfitPerTrade = (params.avgProfitPercent / 100 * params.winRate) -
    (params.lossPercent / 100 * (1 - params.winRate));

  return capital * Math.pow(1 + expectedProfitPerTrade, step);
}

function calculateMaxDrawdown(values: number[]): number {
  let maxDrawdown = 0;
  let peak = values[0];

  for (const value of values) {
    if (value > peak) peak = value;
    const drawdown = ((peak - value) / peak) * 100;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  return maxDrawdown;
}

function formatCompact(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toFixed(0);
}
