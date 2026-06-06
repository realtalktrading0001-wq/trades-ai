import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { db, type UserRow } from './db.js';
import { customAlphabet } from 'nanoid';

const refId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 8);

const BOT_TOKEN = process.env.BOT_TOKEN ?? '';

interface TgUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}

/**
 * Validate Telegram WebApp initData using the documented HMAC scheme.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
function validateInitData(initData: string): { user: TgUser; startParam?: string } | null {
  if (!initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const computed = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  if (computed !== hash) return null;

  const userRaw = params.get('user');
  if (!userRaw) return null;
  return {
    user: JSON.parse(userRaw) as TgUser,
    startParam: params.get('start_param') ?? undefined,
  };
}

function displayName(u: TgUser): string {
  return [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || `User ${u.id}`;
}

/** Insert the user (and a stats row) if they do not exist yet. */
function ensureUser(tgId: string, name: string, startParam?: string): UserRow {
  let row = db.prepare('SELECT * FROM users WHERE tg_id = ?').get(tgId) as UserRow | undefined;
  if (!row) {
    const code = refId();
    let referredBy: string | null = null;
    if (startParam?.startsWith('ref_')) {
      const inviterCode = startParam.slice(4);
      const inviter = db.prepare('SELECT tg_id FROM users WHERE ref_code = ?').get(inviterCode) as
        | { tg_id: string }
        | undefined;
      if (inviter && inviter.tg_id !== tgId) {
        referredBy = inviter.tg_id;
      }
    }
    db.prepare(
      `INSERT INTO users (tg_id, name, ref_code, referred_by, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(tgId, name, code, referredBy, Date.now());
    db.prepare('INSERT INTO stats (user_id) VALUES (?)').run(tgId);
    if (referredBy) {
      db.prepare(
        `INSERT INTO referrals (inviter_id, invitee_id, created_at) VALUES (?, ?, ?)`
      ).run(referredBy, tgId, Date.now());
    }
    row = db.prepare('SELECT * FROM users WHERE tg_id = ?').get(tgId) as unknown as UserRow;
  }
  return row;
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
 * Express middleware. Reads initData from the `x-telegram-init-data` header.
 * In dev (no BOT_TOKEN configured) we accept a mock user so the app runs locally.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const initData = (req.header('x-telegram-init-data') as string) ?? '';

  if (!BOT_TOKEN) {
    // Dev mode: trust an optional mock header, otherwise use a fixed demo user.
    const mockId = (req.header('x-mock-user-id') as string) || 'dev-user-1';
    const startParam = (req.header('x-mock-start-param') as string) || undefined;
    req.user = ensureUser(mockId, 'Dev User', startParam);
    next();
    return;
  }

  const valid = validateInitData(initData);
  if (!valid) {
    res.status(401).json({ error: 'Invalid Telegram initData' });
    return;
  }
  req.user = ensureUser(String(valid.user.id), displayName(valid.user), valid.startParam);
  next();
}
