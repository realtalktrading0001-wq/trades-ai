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
  requestWriteAccess?: (callback?: (granted: boolean) => void) => void;
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

/**
 * Ask the user to allow the bot to message them. Granting this lets the bot send
 * the welcome DM (so it lands in their chat list) and re-engage them later via
 * broadcasts. Resolves true if granted; false outside Telegram or on old clients.
 */
export function requestWriteAccess(): Promise<boolean> {
  return new Promise((resolve) => {
    if (!tg || typeof tg.requestWriteAccess !== 'function') {
      resolve(false);
      return;
    }
    try {
      tg.requestWriteAccess((granted) => resolve(!!granted));
    } catch {
      resolve(false);
    }
  });
}
