'use client';

import { useState, useEffect, useMemo } from 'react';

type TurnoverStrategy = 'conservative' | 'balanced' | 'aggressive';
type Period = 'monthly' | 'quarterly' | 'annual';

interface TurnoverWeights {
  confidence: number;
  time: number;
  profit: number;
}

interface StrategyPreset {
  name: TurnoverStrategy;
  description: string;
  weights: TurnoverWeights;
  minConfidence: number;
  maxDaysToResolution: number;
  minProfitPercent: number;
}

const STRATEGY_PRESETS: Record<TurnoverStrategy, StrategyPreset> = {
  conservative: {
    name: 'conservative',
    description: 'High confidence, lower risk',
    weights: { confidence: 0.50, time: 0.30, profit: 0.20 },
    minConfidence: 90,
    maxDaysToResolution: 30,
    minProfitPercent: 1.5
  },
  balanced: {
    name: 'balanced',
    description: 'Balanced approach',
    weights: { confidence: 0.40, time: 0.35, profit: 0.25 },
    minConfidence: 80,
    maxDaysToResolution: 60,
    minProfitPercent: 1.0
  },
  aggressive: {
    name: 'aggressive',
    description: 'Maximum turnover',
    weights: { confidence: 0.30, time: 0.45, profit: 0.25 },
    minConfidence: 70,
    maxDaysToResolution: 14,
    minProfitPercent: 0.5
  }
};

const WIN_RATES: Record<string, number> = {
  '95-100': 0.99,
  '85-94': 0.95,
  '75-84': 0.90,
  '<75': 0.80
};

interface CompoundingCalculatorProps {
  onProjectionChange?: (projection: ProjectionResult) => void;
}

interface ProjectionResult {
  startingCapital: number;
  endingCapital: number;
  returnPercent: number;
  annualizedReturn: number;
  expectedTrades: number;
  expectedWins: number;
  expectedLosses: number;
  confidenceInterval: { low: number; high: number };
  period: Period;
  strategy: TurnoverStrategy;
  avgDaysPerTrade: number;
}

