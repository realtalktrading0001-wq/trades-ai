import crypto from 'node:crypto';

// Meta Conversions API (server-side events) for the "Free" funnel.
// We replay the real conversions that happen off the website (PocketOption
// registration + deposit, reached via Telegram) back to Meta, matched to the
// original ad click via the fbc/fbp captured on the Free landing page.
const PIXEL_ID = process.env.FREE_PIXEL_ID ?? '';
const TOKEN = process.env.META_CAPI_TOKEN ?? '';
const API_VERSION = process.env.META_CAPI_VERSION ?? 'v19.0';
const TEST_CODE = process.env.META_CAPI_TEST_CODE ?? ''; // set while testing in Events Manager
const FREE_URL = process.env.FREE_LANDING_URL ?? 'https://your-domain.com/free.html';

export const CAPI_CONFIGURED = !!(PIXEL_ID && TOKEN);

/** Meta requires PII (like external_id) SHA-256 hashed, normalized lower/trim. */
function hash(s: string): string {
  return crypto.createHash('sha256').update(s.trim().toLowerCase()).digest('hex');
}

export interface CapiEvent {
  eventName: 'CompleteRegistration' | 'Purchase' | 'Lead';
  eventId: string; // stable id for dedup with any browser-side event
  fbc?: string | null;
  fbp?: string | null;
  externalId?: string | null; // raw (e.g. tg_id) — hashed before sending
  value?: number;
  currency?: string;
}

/**
 * Fire-and-forget a server event to Meta. No-ops if FREE_PIXEL_ID / META_CAPI_TOKEN
 * aren't set (keeps local dev working), or if there's nothing to match the user on.
 */
export async function sendCapiEvent(ev: CapiEvent): Promise<void> {
  if (!CAPI_CONFIGURED) return;
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
        event_source_url: FREE_URL,
        user_data,
        custom_data,
      },
    ],
  };
  if (TEST_CODE) payload.test_event_code = TEST_CODE;

  const url = `https://graph.facebook.com/${API_VERSION}/${PIXEL_ID}/events?access_token=${encodeURIComponent(TOKEN)}`;
  try {
    const res = await fetch(url, {
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
