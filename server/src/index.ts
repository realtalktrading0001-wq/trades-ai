import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { db, type UserRow, type StatsRow } from './db.js';
import { authMiddleware } from './auth.js';
import { buildUserState, runVerification } from './state.js';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT) || 4000;
const POCKETOPTION_REF_URL =
  process.env.POCKETOPTION_REF_URL ?? 'https://pocketoption.com/?ref=YOUR_REF_CODE';
const SUPPORT_HANDLE = process.env.SUPPORT_HANDLE ?? 'Tradesaisupport';
const WEEKLY_PRIZE_POOL = Number(process.env.WEEKLY_PRIZE_POOL) || 400;

const CURRENCY_PAIRS = [
  'EUR/USD-OTC',
  'EUR/CHF-OTC',
  'EUR/GBP-OTC',
  'GBP/JPY-OTC',
  'GBP/USD-OTC',
  'EUR/RUB-OTC',
  'USD/INR-OTC',
  'USD/CLP-OTC',
  'USD/VND-OTC',
  'USD/PKR-OTC',
  'USD/COP-OTC',
  'USD/PHP-OTC',
  'OMR/CNY-OTC',
  'JOD/CNY-OTC',
  'ZAR/USD-OTC',
  'EUR/HUF-OTC',
  'EUR/TRY-OTC',
  'YER/USD-OTC',
  'SAR/CNY-OTC',
  'AUD/USD-OTC',
  'USD/MYR-OTC',
  'AUD/CAD-OTC',
  'AUD/NZD-OTC',
  'NGN/USD-OTC',
  'EUR/NZD-OTC',
  'GBP/AUD-OTC',
  'LBP/USD-OTC',
  'AED/CNY-OTC',
  'CAD/CHF-OTC',
  'CHF/JPY-OTC',
  'USD/JPY-OTC',
  'USD/IDR-OTC',
  'USD/ARS-OTC',
  'USD/BRL-OTC',
  'KES/USD-OTC',
  'UAH/USD-OTC',
  'AUD/CHF-OTC',
  'USD/THB-OTC',
  'USD/DZD-OTC',
  'QAR/CNY-OTC',
  'USD/CNH-OTC',
  'AUD/JPY-OTC',
  'USD/CHF-OTC',
  'USD/MXN-OTC',
  'BHD/CNY-OTC',
  'CAD/JPY-OTC',
  'USD/RUB-OTC',
  'USD/EGP-OTC',
  'MAD/USD-OTC',
  'CHF/NOK-OTC',
  'NZD/USD-OTC',
  'USD/SGD-OTC',
  'TND/USD-OTC',
  'USD/CAD-OTC',
  'EUR/JPY-OTC',
  'USD/BDT-OTC',
  'NZD/JPY-OTC',
];
const EXPIRATIONS = ['5 sec', '15 sec', '30 sec', '1 min', '2 min', '3 min', '5 min'];

const RANK_PRIZES = [150, 100, 75, 50, 25];

// ---- Public config (no auth) -------------------------------------------------
app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.get('/api/config', (_req, res) => {
  res.json({
    pocketOptionRefUrl: POCKETOPTION_REF_URL,
    supportHandle: SUPPORT_HANDLE,
    currencyPairs: CURRENCY_PAIRS,
    expirations: EXPIRATIONS,
    timezones: [
      'UTC+0 (Lagos)',
      'UTC+1 (Berlin)',
      'UTC+2 (Cairo)',
      'UTC+3 (Moscow)',
      'UTC+5:30 (Mumbai)',
      'UTC-5 (New York)',
      'UTC-8 (Los Angeles)',
    ],
    languages: ['English', 'हिन्दी', 'Español', 'Português', 'Русский', 'العربية'],
  });
});

// ---- Everything below requires a (real or dev-mock) Telegram user -----------
app.use('/api', authMiddleware);

app.post('/api/auth', (req, res) => {
  res.json(buildUserState(req.user));
});

app.get('/api/me', (req, res) => {
  res.json(buildUserState(req.user));
});

// Registration: submit PocketOption ID -> look it up against our affiliate now.
app.post('/api/registration/id', async (req, res) => {
  const { pocketOptionId } = req.body ?? {};
  if (!pocketOptionId || !/^\d{4,12}$/.test(String(pocketOptionId))) {
    res.status(400).json({ error: 'Enter a valid numeric PocketOption ID' });
    return;
  }
  db.prepare(
    `UPDATE users SET pocket_option_id = ?, status = 'verifying', verify_started_at = ? WHERE tg_id = ?`
  ).run(String(pocketOptionId), Date.now(), req.user.tg_id);
  const fresh = db.prepare('SELECT * FROM users WHERE tg_id = ?').get(req.user.tg_id) as unknown as UserRow;
  const verified = await runVerification(fresh); // auto-accept if registered under us
  res.json(buildUserState(verified));
});

