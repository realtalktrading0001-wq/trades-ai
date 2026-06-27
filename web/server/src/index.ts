import './env.js'; // must be first — loads web/server/.env before any config is read
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { db, type UserRow, type StatsRow } from './db.js';
import {
  authMiddleware,
  createLoginCode,
  destroySession,
  isValidEmail,
  loginWithEmail,
  normalizeEmail,
  tokenFromRequest,
  verifyLoginCode,
} from './auth.js';
import { sendLoginCode, EMAIL_CONFIGURED } from './email.js';
import { buildUserState, runVerification, isDemoUser, ACCESS_MIN_BALANCE, REVOKE_BALANCE } from './state.js';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT) || 4001;
const POCKETOPTION_REF_URL =
  process.env.POCKETOPTION_REF_URL ?? 'https://pocketoption.com/?ref=YOUR_REF_CODE';
const SUPPORT_HANDLE = process.env.SUPPORT_HANDLE ?? 'Tradesaisupport';
const DAILY_PRIZE_POOL = Number(process.env.DAILY_PRIZE_POOL) || 1000;

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

// Timezone list — matches PocketOption's trading app exactly (bare UTC offsets,
// UTC-11:00 → UTC+12:45). The "UTC±HH:MM" label is parsed by client/time.ts.
const TIMEZONES = [
  'UTC-11:00',
  'UTC-10:00',
  'UTC-09:30',
  'UTC-09:00',
  'UTC-08:00',
  'UTC-07:00',
  'UTC-06:00',
  'UTC-05:00',
  'UTC-04:00',
  'UTC-03:30',
  'UTC-03:00',
  'UTC-02:00',
  'UTC-01:00',
  'UTC+00:00',
  'UTC+01:00',
  'UTC+02:00',
  'UTC+03:00',
  'UTC+03:30',
  'UTC+04:00',
  'UTC+04:30',
  'UTC+05:00',
  'UTC+05:30',
  'UTC+05:45',
  'UTC+06:00',
  'UTC+06:30',
  'UTC+07:00',
  'UTC+08:00',
  'UTC+08:45',
  'UTC+09:00',
  'UTC+09:30',
  'UTC+10:00',
  'UTC+10:30',
  'UTC+11:00',
  'UTC+12:00',
  'UTC+12:45',
];

const RANK_PRIZES = [400, 250, 150, 120, 80]; // sums to the $1000 daily pool

// Seed names for the "Daily Leaderboard" — a mix of countries so a brand-new user
// sees an active, believable board (and changing daily, never per-refresh, so it
// doesn't look fake). Real referrers ("You") are merged in by their invite count.
const LEADERBOARD_NAMES = [
  'Rahul S.', 'Priya M.', 'Arjun K.', 'Ananya R.', 'Vikram P.', 'Sneha G.', 'Rohan D.',
  'Aditya V.', 'Kavya N.', 'Michael B.', 'Jessica L.', 'David W.', 'Ashley T.', 'James C.',
  'Emily H.', 'Chris M.', 'Sarah K.', 'Daniel R.', 'Megan P.', 'Carlos R.', 'María G.',
  'Lucas F.', 'Sofía D.', 'João S.', 'Ana C.', 'Dmitri V.', 'Olga P.', 'Ahmed Z.',
  'Fatima A.', 'Omar H.', 'Kwame O.', 'Chidi N.', 'Amara E.', 'Wei C.', 'Mei L.', 'Minh T.',
];

// Deterministic PRNG (mulberry32) so a given seed always yields the same sequence.
function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Build the seeded fake leaderboard for the current UTC day.
function dailyLeaderboard(count: number): { name: string; approved: number }[] {
  const day = Math.floor(Date.now() / 86_400_000); // changes once per UTC day
  const rand = seededRandom((day + 1) * 2654435761);
  const names = [...LEADERBOARD_NAMES];
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [names[i], names[j]] = [names[j], names[i]];
  }
  let invites = 33 + Math.floor(rand() * 6); // rank 1: 33–38 invites
  return names.slice(0, count).map((name, i) => {
    if (i > 0) invites -= 3 + Math.floor(rand() * 4); // each rank drops 3–6
    return { name, approved: Math.max(1, invites) };
  });
}

