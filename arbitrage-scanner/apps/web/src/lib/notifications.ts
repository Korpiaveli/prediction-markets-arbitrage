import type { ArbitrageOpportunity } from '@/types';

export interface AlertSettings {
  enabled: boolean;
  minProfit: number;
  minConfidence: number;
  soundEnabled: boolean;
}

const DEFAULT_SETTINGS: AlertSettings = {
  enabled: false,
  minProfit: 2,
  minConfidence: 60,
  soundEnabled: true
};

const STORAGE_KEY = 'arbitrage-alert-settings';

export function getAlertSettings(): AlertSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? { ...DEFAULT_SETTINGS, ...JSON.parse(stored) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveAlertSettings(settings: AlertSettings): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export function showOpportunityNotification(opportunity: ArbitrageOpportunity): void {
  const settings = getAlertSettings();

  if (!settings.enabled) return;
  if (opportunity.profitPercent < settings.minProfit) return;
  if (opportunity.confidence < settings.minConfidence) return;

  if (Notification.permission !== 'granted') return;

  const title = opportunity.marketPair?.market1?.title ||
    opportunity.pair?.market1?.title ||
    opportunity.market1Title ||
    'New Arbitrage';

  const ex1 = opportunity.marketPair?.market1?.exchange ||
    opportunity.exchange1 ||
    'Exchange 1';
  const ex2 = opportunity.marketPair?.market2?.exchange ||
    opportunity.exchange2 ||
    'Exchange 2';

  const notification = new Notification(`${opportunity.profitPercent.toFixed(2)}% Arbitrage Found`, {
    body: `${title}\n${ex1} ↔ ${ex2}`,
    icon: '/favicon.ico',
    tag: opportunity.id,
    requireInteraction: false
  });

  notification.onclick = () => {
    window.focus();
    window.location.href = `/opportunity/${opportunity.id}`;
    notification.close();
  };

  setTimeout(() => notification.close(), 10000);

  if (settings.soundEnabled) {
    playNotificationSound();
  }
}

function playNotificationSound(): void {
  try {
    const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 880;
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  } catch {
    // Audio not available
  }
}