// Poll verification status (drives the "Verifying…" card) — re-checks the API.
app.get('/api/registration/status', async (req, res) => {
  const fresh = db.prepare('SELECT * FROM users WHERE tg_id = ?').get(req.user.tg_id) as unknown as UserRow;
  const verified = await runVerification(fresh);
  res.json(buildUserState(verified));
});

// "I already have a PocketOption account" — moves user toward ID entry
app.post('/api/registration/have-account', (req, res) => {
  res.json(buildUserState(req.user));
});

// Clear a transient 'rejected'/'verifying' state back to a clean 'unregistered'
// view (used to auto-dismiss the rejection card). Never touches a verified user.
app.post('/api/registration/reset', (req, res) => {
  db.prepare(
    `UPDATE users SET status = 'unregistered', subscription = 'Not registered',
       pocket_option_id = NULL, verify_started_at = NULL
     WHERE tg_id = ? AND status = 'rejected'`
  ).run(req.user.tg_id);
  const fresh = db.prepare('SELECT * FROM users WHERE tg_id = ?').get(req.user.tg_id) as unknown as UserRow;
  res.json(buildUserState(fresh));
});

// Generate a signal (verified users only)
app.post('/api/signals/generate', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE tg_id = ?').get(req.user.tg_id) as unknown as UserRow;
  if (user.status !== 'verified') {
    res.status(403).json({ error: 'not_verified' });
    return;
  }
  const { pair, expiration } = req.body ?? {};
  const usePair = CURRENCY_PAIRS.includes(pair) ? pair : CURRENCY_PAIRS[0];
  const useExp = EXPIRATIONS.includes(expiration) ? expiration : EXPIRATIONS[3];
  const direction: 'UP' | 'DOWN' = Math.random() > 0.5 ? 'UP' : 'DOWN';
  const trendStrength = 1 + Math.floor(Math.random() * 100); // 1–100%
  const accuracy = 72 + Math.floor(Math.random() * 22); // 72–93%
  const trendBias: 'Bullish' | 'Bearish' | 'Neutral' =
    trendStrength < 40 ? 'Neutral' : direction === 'UP' ? 'Bullish' : 'Bearish';
  const createdAt = Date.now();
  db.prepare(
    `INSERT INTO signals (user_id, pair, expiration, direction, confidence, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(user.tg_id, usePair, useExp, direction, accuracy, createdAt);
  res.json({ pair: usePair, expiration: useExp, direction, accuracy, trendStrength, trendBias, createdAt });
});

// Track a signal as taken / skipped
app.post('/api/signals/track', (req, res) => {
  const action = req.body?.action;
  if (action !== 'taken' && action !== 'skipped') {
    res.status(400).json({ error: 'action must be taken|skipped' });
    return;
  }
  const col = action === 'taken' ? 'taken' : 'skipped';
  db.prepare(`UPDATE stats SET total = total + 1, ${col} = ${col} + 1 WHERE user_id = ?`).run(
    req.user.tg_id
  );
  const stats = db.prepare('SELECT * FROM stats WHERE user_id = ?').get(req.user.tg_id) as unknown as StatsRow;
  res.json({ total: stats.total, taken: stats.taken, skipped: stats.skipped });
});

// Profile settings
app.post('/api/profile/settings', (req, res) => {
  const { timezone, language } = req.body ?? {};
  if (timezone) db.prepare('UPDATE users SET timezone = ? WHERE tg_id = ?').run(timezone, req.user.tg_id);
  if (language) db.prepare('UPDATE users SET language = ? WHERE tg_id = ?').run(language, req.user.tg_id);
  const fresh = db.prepare('SELECT * FROM users WHERE tg_id = ?').get(req.user.tg_id) as unknown as UserRow;
  res.json(buildUserState(fresh));
});

// Referrals data
app.get('/api/referrals', (req, res) => {
  const userId = req.user.tg_id;
  const startOfWeek = getStartOfWeek();
  const invited = db
    .prepare('SELECT COUNT(*) AS c FROM referrals WHERE inviter_id = ?')
    .get(userId) as { c: number };
  const approved = db
    .prepare('SELECT COUNT(*) AS c FROM referrals WHERE inviter_id = ? AND approved = 1')
    .get(userId) as { c: number };

  // Leaderboard: inviters ranked by approved referrals this week
  const leaderboard = db
    .prepare(
      `SELECT inviter_id, COUNT(*) AS approved
       FROM referrals
       WHERE approved = 1 AND created_at >= ?
       GROUP BY inviter_id
       ORDER BY approved DESC
       LIMIT 5`
    )
    .all(startOfWeek) as { inviter_id: string; approved: number }[];

  const rank =
    leaderboard.findIndex((r) => r.inviter_id === userId) >= 0
      ? leaderboard.findIndex((r) => r.inviter_id === userId) + 1
      : null;

  const friends = db
    .prepare(
      `SELECT r.invitee_id, r.approved, r.deposit_usd, u.name
       FROM referrals r LEFT JOIN users u ON u.tg_id = r.invitee_id
       WHERE r.inviter_id = ? ORDER BY r.created_at DESC`
    )
    .all(userId) as { invitee_id: string; approved: number; deposit_usd: number; name: string | null }[];

  res.json({
    inviteLink: buildUserState(req.user).inviteLink,
    prizePool: WEEKLY_PRIZE_POOL,
    rankPrizes: RANK_PRIZES,
    weekEndsAt: getEndOfWeek(),
    invited: invited.c,
    approved: approved.c,
    rank,
    needForPrize: Math.max(0, 3 - approved.c),
    leaderboard: leaderboard.map((r, i) => ({
      rank: i + 1,
      name: r.inviter_id === userId ? 'You' : `Trader ${r.inviter_id.slice(-4)}`,
      approved: r.approved,
      prize: RANK_PRIZES[i] ?? 0,
    })),
    friends: friends.map((f) => ({
      name: f.name ?? `Friend ${f.invitee_id.slice(-4)}`,
      approved: !!f.approved,
      deposit: f.deposit_usd,
    })),
  });
});

// AI Assistant (stubbed). Swap this block for a real Claude API call later.
app.post('/api/assistant/message', (req, res) => {
  const message = String(req.body?.message ?? '').trim();
  res.json({ reply: stubbedAssistantReply(message) });
});

// Support FAQ
app.get('/api/support/faq', (_req, res) => {
  res.json({
    supportHandle: SUPPORT_HANDLE,
    faq: [
      {
        q: 'How do I unlock signals?',
        a: 'Register a PocketOption account through our link, then submit your PocketOption ID. Verification is automatic and usually takes a few seconds.',
      },
      {
        q: 'Why do I need to use your link?',
        a: 'The bot is free because we earn a small share of trading volume from our partner broker. That only works if your account is linked to us.',
      },
      {
        q: 'How accurate are the signals?',
        a: 'Our AI reports 90%+ accuracy on strong trends. No signal is guaranteed — always manage your risk.',
      },
      {
        q: 'How do referral prizes work?',
        a: 'Invite friends with your link. Friends who register and deposit at least $15 count as approved. The top 5 referrers each week win balance rewards.',
      },
    ],
  });
});

function stubbedAssistantReply(message: string): string {
  const m = message.toLowerCase();
  if (!m) return 'Hi! I am your Trades AI assistant. Ask me about pairs, timeframes, or strategy. 📈';
  if (m.includes('eur') || m.includes('pair'))
    return 'EUR/USD-OTC is showing a strong intraday trend. On a 1–3 min expiry, wait for a pullback to the trend line before entering. ⚡';
  if (m.includes('time') || m.includes('expir'))
    return 'For beginners, 1–3 minute expirations are the sweet spot — long enough to ride a trend, short enough to stay disciplined. ⏱️';
  if (m.includes('risk') || m.includes('manage'))
    return 'Risk no more than 2–5% of your balance per trade, and stop after 3 losses in a row. Consistency beats intensity. 🛡️';
  return 'Got it. Based on current market conditions I would wait for a confirmed signal before entering. Tap "Get Signal" on the Signals tab for a live read. 🤖';
}

function getStartOfWeek(): number {
  const now = new Date();
  const day = (now.getUTCDay() + 6) % 7; // Monday = 0
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day));
  return monday.getTime();
}
function getEndOfWeek(): number {
  return getStartOfWeek() + 7 * 24 * 60 * 60 * 1000;
}

// Serve the built client (production / single-service deploy). The client calls
// same-origin /api, so one HTTPS origin serves both the app and the API. In dev
// the client runs on Vite and this block is skipped (no client/dist yet).
const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.sendFile(path.join(clientDist, 'index.html'));
  });
  console.log('[signal-ai] serving built client from', clientDist);
}

app.listen(PORT, () => {
  console.log(`[signal-ai] server listening on http://localhost:${PORT}`);
  if (!process.env.BOT_TOKEN) {
    console.log('[signal-ai] BOT_TOKEN not set — running in dev mode with a mock Telegram user.');
  }
});