// ---- Public config (no auth) -------------------------------------------------
app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.get('/api/config', (_req, res) => {
  res.json({
    pocketOptionRefUrl: POCKETOPTION_REF_URL,
    supportHandle: SUPPORT_HANDLE,
    currencyPairs: CURRENCY_PAIRS,
    expirations: EXPIRATIONS,
    timezones: TIMEZONES,
    languages: ['English', 'हिन्दी', 'Español', 'Português', 'Русский', 'العربية'],
    accessMinBalance: ACCESS_MIN_BALANCE,
    revokeBalance: REVOKE_BALANCE,
  });
});

// ---- Public auth: email + 6-digit login code (no session required) ----------

// Step 1: request a login code. Emails it (Resend) or, in dev, logs it to the
// console. `devCode` is only returned when email isn't configured, so the local
// login screen can show it for testing — never in production.
app.post('/api/auth/request-code', async (req, res) => {
  const email = normalizeEmail(String(req.body?.email ?? ''));
  if (!isValidEmail(email)) {
    res.status(400).json({ error: 'Enter a valid email address' });
    return;
  }
  const code = createLoginCode(email);
  await sendLoginCode(email, code);
  res.json({ ok: true, ...(EMAIL_CONFIGURED ? {} : { devCode: code }) });
});

// Step 2: verify the code -> mint a session token and return the user state.
app.post('/api/auth/verify-code', (req, res) => {
  const email = normalizeEmail(String(req.body?.email ?? ''));
  const code = String(req.body?.code ?? '').trim();
  const ref = req.body?.ref ? String(req.body.ref).trim() : undefined;
  if (!isValidEmail(email)) {
    res.status(400).json({ error: 'Enter a valid email address' });
    return;
  }
  if (!verifyLoginCode(email, code)) {
    res.status(400).json({ error: 'That code is invalid or expired. Request a new one.' });
    return;
  }
  const { token, user } = loginWithEmail(email, ref);
  res.json({ token, user: buildUserState(user) });
});

// Log out: invalidate the caller's session token (safe to call without auth).
app.post('/api/auth/logout', (req, res) => {
  destroySession(tokenFromRequest(req));
  res.json({ ok: true });
});

// ---- Everything below requires a logged-in user (valid session token) -------
app.use('/api', authMiddleware);

app.get('/api/me', async (req, res) => {
  // Re-check on app open so a verified user whose balance fell below the floor
  // is downgraded (and a low-balance user who topped up gets unlocked).
  const user = await runVerification(req.user);
  res.json(buildUserState(user));
});

// Registration: submit PocketOption ID -> look it up against our affiliate now.
app.post('/api/registration/id', async (req, res) => {
  const { pocketOptionId } = req.body ?? {};
  if (!pocketOptionId || !/^\d{4,12}$/.test(String(pocketOptionId))) {
    res.status(400).json({ error: 'Enter a valid numeric PocketOption ID' });
    return;
  }
  const poId = String(pocketOptionId);

  // One PocketOption ID = one Telegram user. If another account already claimed
  // this id (verified, or mid-verification), reject this attempt as a duplicate
  // with a clear "already in use" card instead of unlocking the same account twice.
  const taken = db
    .prepare(
      `SELECT tg_id FROM users WHERE pocket_option_id = ? AND tg_id != ? AND status IN ('verified','verifying')`
    )
    .get(poId, req.user.tg_id) as { tg_id: string } | undefined;
  if (taken) {
    db.prepare(
      `UPDATE users SET status = 'rejected', verify_reject_reason = 'duplicate',
         pocket_option_id = NULL, verify_started_at = NULL
       WHERE tg_id = ?`
    ).run(req.user.tg_id);
    const rejected = db.prepare('SELECT * FROM users WHERE tg_id = ?').get(req.user.tg_id) as unknown as UserRow;
    res.json(buildUserState(rejected));
    return;
  }

  db.prepare(
    `UPDATE users SET pocket_option_id = ?, status = 'verifying', verify_started_at = ?, verify_reject_reason = NULL WHERE tg_id = ?`
  ).run(poId, Date.now(), req.user.tg_id);
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
  // Only clear the transient red cards (not-under-our-link / duplicate). The
  // low-balance cards must persist so the user keeps seeing "deposit funds".
  db.prepare(
    `UPDATE users SET status = 'unregistered', subscription = 'Not registered',
       pocket_option_id = NULL, verify_started_at = NULL, verify_reject_reason = NULL
     WHERE tg_id = ? AND status = 'rejected'
       AND (verify_reject_reason IS NULL OR verify_reject_reason IN ('not_found','duplicate'))`
  ).run(req.user.tg_id);
  const fresh = db.prepare('SELECT * FROM users WHERE tg_id = ?').get(req.user.tg_id) as unknown as UserRow;
  res.json(buildUserState(fresh));
});

