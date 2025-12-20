import { useState } from 'react';
import { formatDistanceToNow, differenceInDays, format } from 'date-fns';
import { ResolutionRiskBadge } from './ResolutionRiskBadge';
import { PaginationControl } from './PaginationControl';
import { OpportunityDetailModal } from './OpportunityDetailModal';
import { TableSkeleton } from './ui/skeleton';
import type { ArbitrageOpportunity, ExchangeName, ResolutionAlignment } from '@/types';

interface OpportunityListProps {
  opportunities: ArbitrageOpportunity[];
  loading?: boolean;
  pageSize?: number;
}

function parseDirection(direction: string, ex1: string, ex2: string): { leg1: string; leg2: string } {
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

function getEarliestResolve(opp: ArbitrageOpportunity): { date: Date | null; days: number | null } {
  const close1 = opp.marketPair?.market1?.closeTime || opp.pair?.market1?.closeTime;
  const close2 = opp.marketPair?.market2?.closeTime || opp.pair?.market2?.closeTime;

  const date1 = close1 ? new Date(close1) : null;
  const date2 = close2 ? new Date(close2) : null;

  if (!date1 && !date2) return { date: null, days: null };
  if (!date1) return { date: date2, days: differenceInDays(date2!, new Date()) };
  if (!date2) return { date: date1, days: differenceInDays(date1, new Date()) };

  const earliest = date1 < date2 ? date1 : date2;
  return { date: earliest, days: differenceInDays(earliest, new Date()) };
}

export function OpportunityList({ opportunities, loading = false, pageSize = 25 }: OpportunityListProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(pageSize);
  const [selectedOpportunity, setSelectedOpportunity] = useState<ArbitrageOpportunity | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  if (loading) {
    return <TableSkeleton rows={10} columns={8} />;
  }

  if (opportunities.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        No opportunities found. Try triggering a scan.
      </div>
    );
  }

  const totalPages = Math.ceil(opportunities.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedOpportunities = opportunities.slice(startIndex, startIndex + itemsPerPage);

  const handleRowClick = (opp: ArbitrageOpportunity) => {
    setSelectedOpportunity(opp);
    setModalOpen(true);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handlePageSizeChange = (size: number) => {
    setItemsPerPage(size);
    setCurrentPage(1);
  };

  const getMarketTitle = (opp: ArbitrageOpportunity): string => {
    if (opp.marketPair?.market1?.title) return opp.marketPair.market1.title;
    if (opp.pair?.market1?.title) return opp.pair.market1.title;
    if (opp.market1Title) return opp.market1Title;
    return 'Unknown Market';
  };

  const getExchanges = (opp: ArbitrageOpportunity): { ex1: string; ex2: string } => {
    if (opp.marketPair?.market1?.exchange) {
      return {
        ex1: opp.marketPair.market1.exchange,
        ex2: opp.marketPair.market2?.exchange || 'Unknown'
      };
    }
    if (opp.pair?.market1?.exchange) {
      return {
        ex1: opp.pair.market1.exchange,
        ex2: opp.pair.market2?.exchange || 'Unknown'
      };
    }
    if (opp.exchange1) {
      return { ex1: opp.exchange1, ex2: opp.exchange2 || 'Unknown' };
    }
    return { ex1: 'Unknown', ex2: 'Unknown' };
  };

  const getResolutionScore = (opp: ArbitrageOpportunity): number => {
    if (opp.resolutionScore !== undefined) return opp.resolutionScore;
    if (opp.resolution?.score !== undefined) return opp.resolution.score;
    if (opp.resolutionAlignment?.score !== undefined) return opp.resolutionAlignment.score;
    return 0;
  };

  const getResolutionDetails = (opp: ArbitrageOpportunity): Partial<ResolutionAlignment> | undefined => {
    const alignment = opp.resolution || opp.resolutionAlignment;
    if (!alignment) return undefined;

    return {
      timingMatch: alignment.timingMatch,
      semanticMatch: alignment.semanticMatch,
      rulesMatch: alignment.rulesMatch,
      temporalDistance: alignment.temporalDistance
    };
  };

  return (
    <>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Market Pair
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Direction
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Profit
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                $10 Profit
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Resolves
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Resolution
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Confidence
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {paginatedOpportunities.map((opp, index) => {
              const exchanges = getExchanges(opp);
              const resolutionScore = getResolutionScore(opp);
              const resolutionDetails = getResolutionDetails(opp);
              const direction = parseDirection(opp.direction, exchanges.ex1, exchanges.ex2);
              const resolveInfo = getEarliestResolve(opp);

              return (
                <tr
                  key={opp.id || index}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => handleRowClick(opp)}
                >
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900 hover:text-primary-600">
                      {getMarketTitle(opp)}
                    </div>
                    <div className="text-sm text-gray-500">
                      {exchanges.ex1} ↔ {exchanges.ex2}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1 text-xs">
                      <span className={`px-1.5 py-0.5 rounded font-medium ${
                        direction.leg1 === 'YES' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {exchanges.ex1.substring(0, 1)}: {direction.leg1}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded font-medium ${
                        direction.leg2 === 'YES' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {exchanges.ex2.substring(0, 1)}: {direction.leg2}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-sm font-semibold ${
                      opp.profitPercent >= 5 ? 'text-green-600' :
                      opp.profitPercent >= 2 ? 'text-green-500' :
                      'text-gray-600'
                    }`}>
                      {opp.profitPercent?.toFixed(2)}%
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-medium text-green-600">
                      {calculateProfit10(opp.totalCost, opp.profitPercent)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {resolveInfo.days !== null ? (
                      <span title={resolveInfo.date ? format(resolveInfo.date, 'MMM d, yyyy') : ''}>
                        {resolveInfo.days}d
                      </span>
                    ) : '-'}
                  </td>
                  <td className="px-6 py-4">
                    <ResolutionRiskBadge
                      score={resolutionScore}
                      details={resolutionDetails}
                    />
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-900">
                      {(opp.confidence || 0).toFixed(0)}%
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      opp.valid ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {opp.valid ? 'Valid' : 'Invalid'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <PaginationControl
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={opportunities.length}
          pageSize={itemsPerPage}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          className="border-t"
        />
      )}

      <OpportunityDetailModal
        opportunity={selectedOpportunity}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
    </>
  );
}
