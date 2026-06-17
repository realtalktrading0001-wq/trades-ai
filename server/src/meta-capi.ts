import crypto from 'node:crypto';

// Meta Conversions API (server-side events). We replay the real conversions that
// happen off the website (PocketOption registration + deposit, reached via Telegram)
// back to Meta, matched to the original ad click via the fbc/fbp captured on a landing
// page. Each landing funnel reports to its OWN pixel, chosen by the attribution
// `source` (the landing variant stored with the click): "app" -> APP_*, else Free.
const TOKEN = process.env.META_CAPI_TOKEN ?? ''; // shared/legacy token (per-funnel fallback)
const API_VERSION = process.env.META_CAPI_VERSION ?? 'v19.0';
const TEST_CODE = process.env.META_CAPI_TEST_CODE ?? ''; // set while testing in Events Manager

interface CapiTarget {
  pixel: string;
  token: string;
  url: string;
}
/** Read a funnel's pixel / CAPI token / source-url from env. The token falls back to
 *  the shared META_CAPI_TOKEN (e.g. a System-User token covering all pixels); the url
 *  to the page's public URL. Each funnel = its own <PREFIX>_PIXEL_ID + (optional) token. */
function funnel(prefix: string, urlDefault: string): CapiTarget {
  return {
    pixel: process.env[`${prefix}_PIXEL_ID`] ?? '',
    token: process.env[`${prefix}_META_CAPI_TOKEN`] ?? TOKEN,
    url: process.env[`${prefix}_LANDING_URL`] ?? urlDefault,
  };
}
const FUNNELS: Record<string, CapiTarget> = {
  hero: funnel('HERO', 'https://tradesaipocketbot.live/hero.html'),
  proof: funnel('PROOF', 'https://tradesaipocketbot.live/proof.html'),
  free: funnel('FREE', 'https://tradesaipocketbot.live/free.html'),
  app: funnel('APP', 'https://tradesaipocketbot.live/app.html'),
};
/** Pick the pixel/token/source-url for an attribution source. Unknown/empty -> Free funnel. */
function targetFor(source?: string | null): CapiTarget {
  return (source ? FUNNELS[source] : undefined) ?? FUNNELS.free;
}

export const CAPI_CONFIGURED = Object.values(FUNNELS).some((f) => !!(f.pixel && f.token));

/** Meta requires PII (like external_id) SHA-256 hashed, normalized lower/trim. */
function hash(s: string): string {
  return crypto.createHash('sha256').update(s.trim().toLowerCase()).digest('hex');
}

export interface CapiEvent {
  eventName: 'CompleteRegistration' | 'Purchase' | 'Lead';
  eventId: string; // stable id for dedup with any browser-side event
  source?: string | null; // landing variant ('app' | 'free' | …) -> selects the pixel
  fbc?: string | null;
  fbp?: string | null;
  externalId?: string | null; // raw (e.g. tg_id) — hashed before sending
  value?: number;
  currency?: string;
}

/**
 * Fire-and-forget a server event to Meta. No-ops if this funnel's pixel/token aren't
 * set (keeps local dev working, and avoids cross-pixel pollution when a new funnel's
 * pixel isn't configured yet), or if there's nothing to match the user on.
 */
export async function sendCapiEvent(ev: CapiEvent): Promise<void> {
  const { pixel, token, url } = targetFor(ev.source);
  if (!pixel || !token) return;
  if (!ev.fbc && !ev.fbp && !ev.externalId) return;

  const user_data: Record<string, unknown> = {};
  if (ev.fbc) user_data.fbc = ev.fbc;
  if (ev.fbp) user_data.fbp = ev.fbp;
  if (ev.externalId) user_data.external_id = hash(ev.externalId);

  const custom_data: Record<string, unknown> = {};
  if (typeof ev.value === 'number') {
    custom_data.value = ev.value;
    custom_data.currency = ev.currency ?? 'USD';
  }

  const payload: Record<string, unknown> = {
    data: [
      {
        event_name: ev.eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: ev.eventId,
        action_source: 'website',
        event_source_url: url,
        user_data,
        custom_data,
      },
    ],
  };
  if (TEST_CODE) payload.test_event_code = TEST_CODE;

  const apiUrl = `https://graph.facebook.com/${API_VERSION}/${pixel}/events?access_token=${encodeURIComponent(token)}`;
  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    const text = await res.text();
    if (!res.ok) {
      console.warn(`[meta-capi] ${ev.eventName} HTTP ${res.status}: ${text.slice(0, 300)}`);
    } else {
      console.log(`[meta-capi] ${ev.eventName} sent (event_id=${ev.eventId})`);
    }
  } catch (e) {
    console.warn('[meta-capi] send failed:', e instanceof Error ? e.message : e);
  }
}
