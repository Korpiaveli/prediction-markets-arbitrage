'use client';

import { useState, useEffect } from 'react';
import { ForecastData, ForecastTiming } from '../types';

interface ForecastPanelProps {
  forecast?: ForecastData;
  timing?: ForecastTiming;
}

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
                {timing.nextOpportunity}
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

          {/* Probabilities */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="text-center bg-gray-50 rounded-lg p-3">
              <div className="text-lg font-semibold text-primary-600">{(timing.probabilities.next1Hour * 100).toFixed(0)}%</div>
              <div className="text-xs text-gray-500">Next 1 Hour</div>
            </div>
            <div className="text-center bg-gray-50 rounded-lg p-3">
              <div className="text-lg font-semibold text-primary-600">{(timing.probabilities.next24Hours * 100).toFixed(0)}%</div>
              <div className="text-xs text-gray-500">Next 24 Hours</div>
            </div>
          </div>
        </div>
      )}

      {/* Forecast Data */}
      {forecast && (
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            24-Hour Forecast
          </h2>

          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-primary-50 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-primary-600 mb-1">
                {Math.round(forecast.expected)}
              </div>
              <div className="text-sm text-gray-600">Expected Opportunities</div>
            </div>
            <div className="bg-green-50 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-green-600 mb-1">
                {((forecast.avgProfit.min + forecast.avgProfit.max) / 2).toFixed(1)}%
              </div>
              <div className="text-sm text-gray-600">Avg Profit</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-blue-600 mb-1">
                {forecast.maxProfit.max.toFixed(1)}%
              </div>
              <div className="text-sm text-gray-600">Max Profit</div>
            </div>
          </div>

          {/* Market Conditions */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <ConditionBadge label="Volatility" value={forecast.marketConditions.volatility} />
            <ConditionBadge label="Volume" value={forecast.marketConditions.volume} />
            <ConditionBadge label="News" value={forecast.marketConditions.news} />
          </div>

          {/* Best Scan Times by Hour */}
          {forecast.bestScanTimes.byHour.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">Best Hours to Scan</h3>
              <div className="space-y-2">
                {forecast.bestScanTimes.byHour.slice(0, 5).map((time, idx) => (
                  <div key={idx} className="flex items-center">
                    <div className="w-20 text-sm text-gray-600">
                      {formatHour(time.hour)}
                    </div>
                    <div className="flex-1 mx-4">
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary-500"
                          style={{ width: `${Math.min(time.avgOpportunities * 20, 100)}%` }}
                        />
                      </div>
                    </div>
                    <div className="w-16 text-right text-sm font-medium text-gray-900">
                      {time.avgOpportunities.toFixed(1)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {forecast.bestScanTimes.byHour.length === 0 && (
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
