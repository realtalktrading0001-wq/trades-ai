// Thin wrapper around the Telegram WebApp global injected by telegram-web-app.js.

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { user?: { id: number; first_name?: string; username?: string }; start_param?: string };
  ready: () => void;
  expand: () => void;
  openLink: (url: string) => void;
  openTelegramLink: (url: string) => void;
  HapticFeedback?: { impactOccurred: (s: string) => void; notificationOccurred: (s: string) => void };
  setHeaderColor?: (c: string) => void;
  setBackgroundColor?: (c: string) => void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export const tg = window.Telegram?.WebApp;

export function initTelegram(): void {
  if (!tg) return;
  tg.ready();
  tg.expand();
  tg.setHeaderColor?.('#0B1426');
  tg.setBackgroundColor?.('#060A13');
}

/** initData string used to authenticate API calls. Empty when running outside Telegram. */
export function getInitData(): string {
  return tg?.initData ?? '';
}

export function openExternal(url: string): void {
  if (tg) tg.openLink(url);
  else window.open(url, '_blank', 'noopener');
}

export function shareToTelegram(url: string, text: string): void {
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  if (tg) tg.openTelegramLink(shareUrl);
  else window.open(shareUrl, '_blank', 'noopener');
}

export function haptic(): void {
  tg?.HapticFeedback?.impactOccurred('light');
}
