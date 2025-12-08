'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { ScannerStatus } from '@/components/ScannerStatus';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ResolutionRiskBadge } from '@/components/ResolutionRiskBadge';
import { useWebSocket } from '@/lib/useWebSocket';
import { apiClient } from '@/lib/api';

interface LiveEvent {
  id: string;
  type: 'opportunity' | 'scan_start' | 'scan_complete' | 'error' | 'connection';
  timestamp: Date;
  data: any;
}

export default function MonitorPage() {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [scannerStatus, setScannerStatus] = useState<any>(null);
  const [filter, setFilter] = useState<string>('all');
  const eventsEndRef = useRef<HTMLDivElement>(null);

  const { connected, lastMessage } = useWebSocket();

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (lastMessage) {
      const event: LiveEvent = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: lastMessage.type === 'opportunity' ? 'opportunity'
          : lastMessage.type === 'scan:complete' ? 'scan_complete'
          : lastMessage.type === 'connected' ? 'connection'
          : 'error',
        timestamp: new Date(),
        data: lastMessage.data || lastMessage
      };

      setEvents(prev => [event, ...prev].slice(0, 100));
    }
  }, [lastMessage]);

  async function loadStatus() {
    try {
      const result = await apiClient.getScannerStatus();
      setScannerStatus(result.data);
    } catch (error) {
      console.error('Failed to load scanner status:', error);
    }
  }

  const filteredEvents = filter === 'all'
    ? events
    : events.filter(e => e.type === filter);

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'opportunity':
        return (
          <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
            <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        );
      case 'scan_complete':
        return (
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        );
      case 'connection':
        return (
          <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
            <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
        );
      default:
        return (
          <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
            <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        );
    }
  };

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-8">
                <h1 className="text-2xl font-bold text-gray-900">
                  Arbitrage Scanner
                </h1>
                <nav className="hidden md:flex space-x-4">
                  <Link href="/" className="text-gray-600 hover:text-gray-900">Dashboard</Link>
                  <Link href="/monitor" className="text-primary-600 font-medium">Monitor</Link>
                  <Link href="/positions" className="text-gray-600 hover:text-gray-900">Positions</Link>
                  <Link href="/analytics" className="text-gray-600 hover:text-gray-900">Analytics</Link>
                </nav>
              </div>
              <ScannerStatus connected={connected} />
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-1">
              <div className="bg-white shadow rounded-lg p-6 sticky top-8">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Scanner Status</h2>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">WebSocket</span>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      connected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {connected ? 'Connected' : 'Disconnected'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Scanner</span>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      scannerStatus?.running ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {scannerStatus?.running ? 'Running' : 'Idle'}
                    </span>
                  </div>

                  {scannerStatus?.exchanges && (
                    <div>
                      <span className="text-sm text-gray-600">Exchanges</span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {scannerStatus.exchanges.map((ex: string) => (
                          <span key={ex} className="px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded">
                            {ex}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-6 pt-6 border-t border-gray-200">
                  <h3 className="text-sm font-medium text-gray-700 mb-3">Filter Events</h3>
                  <div className="space-y-2">
                    {[
                      { value: 'all', label: 'All Events' },
                      { value: 'opportunity', label: 'Opportunities' },
                      { value: 'scan_complete', label: 'Scan Results' },
                      { value: 'error', label: 'Errors' }
                    ].map(option => (
                      <label key={option.value} className="flex items-center">
                        <input
                          type="radio"
                          name="filter"
                          value={option.value}
                          checked={filter === option.value}
                          onChange={(e) => setFilter(e.target.value)}
                          className="h-4 w-4 text-primary-600"
                        />
                        <span className="ml-2 text-sm text-gray-700">{option.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="mt-6 pt-6 border-t border-gray-200">
                  <div className="text-sm text-gray-500">
                    Events shown: {filteredEvents.length}
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-3">
              <div className="bg-white shadow rounded-lg">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-lg font-semibold text-gray-900">Live Event Feed</h2>
                </div>

                <div className="divide-y divide-gray-100 max-h-[calc(100vh-280px)] overflow-y-auto">
                  {filteredEvents.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      <p className="mt-2">Waiting for events...</p>
                      <p className="text-sm">Events will appear here in real-time</p>
                    </div>
                  ) : (
                    filteredEvents.map(event => (
                      <div key={event.id} className="px-6 py-4 hover:bg-gray-50">
                        <div className="flex items-start space-x-4">
                          {getEventIcon(event.type)}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-medium text-gray-900">
                                {event.type === 'opportunity' && 'New Opportunity Found'}
                                {event.type === 'scan_complete' && 'Scan Completed'}
                                {event.type === 'connection' && 'Connection Established'}
                                {event.type === 'error' && 'Error Occurred'}
                              </p>
                              <span className="text-xs text-gray-500">
                                {formatDistanceToNow(event.timestamp, { addSuffix: true })}
                              </span>
                            </div>

                            {event.type === 'opportunity' && event.data && (
                              <div className="mt-2 p-3 bg-gray-50 rounded-md">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="text-sm text-gray-700">
                                      {event.data.marketPair?.market1?.title || event.data.market1Title || 'Market'}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                      {event.data.marketPair?.market1?.exchange || event.data.exchange1} ↔{' '}
                                      {event.data.marketPair?.market2?.exchange || event.data.exchange2}
                                    </p>
                                  </div>
                                  <div className="text-right">
                                    <p className={`text-lg font-semibold ${
                                      event.data.profitPercent >= 5 ? 'text-green-600' : 'text-green-500'
                                    }`}>
                                      {event.data.profitPercent?.toFixed(2)}%
                                    </p>
                                    {event.data.resolutionScore !== undefined && (
                                      <ResolutionRiskBadge score={event.data.resolutionScore} showTooltip={false} />
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}

                            {event.type === 'scan_complete' && event.data && (
                              <p className="mt-1 text-sm text-gray-600">
                                Found {event.data.count || 0} opportunities
                              </p>
                            )}

                            {event.type === 'error' && event.data && (
                              <p className="mt-1 text-sm text-red-600">
                                {event.data.message || JSON.stringify(event.data)}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={eventsEndRef} />
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </ErrorBoundary>
  );
}
