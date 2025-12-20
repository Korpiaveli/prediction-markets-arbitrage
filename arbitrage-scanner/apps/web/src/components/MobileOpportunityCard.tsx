"use client"

import { format, differenceInDays } from 'date-fns';
import { ResolutionRiskBadge } from './ResolutionRiskBadge';
import type { ArbitrageOpportunity, ResolutionAlignment } from '@/types';

interface MobileOpportunityCardProps {
  opportunity: ArbitrageOpportunity;
  onClick: () => void;
}

function parseDirection(direction: string): { leg1: string; leg2: string } {
  if (!direction) return { leg1: '?', leg2: '?' };
  if (direction.includes('EXCHANGE1_YES') || direction.includes('KALSHI_YES')) {
    return { leg1: 'YES', leg2: 'NO' };
  } else if (direction.includes('EXCHANGE1_NO') || direction.includes('KALSHI_NO')) {
    return { leg1: 'NO', leg2: 'YES' };
  }
  return { leg1: '?', leg2: '?' };
}

function calculateProfit10(totalCost: number, profitPercent: number): string {
  if (!totalCost || totalCost <= 0) return '-';
  const contracts = 10 / totalCost;
  const profit = contracts * (profitPercent / 100);
  return profit >= 0 ? `+$${profit.toFixed(2)}` : `-$${Math.abs(profit).toFixed(2)}`;
}

export function MobileOpportunityCard({ opportunity, onClick }: MobileOpportunityCardProps) {
  const getMarketTitle = (): string => {
    if (opportunity.marketPair?.market1?.title) return opportunity.marketPair.market1.title;
    if (opportunity.pair?.market1?.title) return opportunity.pair.market1.title;
    if (opportunity.market1Title) return opportunity.market1Title;
    return 'Unknown Market';
  };

  const getExchanges = (): { ex1: string; ex2: string } => {
    if (opportunity.marketPair?.market1?.exchange) {
      return {
        ex1: opportunity.marketPair.market1.exchange,
        ex2: opportunity.marketPair.market2?.exchange || 'Unknown'
      };
    }
    if (opportunity.pair?.market1?.exchange) {
      return {
        ex1: opportunity.pair.market1.exchange,
        ex2: opportunity.pair.market2?.exchange || 'Unknown'
      };
    }
    if (opportunity.exchange1) {
      return { ex1: opportunity.exchange1, ex2: opportunity.exchange2 || 'Unknown' };
    }
    return { ex1: 'Unknown', ex2: 'Unknown' };
  };

  const getResolutionScore = (): number => {
    if (opportunity.resolutionScore !== undefined) return opportunity.resolutionScore;
    if (opportunity.resolution?.score !== undefined) return opportunity.resolution.score;
    if (opportunity.resolutionAlignment?.score !== undefined) return opportunity.resolutionAlignment.score;
    return 0;
  };

  const getResolutionDetails = (): Partial<ResolutionAlignment> | undefined => {
    const alignment = opportunity.resolution || opportunity.resolutionAlignment;
    if (!alignment) return undefined;
    return {
      timingMatch: alignment.timingMatch,
      semanticMatch: alignment.semanticMatch,
      rulesMatch: alignment.rulesMatch,
      temporalDistance: alignment.temporalDistance
    };
  };

  const getEarliestResolve = (): { date: Date | null; days: number | null } => {
    const close1 = opportunity.marketPair?.market1?.closeTime || opportunity.pair?.market1?.closeTime;
    const close2 = opportunity.marketPair?.market2?.closeTime || opportunity.pair?.market2?.closeTime;
    const date1 = close1 ? new Date(close1) : null;
    const date2 = close2 ? new Date(close2) : null;
    if (!date1 && !date2) return { date: null, days: null };
    if (!date1) return { date: date2, days: differenceInDays(date2!, new Date()) };
    if (!date2) return { date: date1, days: differenceInDays(date1, new Date()) };
    const earliest = date1 < date2 ? date1 : date2;
    return { date: earliest, days: differenceInDays(earliest, new Date()) };
  };

  const exchanges = getExchanges();
  const direction = parseDirection(opportunity.direction);
  const resolveInfo = getEarliestResolve();

  return (
    <div
      onClick={onClick}
      className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 cursor-pointer hover:shadow-md transition-shadow"
    >
      {/* Header */}
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1 min-w-0 pr-2">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white line-clamp-2">
            {getMarketTitle()}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {exchanges.ex1} ↔ {exchanges.ex2}
          </p>
        </div>
        <div className={`text-lg font-bold ${
          opportunity.profitPercent >= 5 ? 'text-green-600' :
          opportunity.profitPercent >= 2 ? 'text-green-500' :
          'text-gray-600 dark:text-gray-300'
        }`}>
          {opportunity.profitPercent?.toFixed(2)}%
        </div>
      </div>

      {/* Direction badges */}
      <div className="flex items-center gap-2 mb-3">
        <span className={`px-2 py-1 rounded text-xs font-medium ${
          direction.leg1 === 'YES' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
        }`}>
          {exchanges.ex1.substring(0, 1)}: {direction.leg1}
        </span>
        <span className={`px-2 py-1 rounded text-xs font-medium ${
          direction.leg2 === 'YES' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
        }`}>
          {exchanges.ex2.substring(0, 1)}: {direction.leg2}
        </span>
        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
          opportunity.valid ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
        }`}>
          {opportunity.valid ? 'Valid' : 'Invalid'}
        </span>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2 text-center">
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">$10 P&L</p>
          <p className="text-sm font-medium text-green-600 dark:text-green-400">
            {calculateProfit10(opportunity.totalCost, opportunity.profitPercent)}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Resolves</p>
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {resolveInfo.days !== null ? `${resolveInfo.days}d` : '-'}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Confidence</p>
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {(opportunity.confidence || 0).toFixed(0)}%
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Resolution</p>
          <ResolutionRiskBadge
            score={getResolutionScore()}
            details={getResolutionDetails()}
          />
        </div>
      </div>
    </div>
  );
}