// Generate a signal (verified users only)
app.post('/api/signals/generate', async (req, res) => {
  let user = db.prepare('SELECT * FROM users WHERE tg_id = ?').get(req.user.tg_id) as unknown as UserRow;
  // Re-check live balance before serving a signal; a drop below the floor
  // revokes access here so the "low balance" card shows instead of a signal.
  if (user.status === 'verified') user = await runVerification(user);
  if (user.status !== 'verified') {
    res.status(403).json({ error: 'not_verified', user: buildUserState(user) });
    return;
  }
  const { pair, expiration } = req.body ?? {};
  const usePair = CURRENCY_PAIRS.includes(pair) ? pair : CURRENCY_PAIRS[0];
  const useExp = EXPIRATIONS.includes(expiration) ? expiration : EXPIRATIONS[3];
  const direction: 'UP' | 'DOWN' = Math.random() > 0.5 ? 'UP' : 'DOWN';
  // Bias trend strength toward "strong" (70–98% band). Demo accounts (ad videos)
  // get an extra-clean ~95% strong rate; normal users get ~73% so the app still
  // feels realistic. The rest fall in a weaker 35–68% band.
  const strongChance = isDemoUser(user) ? 0.95 : 0.73;
  const trendStrength =
    Math.random() < strongChance
      ? 70 + Math.floor(Math.random() * 29) // 70–98 (strong)
      : 35 + Math.floor(Math.random() * 34); // 35–68 (weak/moderate)
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
  const invited = db
    .prepare('SELECT COUNT(*) AS c FROM referrals WHERE inviter_id = ?')
    .get(userId) as { c: number };
  const approved = db
    .prepare('SELECT COUNT(*) AS c FROM referrals WHERE inviter_id = ? AND approved = 1')
    .get(userId) as { c: number };

  // Daily leaderboard: seeded fake traders, with the real user ("You") merged in
  // by their own approved-invite count if they have any. Ranks/prizes reassigned
  // after the merge so positions and reward amounts always line up.
  const entries: { name: string; approved: number; you: boolean }[] = dailyLeaderboard(5).map(
    (e) => ({ ...e, you: false })
  );
  if (approved.c > 0) entries.push({ name: 'You', approved: approved.c, you: true });
  const leaderboard = entries
    .sort((a, b) => b.approved - a.approved)
    .slice(0, RANK_PRIZES.length)
    .map((e, i) => ({ rank: i + 1, name: e.name, approved: e.approved, prize: RANK_PRIZES[i] ?? 0, you: e.you }));

  const rank = leaderboard.find((r) => r.you)?.rank ?? null;

  const friends = db
    .prepare(
      `SELECT r.invitee_id, r.approved, r.deposit_usd, u.name
       FROM referrals r LEFT JOIN users u ON u.tg_id = r.invitee_id
       WHERE r.inviter_id = ? ORDER BY r.created_at DESC`
    )
    .all(userId) as { invitee_id: string; approved: number; deposit_usd: number; name: string | null }[];

  res.json({
    inviteLink: buildUserState(req.user).inviteLink,
    prizePool: DAILY_PRIZE_POOL,
    rankPrizes: RANK_PRIZES,
    endsAt: getEndOfDay(),
    invited: invited.c,
    approved: approved.c,
    rank,
    needForPrize: Math.max(0, 3 - approved.c),
    leaderboard,
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
        a: 'Invite friends with your link. Friends who register and deposit at least $15 count as approved. The top 5 referrers each day win balance rewards.',
      },
    ],
  });
});

