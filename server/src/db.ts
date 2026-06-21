import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

// Where the SQLite file lives:
//  - DATA_DIR if explicitly set, else
//  - /var/data on Render (the persistent disk mount; Render sets RENDER=true), else
//  - ./server/data for local dev.
const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir =
  process.env.DATA_DIR || (process.env.RENDER ? '/var/data' : join(__dirname, '..', 'data'));
mkdirSync(dataDir, { recursive: true });
console.log('[signal-ai] using data dir:', dataDir);

export const db = new DatabaseSync(join(dataDir, 'signalai.sqlite'));
db.exec('PRAGMA journal_mode = WAL;');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    tg_id             TEXT PRIMARY KEY,
    name              TEXT,
    pocket_option_id  TEXT,
    status            TEXT NOT NULL DEFAULT 'unregistered', -- unregistered | verifying | verified | rejected
    subscription      TEXT NOT NULL DEFAULT 'Not registered',
    timezone          TEXT NOT NULL DEFAULT 'UTC+0 (Lagos)',
    language          TEXT NOT NULL DEFAULT 'GB English',
    ref_code          TEXT UNIQUE,
    referred_by       TEXT,
    verify_started_at INTEGER,
    verify_reject_reason TEXT, -- not_found | duplicate (only set when status = 'rejected')
    created_at        INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS stats (
    user_id  TEXT PRIMARY KEY,
    total    INTEGER NOT NULL DEFAULT 0,
    taken    INTEGER NOT NULL DEFAULT 0,
    skipped  INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS referrals (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    inviter_id  TEXT NOT NULL,
    invitee_id  TEXT NOT NULL,
    approved    INTEGER NOT NULL DEFAULT 0,
    deposit_usd REAL NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS signals (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     TEXT NOT NULL,
    pair        TEXT NOT NULL,
    expiration  TEXT NOT NULL,
    direction   TEXT NOT NULL,
    confidence  INTEGER NOT NULL,
    outcome     TEXT,
    created_at  INTEGER NOT NULL
  );

  -- Meta ad click attribution: the Free landing page POSTs the ad-click ids
  -- (fbc/fbp/fbclid) and gets back a short token, passed through Telegram as
  -- ?startapp=mf_<token>. auth.ts reads it on first visit to tie fbc to the user.
  CREATE TABLE IF NOT EXISTS click_attribution (
    token       TEXT PRIMARY KEY,
    fbc         TEXT,
    fbp         TEXT,
    fbclid      TEXT,
    variant     TEXT,
    ua          TEXT,
    ip          TEXT,
    created_at  INTEGER NOT NULL
  );
`);

// Migration: why a verify was rejected ('not_found' | 'duplicate'). Wrapped in
// try/catch so upgrading an existing (production) DB doesn't fail if it exists.
try {
  db.exec(`ALTER TABLE users ADD COLUMN verify_reject_reason TEXT`);
} catch {
  /* column already present */
}

// Migration: Meta ad-click attribution copied onto the user at first visit
// (the fbc/fbp the server later replays to Meta's Conversions API on verify/deposit).
for (const col of ['attrib_fbc TEXT', 'attrib_fbp TEXT', 'attrib_source TEXT']) {
  try {
    db.exec(`ALTER TABLE users ADD COLUMN ${col}`);
  } catch {
    /* column already present */
  }
}

export interface UserRow {
  tg_id: string;
  name: string | null;
  pocket_option_id: string | null;
  status: 'unregistered' | 'verifying' | 'verified' | 'rejected';
  subscription: string;
  timezone: string;
  language: string;
  ref_code: string;
  referred_by: string | null;
  verify_started_at: number | null;
  verify_reject_reason: 'not_found' | 'duplicate' | 'low_balance' | 'balance_dropped' | null;
  attrib_fbc: string | null;
  attrib_fbp: string | null;
  attrib_source: string | null;
  created_at: number;
}

export interface ClickAttributionRow {
  token: string;
  fbc: string | null;
  fbp: string | null;
  fbclid: string | null;
  variant: string | null;
  ua: string | null;
  ip: string | null;
  created_at: number;
}

export interface StatsRow {
  user_id: string;
  total: number;
  taken: number;
  skipped: number;
}
