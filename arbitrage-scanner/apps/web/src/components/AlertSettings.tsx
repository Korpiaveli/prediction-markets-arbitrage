'use client';

import { useState, useEffect } from 'react';
import {
  getAlertSettings,
  saveAlertSettings,
  requestNotificationPermission,
  getNotificationPermission,
  type AlertSettings as AlertSettingsType
} from '@/lib/notifications';

interface AlertSettingsProps {
  onClose?: () => void;
}

export function AlertSettings({ onClose }: AlertSettingsProps) {
  const [settings, setSettings] = useState<AlertSettingsType>({
    enabled: false,
    minProfit: 2,
    minConfidence: 60,
    soundEnabled: true
  });
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    setSettings(getAlertSettings());
    setPermission(getNotificationPermission());
  }, []);

  const handleToggleEnabled = async () => {
    if (!settings.enabled && permission !== 'granted') {
      setRequesting(true);
      const granted = await requestNotificationPermission();
      setRequesting(false);
      setPermission(getNotificationPermission());
      if (!granted) return;
    }

    const newSettings = { ...settings, enabled: !settings.enabled };
    setSettings(newSettings);
    saveAlertSettings(newSettings);
  };

  const handleChange = (key: keyof AlertSettingsType, value: number | boolean) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    saveAlertSettings(newSettings);
  };

  const testNotification = () => {
    if (permission !== 'granted') return;

    new Notification('Test Alert', {
      body: 'Notifications are working!',
      icon: '/favicon.ico'
    });
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 w-80">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-medium text-gray-900">Alert Settings</h3>
        {onClose && (
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {permission === 'unsupported' && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
          Browser notifications are not supported.
        </div>
      )}

      {permission === 'denied' && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
          Notifications are blocked. Enable them in browser settings.
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">Enable Alerts</span>
          <button
            onClick={handleToggleEnabled}
            disabled={requesting || permission === 'denied' || permission === 'unsupported'}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              settings.enabled ? 'bg-primary-600' : 'bg-gray-200'
            } ${(requesting || permission === 'denied' || permission === 'unsupported') ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                settings.enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Min Profit: {settings.minProfit}%
          </label>
          <input
            type="range"
            min="0.5"
            max="10"
            step="0.5"
            value={settings.minProfit}
            onChange={(e) => handleChange('minProfit', parseFloat(e.target.value))}
            disabled={!settings.enabled}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Min Confidence: {settings.minConfidence}%
          </label>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={settings.minConfidence}
            onChange={(e) => handleChange('minConfidence', parseInt(e.target.value))}
            disabled={!settings.enabled}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
          />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">Sound</span>
          <button
            onClick={() => handleChange('soundEnabled', !settings.soundEnabled)}
            disabled={!settings.enabled}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              settings.soundEnabled ? 'bg-primary-600' : 'bg-gray-200'
            } ${!settings.enabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                settings.soundEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {settings.enabled && permission === 'granted' && (
          <button
            onClick={testNotification}
            className="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
          >
            Test Notification
          </button>
        )}
      </div>
    </div>
  );
}