function stubbedAssistantReply(message: string): string {
  const m = message.toLowerCase().trim();
  if (!m)
    return 'Hi! I am your Trades AI assistant. Ask me about pairs, timeframes, risk, deposits, or how to unlock signals. 📈';

  // If the user is asking several things at once, hand them to live support so a
  // human can help properly instead of getting one partial canned answer.
  const questionCount = (m.match(/\?/g) || []).length;
  const manyTopics = /(\band\b|,|;|also|plus).*(\?|\bhow\b|\bwhat\b|\bwhy\b|\bcan\b)/.test(m);
  if (questionCount >= 2 || (questionCount >= 1 && manyTopics)) {
    return `That's a few questions at once 🙌 For the fastest help, message our support team on Telegram at @${SUPPORT_HANDLE} — they're available 24x7 and will walk you through everything step by step. 💬`;
  }

  if (m.includes('eur') || m.includes('pair') || m.includes('asset') || m.includes('currency'))
    return 'EUR/USD-OTC is showing a strong intraday trend. On a 1–3 min expiry, wait for a pullback to the trend line before entering. OTC pairs trade 24/7, so they are great on weekends. ⚡';
  if (m.includes('time') || m.includes('expir') || m.includes('timeframe') || m.includes('minute'))
    return 'For beginners, 1–3 minute expirations are the sweet spot — long enough to ride a trend, short enough to stay disciplined. Match the expiry to your chart timeframe. ⏱️';
  if (m.includes('risk') || m.includes('manage') || m.includes('lose') || m.includes('loss'))
    return 'Risk no more than 2–5% of your balance per trade, and stop after 3 losses in a row. Consistency beats intensity. 🛡️';
  if (m.includes('martingale') || m.includes('double'))
    return 'Martingale (doubling after a loss) is high-risk and can drain an account fast. I recommend a fixed stake of 2–5% per trade instead. 🧯';
  if (m.includes('deposit') || m.includes('fund') || m.includes('add money') || m.includes('top up'))
    return 'You can deposit inside your PocketOption account (the Deposit button, top right). A balance of at least $15 unlocks signals here. Cards, e-wallets and crypto are supported. 💳';
  if (m.includes('withdraw') || m.includes('payout') || m.includes('cash out'))
    return 'Withdrawals are handled by PocketOption from the Withdrawal page in your account — usually the same method you deposited with, processed within 1–3 days. 🏦';
  if (m.includes('accuracy') || m.includes('winrate') || m.includes('accurate') || m.includes('win rate'))
    return 'Our AI reports 90%+ accuracy on strong trends. No signal is guaranteed — favor the higher trend-strength signals and manage your risk. 🎯';
  if (m.includes('unlock') || m.includes('verify') || m.includes('register') || m.includes('access'))
    return 'To unlock signals: register a PocketOption account through our link, deposit at least $15, then submit your PocketOption ID. Verification is automatic and takes a few seconds. 🔓';
  if (m.includes('refer') || m.includes('invite') || m.includes('friend'))
    return 'Share your invite link from the Referrals tab. Friends who register and deposit $15+ count as approved, and the top referrers each day win cash prizes. 🎁';
  if (m.includes('signal') || m.includes('trade') || m.includes('how') || m.includes('start'))
    return 'Pick a pair and an expiry, then tap "Get Signal". When trend strength is high and the direction is clear, take the trade before it expires. 📊';
  if (m.includes('hi') || m.includes('hello') || m.includes('hey'))
    return 'Hey! 👋 I can help with pairs, timeframes, risk, deposits, and unlocking signals. What would you like to know?';
  if (m.includes('support') || m.includes('contact') || m.includes('human') || m.includes('agent'))
    return `Our support team is on Telegram at @${SUPPORT_HANDLE}, available 24x7. They can help with your account, deposits, verification — anything at all. 💬`;
  if (m.includes('thank'))
    return 'You are welcome! 🙌 Tap "Get Signal" whenever you are ready for a live read.';

  return `Good question. Based on current market conditions I would wait for a confirmed signal before entering — tap "Get Signal" on the Signals tab for a live read. For anything more detailed, our 24x7 support team is on Telegram at @${SUPPORT_HANDLE}. 🤖`;
}

// Next UTC midnight — the daily giveaway countdown target (resets every day).
function getEndOfDay(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0);
}

// Serve the built client (production / single-service deploy). The client calls
// same-origin /api, so one HTTPS origin serves both the app and the API. In dev
// the client runs on Vite and this block is skipped (no client/dist yet).
const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (existsSync(clientDist)) {
  app.use(
    express.static(clientDist, {
      setHeaders: (res, filePath) => {
        // The service worker and manifest must not be long-cached, or PWA updates
        // won't reach already-installed users. Everything else uses Express defaults.
        if (/(?:sw\.js|manifest\.webmanifest)$/.test(filePath)) {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    })
  );
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
  console.log(`[pocketaitrades] server listening on http://localhost:${PORT}`);
  if (!EMAIL_CONFIGURED) {
    console.log(
      '[pocketaitrades] RESEND_API_KEY not set — login codes are printed to this console (dev mode).'
    );
  }
});
