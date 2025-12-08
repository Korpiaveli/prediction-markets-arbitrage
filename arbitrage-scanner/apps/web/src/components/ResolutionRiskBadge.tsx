'use client';

import { useState } from 'react';

interface ResolutionRiskBadgeProps {
  score: number;
  details?: {
    timingMatch?: number;
    semanticMatch?: number;
    rulesMatch?: number;
    temporalDistance?: number;
    exchange1CloseTime?: string;
    exchange2CloseTime?: string;
  };
  showTooltip?: boolean;
}

export function ResolutionRiskBadge({ score, details, showTooltip = true }: ResolutionRiskBadgeProps) {
  const [isHovered, setIsHovered] = useState(false);

  const getRiskLevel = (score: number) => {
    if (score >= 80) return { level: 'low', label: 'Low Risk', color: 'bg-green-100 text-green-800', dot: 'bg-green-500' };
    if (score >= 60) return { level: 'medium', label: 'Medium', color: 'bg-yellow-100 text-yellow-800', dot: 'bg-yellow-500' };
    if (score >= 40) return { level: 'elevated', label: 'Elevated', color: 'bg-orange-100 text-orange-800', dot: 'bg-orange-500' };
    return { level: 'high', label: 'High Risk', color: 'bg-red-100 text-red-800', dot: 'bg-red-500' };
  };

  const risk = getRiskLevel(score);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Unknown';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={`flex items-center space-x-1.5 px-2 py-1 rounded-full text-xs font-medium ${risk.color}`}>
        <span className={`w-2 h-2 rounded-full ${risk.dot}`} />
        <span>{score}</span>
      </div>

      {showTooltip && isHovered && details && (
        <div className="absolute z-50 w-64 p-3 mt-2 bg-white rounded-lg shadow-lg border border-gray-200 -left-20">
          <div className="text-sm font-medium text-gray-900 mb-2">
            Resolution Alignment: {score}/100
          </div>

          <div className="space-y-2 text-xs">
            {details.timingMatch !== undefined && (
              <div className="flex justify-between">
                <span className="text-gray-600">Timing Match</span>
                <span className={details.timingMatch >= 80 ? 'text-green-600' : details.timingMatch >= 50 ? 'text-yellow-600' : 'text-red-600'}>
                  {details.timingMatch}%
                </span>
              </div>
            )}

            {details.semanticMatch !== undefined && (
              <div className="flex justify-between">
                <span className="text-gray-600">Semantic Match</span>
                <span className={details.semanticMatch >= 80 ? 'text-green-600' : details.semanticMatch >= 50 ? 'text-yellow-600' : 'text-red-600'}>
                  {details.semanticMatch}%
                </span>
              </div>
            )}

            {details.rulesMatch !== undefined && (
              <div className="flex justify-between">
                <span className="text-gray-600">Rules Match</span>
                <span className={details.rulesMatch >= 80 ? 'text-green-600' : details.rulesMatch >= 50 ? 'text-yellow-600' : 'text-red-600'}>
                  {details.rulesMatch}%
                </span>
              </div>
            )}

            {details.temporalDistance !== undefined && (
              <div className="flex justify-between">
                <span className="text-gray-600">Time Difference</span>
                <span className={Math.abs(details.temporalDistance) <= 24 ? 'text-green-600' : Math.abs(details.temporalDistance) <= 72 ? 'text-yellow-600' : 'text-red-600'}>
                  {Math.abs(details.temporalDistance)}h
                </span>
              </div>
            )}

            {(details.exchange1CloseTime || details.exchange2CloseTime) && (
              <div className="pt-2 mt-2 border-t border-gray-100">
                <div className="text-gray-500 mb-1">Close Times</div>
                {details.exchange1CloseTime && (
                  <div className="text-gray-700">Ex1: {formatDate(details.exchange1CloseTime)}</div>
                )}
                {details.exchange2CloseTime && (
                  <div className="text-gray-700">Ex2: {formatDate(details.exchange2CloseTime)}</div>
                )}
              </div>
            )}
          </div>

          <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500">
            {score >= 80 && 'Markets likely resolve identically'}
            {score >= 60 && score < 80 && 'Some resolution divergence risk'}
            {score >= 40 && score < 60 && 'Moderate divergent resolution risk'}
            {score < 40 && 'High risk of different resolutions'}
          </div>
        </div>
      )}
    </div>
  );
}

export function ResolutionScoreBar({ score }: { score: number }) {
  const getColor = (score: number) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-yellow-500';
    if (score >= 40) return 'bg-orange-500';
    return 'bg-red-500';
  };

  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>Resolution Risk</span>
        <span>{score}/100</span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${getColor(score)} transition-all duration-300`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}
