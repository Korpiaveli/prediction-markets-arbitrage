'use client';

import { useState, useEffect } from 'react';

interface OpportunityForecast {
  category: string;
  expectedCount: number;
  expectedProfitRange: {
    min: number;
    max: number;
    avg: number;
  };
  bestScanTimes: Array<{
    hour: number;
    dayOfWeek: number;
    probability: number;
  }>;
}

interface TimingPrediction {
  nextOpportunityETA: number;
  confidence: number;
  reasoning: string[];
  marketConditions: {
    volatility: string;
    volume: string;
    newsActivity: string;
  };
}

interface ForecastPanelProps {
  forecast?: OpportunityForecast;
  timing?: TimingPrediction;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function ForecastPanel({ forecast, timing }: ForecastPanelProps) {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="space-y-6">
      {/* Next Opportunity Timer */}
      {timing && (
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Next Opportunity Prediction
          </h2>

          <div className="flex items-center justify-center mb-6">
            <div className="text-center">
              <div className="text-5xl font-bold text-primary-600 mb-2">
                {formatETA(timing.nextOpportunityETA)}
              </div>
              <div className="text-sm text-gray-500">Estimated Time</div>
            </div>
          </div>

          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-gray-700">Confidence</span>
            <div className="flex-1 mx-4">
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full ${getConfidenceColor(timing.confidence)}`}
                  style={{ width: `${timing.confidence}%` }}
                />
              </div>
            </div>
            <span className="text-sm font-medium text-gray-900">{timing.confidence.toFixed(0)}%</span>
          </div>

          {/* Market Conditions */}
          <div className="grid grid-cols-3 gap-4 mb-4">
            <ConditionBadge label="Volatility" value={timing.marketConditions.volatility} />
            <ConditionBadge label="Volume" value={timing.marketConditions.volume} />
            <ConditionBadge label="News" value={timing.marketConditions.newsActivity} />
          </div>

          {/* Reasoning */}
          {timing.reasoning.length > 0 && (
            <div className="bg-gray-50 rounded-md p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Analysis</h3>
              <ul className="space-y-1">
                {timing.reasoning.map((reason, idx) => (
                  <li key={idx} className="text-sm text-gray-600 flex items-start">
                    <svg className="h-5 w-5 text-primary-500 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Forecast Data */}
      {forecast && (
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            24-Hour Forecast
            <span className="text-sm font-normal text-gray-500 ml-2">({forecast.category})</span>
          </h2>

          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-primary-50 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-primary-600 mb-1">
                {Math.round(forecast.expectedCount)}
              </div>
              <div className="text-sm text-gray-600">Expected Opportunities</div>
            </div>
            <div className="bg-green-50 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-green-600 mb-1">
                {forecast.expectedProfitRange.avg.toFixed(1)}%
              </div>
              <div className="text-sm text-gray-600">Avg Profit</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-blue-600 mb-1">
                {forecast.expectedProfitRange.max.toFixed(1)}%
              </div>
              <div className="text-sm text-gray-600">Max Profit</div>
            </div>
          </div>

          {/* Best Scan Times */}
          {forecast.bestScanTimes.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">Optimal Scan Times</h3>
              <div className="space-y-2">
                {forecast.bestScanTimes.slice(0, 5).map((time, idx) => (
                  <div key={idx} className="flex items-center">
                    <div className="w-32 text-sm text-gray-600">
                      {DAY_NAMES[time.dayOfWeek]} {formatHour(time.hour)}
                    </div>
                    <div className="flex-1 mx-4">
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary-500"
                          style={{ width: `${time.probability}%` }}
                        />
                      </div>
                    </div>
                    <div className="w-16 text-right text-sm font-medium text-gray-900">
                      {time.probability.toFixed(0)}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {forecast.bestScanTimes.length === 0 && (
            <div className="text-center py-6 text-gray-500 text-sm">
              No historical data available for timing predictions.
              Continue scanning to build forecast data.
            </div>
          )}
        </div>
      )}

      {!forecast && !timing && (
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Opportunity Forecast
          </h2>
          <div className="text-center py-12 text-gray-500">
            Loading forecast data...
          </div>
        </div>
      )}
    </div>
  );
}

function ConditionBadge({ label, value }: { label: string; value: string }) {
  const colors = {
    low: 'bg-green-100 text-green-800',
    medium: 'bg-yellow-100 text-yellow-800',
    high: 'bg-red-100 text-red-800'
  };

  return (
    <div className="text-center">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${colors[value as keyof typeof colors]}`}>
        {value}
      </div>
    </div>
  );
}

function formatETA(minutes: number): string {
  if (minutes < 1) return '< 1m';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hours < 24) {
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

function formatHour(hour: number): string {
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}${ampm}`;
}

function getConfidenceColor(confidence: number): string {
  if (confidence >= 75) return 'bg-green-500';
  if (confidence >= 50) return 'bg-yellow-500';
  if (confidence >= 25) return 'bg-orange-500';
  return 'bg-red-500';
}
