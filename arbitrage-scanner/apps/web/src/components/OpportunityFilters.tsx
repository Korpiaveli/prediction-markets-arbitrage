'use client';

import { useState, useCallback } from 'react';
import type { FilterState, ExchangeName, SortField, SortDirection, SortState } from '@/types';

interface OpportunityFiltersProps {
  filters: FilterState;
  sort: SortState;
  onFiltersChange: (filters: FilterState) => void;
  onSortChange: (sort: SortState) => void;
}

const EXCHANGES: ExchangeName[] = ['KALSHI', 'POLYMARKET', 'PREDICTIT', 'MANIFOLD'];

export function OpportunityFilters({ filters, sort, onFiltersChange, onSortChange }: OpportunityFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleProfitChange = useCallback((field: 'minProfit' | 'maxProfit', value: number) => {
    onFiltersChange({ ...filters, [field]: value });
  }, [filters, onFiltersChange]);

  const handleConfidenceChange = useCallback((value: number) => {
    onFiltersChange({ ...filters, minConfidence: value });
  }, [filters, onFiltersChange]);

  const handleExchangeToggle = useCallback((exchange: ExchangeName) => {
    const newExchanges = filters.exchanges.includes(exchange)
      ? filters.exchanges.filter(e => e !== exchange)
      : [...filters.exchanges, exchange];
    onFiltersChange({ ...filters, exchanges: newExchanges });
  }, [filters, onFiltersChange]);

  const handleSearchChange = useCallback((value: string) => {
    onFiltersChange({ ...filters, searchQuery: value });
  }, [filters, onFiltersChange]);

  const handleResolutionDaysChange = useCallback((value: number) => {
    onFiltersChange({ ...filters, minResolutionDays: value });
  }, [filters, onFiltersChange]);

  const handleSortFieldChange = useCallback((field: SortField) => {
    if (sort.field === field) {
      onSortChange({ field, direction: sort.direction === 'asc' ? 'desc' : 'asc' });
    } else {
      onSortChange({ field, direction: 'desc' });
    }
  }, [sort, onSortChange]);

  const clearFilters = useCallback(() => {
    onFiltersChange({
      minProfit: 0,
      maxProfit: 100,
      minConfidence: 0,
      exchanges: EXCHANGES,
      minResolutionDays: 0,
      searchQuery: ''
    });
  }, [onFiltersChange]);

  const hasActiveFilters = filters.minProfit > 0 ||
    filters.maxProfit < 100 ||
    filters.minConfidence > 0 ||
    filters.exchanges.length < EXCHANGES.length ||
    filters.minResolutionDays > 0 ||
    filters.searchQuery !== '';

  return (
    <div className="bg-gray-50 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 flex-1">
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search markets..."
              value={filters.searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
            <svg
              className="absolute left-3 top-2.5 h-5 w-5 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            Filters
            {hasActiveFilters && (
              <span className="bg-primary-500 text-white text-xs px-1.5 py-0.5 rounded-full">!</span>
            )}
          </button>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 ml-4">
          <span className="text-sm text-gray-500">Sort:</span>
          <select
            value={sort.field}
            onChange={(e) => handleSortFieldChange(e.target.value as SortField)}
            className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:ring-2 focus:ring-primary-500"
          >
            <option value="profitPercent">Profit %</option>
            <option value="confidence">Confidence</option>
            <option value="resolutionDays">Resolution</option>
            <option value="timestamp">Time</option>
          </select>
          <button
            onClick={() => onSortChange({ ...sort, direction: sort.direction === 'asc' ? 'desc' : 'asc' })}
            className="p-1 hover:bg-gray-200 rounded"
            title={sort.direction === 'asc' ? 'Ascending' : 'Descending'}
          >
            {sort.direction === 'asc' ? (
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Min Profit: {filters.minProfit}%
            </label>
            <input
              type="range"
              min="0"
              max="20"
              step="0.5"
              value={filters.minProfit}
              onChange={(e) => handleProfitChange('minProfit', parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Min Confidence: {filters.minConfidence}%
            </label>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={filters.minConfidence}
              onChange={(e) => handleConfidenceChange(parseInt(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Min Resolution Days: {filters.minResolutionDays}
            </label>
            <input
              type="range"
              min="0"
              max="90"
              step="1"
              value={filters.minResolutionDays}
              onChange={(e) => handleResolutionDaysChange(parseInt(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Exchanges
            </label>
            <div className="flex flex-wrap gap-2">
              {EXCHANGES.map(exchange => (
                <button
                  key={exchange}
                  onClick={() => handleExchangeToggle(exchange)}
                  className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${
                    filters.exchanges.includes(exchange)
                      ? 'bg-primary-500 text-white'
                      : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                  }`}
                >
                  {exchange.charAt(0) + exchange.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