export function CompoundingCalculator({ onProjectionChange }: CompoundingCalculatorProps) {
  const [capital, setCapital] = useState(10000);
  const [strategy, setStrategy] = useState<TurnoverStrategy>('balanced');
  const [period, setPeriod] = useState<Period>('annual');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customWeights, setCustomWeights] = useState<TurnoverWeights>(
    STRATEGY_PRESETS.balanced.weights
  );

  // Calculate projection based on inputs
  const projection = useMemo(() => {
    const config = STRATEGY_PRESETS[strategy];
    const weights = showAdvanced ? normalizeWeights(customWeights) : config.weights;

    // Estimate avg days per trade based on strategy
    const avgDays = config.maxDaysToResolution / 2;
    const periodDays = period === 'monthly' ? 30 : period === 'quarterly' ? 90 : 365;
    const expectedTrades = Math.floor(periodDays / avgDays);

    // Get expected win rate based on min confidence
    const winRate = getWinRateForConfidence(config.minConfidence);
    const avgProfitPercent = (config.minProfitPercent + 3) / 2; // Estimate avg profit
    const lossPercent = 50; // Assume 50% loss on bad matches

    const expectedWins = Math.round(expectedTrades * winRate);
    const expectedLosses = expectedTrades - expectedWins;

    // Calculate compounding returns
    let endingCapital = capital;
    for (let i = 0; i < expectedWins; i++) {
      endingCapital *= (1 + avgProfitPercent / 100);
    }
    for (let i = 0; i < expectedLosses; i++) {
      endingCapital *= (1 - lossPercent / 100);
    }

    // Calculate confidence interval (pessimistic/optimistic)
    const pessimisticLosses = Math.min(expectedTrades, Math.round(expectedLosses * 1.5));
    const pessimisticWins = expectedTrades - pessimisticLosses;
    let lowCapital = capital;
    for (let i = 0; i < pessimisticWins; i++) {
      lowCapital *= (1 + avgProfitPercent / 100);
    }
    for (let i = 0; i < pessimisticLosses; i++) {
      lowCapital *= (1 - lossPercent / 100);
    }

    const optimisticLosses = Math.max(0, Math.round(expectedLosses * 0.5));
    const optimisticWins = expectedTrades - optimisticLosses;
    let highCapital = capital;
    for (let i = 0; i < optimisticWins; i++) {
      highCapital *= (1 + avgProfitPercent / 100);
    }
    for (let i = 0; i < optimisticLosses; i++) {
      highCapital *= (1 - lossPercent / 100);
    }

    const returnPercent = ((endingCapital - capital) / capital) * 100;
    const annualizedReturn = period === 'annual'
      ? returnPercent
      : ((Math.pow(endingCapital / capital, 365 / periodDays) - 1) * 100);

    return {
      startingCapital: capital,
      endingCapital: Math.round(endingCapital * 100) / 100,
      returnPercent: Math.round(returnPercent * 100) / 100,
      annualizedReturn: Math.round(annualizedReturn * 100) / 100,
      expectedTrades,
      expectedWins,
      expectedLosses,
      confidenceInterval: {
        low: Math.round(lowCapital * 100) / 100,
        high: Math.round(highCapital * 100) / 100
      },
      period,
      strategy,
      avgDaysPerTrade: avgDays
    };
  }, [capital, strategy, period, showAdvanced, customWeights]);

  // Notify parent of projection changes
  useEffect(() => {
    onProjectionChange?.(projection);
  }, [projection, onProjectionChange]);

  const handleStrategyChange = (newStrategy: TurnoverStrategy) => {
    setStrategy(newStrategy);
    setCustomWeights(STRATEGY_PRESETS[newStrategy].weights);
  };

  const handleWeightChange = (key: keyof TurnoverWeights, value: number) => {
    setCustomWeights(prev => ({ ...prev, [key]: value }));
  };

  const resetToPreset = () => {
    setCustomWeights(STRATEGY_PRESETS[strategy].weights);
  };

  return (
    <div className="bg-white shadow rounded-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-primary-50 to-primary-100">
        <h3 className="text-lg font-semibold text-gray-900">Capital Compounding Calculator</h3>
        <p className="text-sm text-gray-600 mt-1">Project returns based on strategy and capital</p>
      </div>

      <div className="p-6 space-y-6">
        {/* Input Controls */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Capital Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Starting Capital
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <input
                type="number"
                min="100"
                max="10000000"
                step="100"
                value={capital}
                onChange={(e) => setCapital(Math.max(100, parseInt(e.target.value) || 0))}
                className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>

          {/* Strategy Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Strategy
            </label>
            <select
              value={strategy}
              onChange={(e) => handleStrategyChange(e.target.value as TurnoverStrategy)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              {Object.entries(STRATEGY_PRESETS).map(([key, preset]) => (
                <option key={key} value={key}>
                  {preset.name.charAt(0).toUpperCase() + preset.name.slice(1)} - {preset.description}
                </option>
              ))}
            </select>
          </div>

          {/* Period Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Time Period
            </label>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as Period)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="monthly">1 Month</option>
              <option value="quarterly">3 Months</option>
              <option value="annual">1 Year</option>
            </select>
          </div>
        </div>

        {/* Advanced Weight Customization */}
        <div>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700"
          >
            <svg
              className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Advanced Settings
          </button>

          {showAdvanced && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium text-gray-700">Custom Weight Distribution</span>
                <button
                  onClick={resetToPreset}
                  className="text-xs text-primary-600 hover:text-primary-700"
                >
                  Reset to preset
                </button>
              </div>
              <div className="space-y-4">
                <WeightSlider
                  label="Confidence"
                  value={customWeights.confidence}
                  onChange={(v) => handleWeightChange('confidence', v)}
                  color="green"
                />
                <WeightSlider
                  label="Time (Speed)"
                  value={customWeights.time}
                  onChange={(v) => handleWeightChange('time', v)}
                  color="blue"
                />
                <WeightSlider
                  label="Profit"
                  value={customWeights.profit}
                  onChange={(v) => handleWeightChange('profit', v)}
                  color="purple"
                />
              </div>
              <div className="mt-3 text-xs text-gray-500">
                Weights will be auto-normalized to 100%
              </div>
            </div>
          )}
        </div>

        {/* Projection Results */}
        <div className="bg-gradient-to-br from-primary-50 to-green-50 rounded-xl p-6">
          <div className="text-center mb-6">
            <div className="text-sm text-gray-600 mb-1">Projected Returns</div>
            <div className="flex items-center justify-center gap-4">
              <div className="text-2xl font-bold text-gray-400">
                ${projection.startingCapital.toLocaleString()}
              </div>
              <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
              <div className="text-3xl font-bold text-green-600">
                ${projection.endingCapital.toLocaleString()}
              </div>
            </div>
            <div className="mt-2 text-lg font-semibold text-green-600">
              +{projection.annualizedReturn.toFixed(1)}% annualized return
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard
              label="Expected Trades"
              value={projection.expectedTrades.toString()}
              subtext={`~${projection.avgDaysPerTrade.toFixed(0)} days each`}
            />
            <MetricCard
              label="Win Rate"
              value={`${((projection.expectedWins / projection.expectedTrades) * 100).toFixed(0)}%`}
              subtext={`${projection.expectedWins}W / ${projection.expectedLosses}L`}
            />
            <MetricCard
              label="Period Return"
              value={`${projection.returnPercent.toFixed(1)}%`}
              subtext={period}
            />
            <MetricCard
              label="Confidence Range"
              value={`$${formatCompact(projection.confidenceInterval.low)} - $${formatCompact(projection.confidenceInterval.high)}`}
              subtext="5th - 95th percentile"
            />
          </div>
        </div>

        {/* Strategy Info */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Strategy Details</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Min Confidence:</span>
              <span className="ml-2 font-medium">{STRATEGY_PRESETS[strategy].minConfidence}%</span>
            </div>
            <div>
              <span className="text-gray-500">Max Days:</span>
              <span className="ml-2 font-medium">{STRATEGY_PRESETS[strategy].maxDaysToResolution}d</span>
            </div>
            <div>
              <span className="text-gray-500">Min Profit:</span>
              <span className="ml-2 font-medium">{STRATEGY_PRESETS[strategy].minProfitPercent}%</span>
            </div>
            <div>
              <span className="text-gray-500">Weight Focus:</span>
              <span className="ml-2 font-medium capitalize">
                {Object.entries(STRATEGY_PRESETS[strategy].weights)
                  .sort(([, a], [, b]) => b - a)[0][0]}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function WeightSlider({
  label,
  value,
  onChange,
  color
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  color: string;
}) {
  const colorClasses: Record<string, string> = {
    green: 'accent-green-500',
    blue: 'accent-blue-500',
    purple: 'accent-purple-500'
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm text-gray-600">{label}</span>
        <span className="text-sm font-medium text-gray-900">{(value * 100).toFixed(0)}%</span>
      </div>
      <input
        type="range"
        min="0"
        max="100"
        value={value * 100}
        onChange={(e) => onChange(parseInt(e.target.value) / 100)}
        className={`w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer ${colorClasses[color]}`}
      />
    </div>
  );
}

function MetricCard({ label, value, subtext }: { label: string; value: string; subtext: string }) {
  return (
    <div className="bg-white rounded-lg p-3 text-center shadow-sm">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-lg font-bold text-gray-900">{value}</div>
      <div className="text-xs text-gray-400">{subtext}</div>
    </div>
  );
}

function normalizeWeights(weights: TurnoverWeights): TurnoverWeights {
  const total = weights.confidence + weights.time + weights.profit;
  if (total === 0) return { confidence: 0.33, time: 0.33, profit: 0.34 };
  return {
    confidence: weights.confidence / total,
    time: weights.time / total,
    profit: weights.profit / total
  };
}

function getWinRateForConfidence(confidence: number): number {
  if (confidence >= 95) return WIN_RATES['95-100'];
  if (confidence >= 85) return WIN_RATES['85-94'];
  if (confidence >= 75) return WIN_RATES['75-84'];
  return WIN_RATES['<75'];
}

function formatCompact(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toFixed(0);
}
