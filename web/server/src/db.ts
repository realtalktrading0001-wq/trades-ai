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

  -- Web auth: short-lived email login codes (one row per email, replaced on resend).
  CREATE TABLE IF NOT EXISTS login_codes (
    email       TEXT PRIMARY KEY,
    code        TEXT NOT NULL,
    expires_at  INTEGER NOT NULL,
    attempts    INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL
  );

  -- Web auth: opaque session tokens (sent as a Bearer token by the client).
  CREATE TABLE IF NOT EXISTS sessions (
    token       TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
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

// Migration: web users are keyed by email (the mini app keyed them by Telegram id).
// The `tg_id` column is reused as the opaque internal user id on the web build.
try {
  db.exec(`ALTER TABLE users ADD COLUMN email TEXT`);
} catch {
  /* column already present */
}
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL`);

export interface UserRow {
  tg_id: string; // opaque internal user id (web users get a generated `web_…` id)
  name: string | null;
  email: string | null;
  pocket_option_id: string | null;
  status: 'unregistered' | 'verifying' | 'verified' | 'rejected';
  subscription: string;
  timezone: string;
  language: string;
  ref_code: string;
  referred_by: string | null;
  verify_started_at: number | null;
  verify_reject_reason: 'not_found' | 'duplicate' | null;
  created_at: number;
}

export interface StatsRow {
  user_id: string;
  total: number;
  taken: number;
  skipped: number;
}
