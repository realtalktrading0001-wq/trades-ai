import { getInitData } from './telegram';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-telegram-init-data': getInitData(),
    ...(options.headers as Record<string, string>),
  };
  const res = await fetch(path, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ---- Types shared with the backend ------------------------------------------
export type UserStatus = 'unregistered' | 'verifying' | 'verified' | 'rejected';

export interface UserState {
  id: string;
  name: string | null;
  pocketOptionId: string | null;
  status: UserStatus;
  subscription: string;
  timezone: string;
  language: string;
  refCode: string;
  inviteLink: string;
  stats: { total: number; taken: number; skipped: number };
}

export interface AppConfig {
  pocketOptionRefUrl: string;
  supportHandle: string;
  currencyPairs: string[];
  expirations: string[];
  timezones: string[];
  languages: string[];
}

export interface Signal {
  pair: string;
  expiration: string;
  direction: 'UP' | 'DOWN';
  accuracy: number;
  trendStrength: number; // 1–100
  trendBias: 'Bullish' | 'Bearish' | 'Neutral';
  createdAt: number;
}

export interface ReferralData {
  inviteLink: string;
  prizePool: number;
  rankPrizes: number[];
  weekEndsAt: number;
  invited: number;
  approved: number;
  rank: number | null;
  needForPrize: number;
  leaderboard: { rank: number; name: string; approved: number; prize: number }[];
  friends: { name: string; approved: boolean; deposit: number }[];
}

export interface FaqData {
  supportHandle: string;
  faq: { q: string; a: string }[];
}

// ---- Endpoints ---------------------------------------------------------------
export const api = {
  config: () => request<AppConfig>('/api/config'),
  auth: () => request<UserState>('/api/auth', { method: 'POST' }),
  me: () => request<UserState>('/api/me'),
  submitId: (pocketOptionId: string) =>
    request<UserState>('/api/registration/id', {
      method: 'POST',
      body: JSON.stringify({ pocketOptionId }),
    }),
  verifyStatus: () => request<UserState>('/api/registration/status'),
  generateSignal: (pair: string, expiration: string) =>
    request<Signal>('/api/signals/generate', {
      method: 'POST',
      body: JSON.stringify({ pair, expiration }),
    }),
  track: (action: 'taken' | 'skipped') =>
    request<{ total: number; taken: number; skipped: number }>('/api/signals/track', {
      method: 'POST',
      body: JSON.stringify({ action }),
    }),
  saveSettings: (settings: { timezone?: string; language?: string }) =>
    request<UserState>('/api/profile/settings', {
      method: 'POST',
      body: JSON.stringify(settings),
    }),
  referrals: () => request<ReferralData>('/api/referrals'),
  assistant: (message: string) =>
    request<{ reply: string }>('/api/assistant/message', {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),
  faq: () => request<FaqData>('/api/support/faq'),
};
