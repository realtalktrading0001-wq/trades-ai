import type { Request, Response, NextFunction } from 'express';
import { db, type UserRow } from './db.js';
import { customAlphabet } from 'nanoid';

// On the web build, users authenticate with an email + a 6-digit login code
// (the mini app used signed Telegram initData). A successful code exchange mints
// an opaque session token the client sends as `Authorization: Bearer <token>`.

const refId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 8);
const newUserId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 16);
const newToken = customAlphabet(
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
  40
);

const CODE_TTL_MS = 10 * 60 * 1000; // login codes expire after 10 minutes
const MAX_ATTEMPTS = 5; // wrong-code attempts before a code is burned

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Create (or replace) the pending login code for an email and return it. */
export function createLoginCode(email: string): string {
  const code = String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
  const now = Date.now();
  db.prepare(
    `INSERT INTO login_codes (email, code, expires_at, attempts, created_at)
     VALUES (?, ?, ?, 0, ?)
     ON CONFLICT(email) DO UPDATE SET
       code = excluded.code, expires_at = excluded.expires_at,
       attempts = 0, created_at = excluded.created_at`
  ).run(email, code, now + CODE_TTL_MS, now);
  return code;
}

/** Check a submitted code. Burns the code on success or after too many tries. */
export function verifyLoginCode(email: string, code: string): boolean {
  const row = db
    .prepare('SELECT code, expires_at, attempts FROM login_codes WHERE email = ?')
    .get(email) as { code: string; expires_at: number; attempts: number } | undefined;
  if (!row) return false;
  if (Date.now() > row.expires_at || row.attempts >= MAX_ATTEMPTS) {
    db.prepare('DELETE FROM login_codes WHERE email = ?').run(email);
    return false;
  }
  if (row.code !== String(code).trim()) {
    db.prepare('UPDATE login_codes SET attempts = attempts + 1 WHERE email = ?').run(email);
    return false;
  }
  db.prepare('DELETE FROM login_codes WHERE email = ?').run(email);
  return true;
}

/** Insert the user (and a stats row) if this email is new; credit the referrer. */
function ensureUser(email: string, refCode?: string): UserRow {
  let row = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
  if (!row) {
    const id = `web_${newUserId()}`;
    const code = refId();
    let referredBy: string | null = null;
    if (refCode) {
      const inviter = db.prepare('SELECT tg_id FROM users WHERE ref_code = ?').get(refCode) as
        | { tg_id: string }
        | undefined;
      if (inviter && inviter.tg_id !== id) referredBy = inviter.tg_id;
    }
    const name = email.split('@')[0] || 'Trader';
    db.prepare(
      `INSERT INTO users (tg_id, name, email, ref_code, referred_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, name, email, code, referredBy, Date.now());
    db.prepare('INSERT INTO stats (user_id) VALUES (?)').run(id);
    if (referredBy) {
      db.prepare(
        `INSERT INTO referrals (inviter_id, invitee_id, created_at) VALUES (?, ?, ?)`
      ).run(referredBy, id, Date.now());
    }
    row = db.prepare('SELECT * FROM users WHERE tg_id = ?').get(id) as unknown as UserRow;
  }
  return row;
}

/** Mint a session token for a user. */
export function createSession(user: UserRow): string {
  const token = newToken();
  db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(
    token,
    user.tg_id,
    Date.now()
  );
  return token;
}

/** Exchange a verified email for a logged-in user + session token. */
export function loginWithEmail(email: string, refCode?: string): { token: string; user: UserRow } {
  const user = ensureUser(email, refCode);
  return { token: createSession(user), user };
}

export function tokenFromRequest(req: Request): string {
  const auth = req.header('authorization') ?? '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return (req.header('x-session-token') as string) ?? '';
}

export function destroySession(token: string): void {
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user: UserRow;
    }
  }
}

/**
 * Express middleware. Resolves the session token to a user. Returns 401 when the
 * token is missing/unknown (the client then shows the login screen).
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const token = tokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const sess = db.prepare('SELECT user_id FROM sessions WHERE token = ?').get(token) as
    | { user_id: string }
    | undefined;
  if (!sess) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const user = db.prepare('SELECT * FROM users WHERE tg_id = ?').get(sess.user_id) as unknown as
    | UserRow
    | undefined;
  if (!user) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  req.user = user;
  next();
}
