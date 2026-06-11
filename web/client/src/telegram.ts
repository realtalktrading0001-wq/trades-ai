// Web platform shim. The mini app talked to the Telegram WebApp bridge here;
// on the website these are plain-browser equivalents. The function names are
// kept identical so the screens/components import the same API unchanged.

const TOKEN_KEY = 'tradesai_token';
const REF_KEY = 'tradesai_ref';

/** Session token sent as `Authorization: Bearer <token>` on API calls. */
export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? '';
}
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * Referral code from the `?ref=` query param (persisted so it survives the
 * email -> code two-step login). Returns '' when there's no referral.
 */
export function getRefCode(): string {
  const fromUrl = new URLSearchParams(window.location.search).get('ref');
  if (fromUrl) {
    localStorage.setItem(REF_KEY, fromUrl);
    return fromUrl;
  }
  return localStorage.getItem(REF_KEY) ?? '';
}
export function clearRefCode(): void {
  localStorage.removeItem(REF_KEY);
}

/** No-op on web (the mini app used this to talk to the Telegram WebApp). */
export function initTelegram(): void {
  /* nothing to initialise in a plain browser */
}

export function openExternal(url: string): void {
  window.open(url, '_blank', 'noopener');
}

/** Share the invite link: native share sheet if available, else copy to clipboard. */
export async function shareToTelegram(url: string, text: string): Promise<void> {
  if (navigator.share) {
    try {
      await navigator.share({ title: 'TRADES AI', text, url });
      return;
    } catch {
      /* user dismissed the share sheet — fall through to copy */
    }
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
  } catch {
    window.open(url, '_blank', 'noopener');
  }
}

/** Light haptic tap where the browser supports the Vibration API. */
export function haptic(): void {
  navigator.vibrate?.(8);
}
