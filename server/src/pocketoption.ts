import crypto from 'node:crypto';

// PocketOption affiliate ("Partners") API.
// Request URL: {BASE}/{user_id}/{partner_id}/{hash}
// hash = md5(`${user_id}:${partner_id}:${api_token}`)
const PARTNER_ID = process.env.POCKETOPTION_PARTNER_ID ?? '';
const API_TOKEN = process.env.POCKETOPTION_API_TOKEN ?? '';
const API_BASE = process.env.POCKETOPTION_API_BASE ?? 'https://pocketpartners.com/api/user-info';

export const PO_CONFIGURED = !!(API_TOKEN && PARTNER_ID);
export const MIN_DEPOSIT_USD = Number(process.env.MIN_DEPOSIT_USD) || 15;

export interface PoVerifyResult {
  registered: boolean; // user exists under our affiliate (HTTP 200, not an error body)
  notFound: boolean; // definitive "this id is not under our affiliate" (404 / error body)
  depositAmount: number; // best-effort total deposit in USD (0 if unknown)
  configured: boolean; // API token + partner id present
  raw?: unknown;
  error?: string;
}

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// The success response shape isn't documented; pull a deposit-like number from
// the most common field names (top-level or nested under `data`). Refine once we
// see a real registered-user payload (it's logged on first success).
function extractDeposit(data: unknown): number {
  if (!data || typeof data !== 'object') return 0;
  const obj = data as Record<string, unknown>;
  const d =
    obj.data && typeof obj.data === 'object' ? (obj.data as Record<string, unknown>) : obj;
  const keys = [
    'deposit',
    'deposits_sum',
    'deposit_sum',
    'deposits_amount',
    'total_deposit',
    'total_deposits',
    'sum_deposits',
    'depositsAmount',
    'amount',
  ];
  for (const k of keys) if (k in d) return toNum(d[k]);
  return 0;
}

/** Look up a PocketOption user id against our affiliate. */
export async function verifyPocketOptionId(userId: string): Promise<PoVerifyResult> {
  if (!PO_CONFIGURED) return { registered: false, notFound: false, depositAmount: 0, configured: false };

  const hash = crypto.createHash('md5').update(`${userId}:${PARTNER_ID}:${API_TOKEN}`).digest('hex');
  const url = `${API_BASE}/${encodeURIComponent(userId)}/${PARTNER_ID}/${hash}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const text = await res.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    const isError =
      data && typeof data === 'object' && (data as Record<string, unknown>).error === true;

    if (res.status === 200 && !isError) {
      const depositAmount = extractDeposit(data);
      console.log(`[po-verify] ${userId} registered (deposit≈${depositAmount}). raw:`, JSON.stringify(data).slice(0, 500));
      return { registered: true, notFound: false, depositAmount, configured: true, raw: data };
    }

    let message = `status_${res.status}`;
    if (data && typeof data === 'object') {
      const m = (data as Record<string, unknown>).message;
      if (typeof m === 'string') message = m;
    }
    // 404 or an error body = the id is definitively not under our affiliate.
    const notFound = res.status === 404 || res.status === 400 || isError === true;
    return { registered: false, notFound, depositAmount: 0, configured: true, raw: data, error: message };
  } catch (e) {
    // Network/timeout error — NOT a definitive rejection; let the caller retry.
    return {
      registered: false,
      notFound: false,
      depositAmount: 0,
      configured: true,
      error: e instanceof Error ? e.message : 'fetch_failed',
    };
  }
}
