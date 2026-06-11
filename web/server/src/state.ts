import { db, type UserRow, type StatsRow } from './db.js';
import { verifyPocketOptionId, PO_CONFIGURED, MIN_DEPOSIT_USD } from './pocketoption.js';

// Public website URL used to build referral invite links (e.g. https://pocketaitrades.com/?ref=abc123).
const WEB_URL = (process.env.WEB_URL ?? 'https://pocketaitrades.com').replace(/\/+$/, '');

// Live-balance access gate (registered under our link is necessary but not
// sufficient): need >= ACCESS_MIN_BALANCE to UNLOCK, and access is removed only
// once balance falls below REVOKE_BALANCE (the gap stops on/off flapping).
export const ACCESS_MIN_BALANCE = Number(process.env.ACCESS_MIN_BALANCE_USD) || 15;
export const REVOKE_BALANCE = Number(process.env.REVOKE_BALANCE_USD) || 5;

// Per-user throttle so polling doesn't hammer the PocketOption API. Verified
// users are re-checked less often (we're only watching for a balance drop).
const lastCheck = new Map<string, number>();
const CHECK_INTERVAL_MS = 3000;
const VERIFIED_RECHECK_MS = 30000;

type RejectReason = 'not_found' | 'duplicate' | 'low_balance' | 'balance_dropped';

/** Move a user to 'rejected' with a reason (and clear any active subscription). */
function setRejected(tgId: string, reason: RejectReason): UserRow {
  db.prepare(
    `UPDATE users SET status = 'rejected', subscription = 'Not registered', verify_reject_reason = ? WHERE tg_id = ?`
  ).run(reason, tgId);
  return db.prepare('SELECT * FROM users WHERE tg_id = ?').get(tgId) as unknown as UserRow;
}

/** Is this PocketOption id already *verified* on a different Telegram user? */
function idVerifiedByAnother(pocketOptionId: string, tgId: string): boolean {
  const row = db
    .prepare(
      `SELECT tg_id FROM users WHERE pocket_option_id = ? AND tg_id != ? AND status = 'verified'`
    )
    .get(pocketOptionId, tgId) as { tg_id: string } | undefined;
  return !!row;
}

function markVerified(user: UserRow, depositAmount: number): UserRow {
  // One PocketOption ID = one Telegram user. If another account already verified
  // with this id (race past the submit-time check), reject this one as a duplicate
  // instead of unlocking signals on the same broker account twice.
  if (user.pocket_option_id && idVerifiedByAnother(user.pocket_option_id, user.tg_id)) {
    return setRejected(user.tg_id, 'duplicate');
  }
  db.prepare(
    `UPDATE users SET status = 'verified', subscription = 'Active', verify_reject_reason = NULL WHERE tg_id = ?`
  ).run(user.tg_id);
  // If this user was referred, credit the inviter (approved once they deposit enough).
  if (user.referred_by) {
    const approved = depositAmount >= MIN_DEPOSIT_USD ? 1 : 0;
    db.prepare(`UPDATE referrals SET approved = ?, deposit_usd = ? WHERE invitee_id = ?`).run(
      approved,
      depositAmount,
      user.tg_id
    );
  }
  return db.prepare('SELECT * FROM users WHERE tg_id = ?').get(user.tg_id) as unknown as UserRow;
}

/** Dev/local fallback when no PocketOption API credentials are configured. */
function simulateVerify(user: UserRow): UserRow {
  if (user.status !== 'verifying' || !user.verify_started_at) return user;
  const delayMs = (Number(process.env.VERIFY_DELAY_SECONDS) || 6) * 1000;
  if (Date.now() - user.verify_started_at >= delayMs) return markVerified(user, 0);
  return user;
}

/**
 * Real verification + balance gating. The single seam for access:
 *  - Not yet verified: registered under us AND balance >= ACCESS_MIN_BALANCE -> verified.
 *    Registered but balance too low -> 'low_balance' (the green "deposit funds" card).
 *    Not registered (after a grace window) -> 'not_found'.
 *  - Already verified: re-checked (less often); balance below REVOKE_BALANCE -> 'balance_dropped'.
 * Called from the registration/status/signal endpoints.
 */
export async function runVerification(user: UserRow): Promise<UserRow> {
  if (!user.pocket_option_id) return user;
  if (!PO_CONFIGURED) return simulateVerify(user);

  const isVerified = user.status === 'verified';
  const now = Date.now();
  const interval = isVerified ? VERIFIED_RECHECK_MS : CHECK_INTERVAL_MS;
  if (now - (lastCheck.get(user.tg_id) ?? 0) < interval) return user;
  lastCheck.set(user.tg_id, now);

  const result = await verifyPocketOptionId(user.pocket_option_id);

  if (result.registered) {
    if (isVerified) {
      // Keep access until the balance is *confirmed* below the revoke floor.
      if (result.hasBalance && result.balance < REVOKE_BALANCE) {
        return setRejected(user.tg_id, 'balance_dropped');
      }
      return user;
    }
    // Not verified yet: only unlock when funds are confirmed at/above the minimum.
    if (result.hasBalance && result.balance >= ACCESS_MIN_BALANCE) {
      return markVerified(user, result.depositAmount);
    }
    // Registered under us, but not enough live balance to unlock yet.
    return setRejected(user.tg_id, 'low_balance');
  }

  // From here the id isn't registered under our affiliate. Never revoke an
  // already-verified user on a non-registered/transient reading (could be an API
  // hiccup) — balance-based revoke above is the only way they lose access.
  if (isVerified) return user;

  const startedAt = user.verify_started_at ?? 0;

  // Definitive "not under our affiliate". Give a short grace window first so a
  // brand-new registration that hasn't propagated yet isn't falsely rejected.
  if (result.notFound && startedAt) {
    const graceMs = (Number(process.env.VERIFY_REJECT_SECONDS) || 8) * 1000;
    if (Date.now() - startedAt >= graceMs) return setRejected(user.tg_id, 'not_found');
    return user; // still within grace
  }

  // Safety net: never leave a user stuck on "Verifying…" forever.
  const timeoutMs = (Number(process.env.VERIFY_TIMEOUT_SECONDS) || 30) * 1000;
  if (startedAt && Date.now() - startedAt >= timeoutMs) return setRejected(user.tg_id, 'not_found');

  return user; // transient error within the cap — stays "verifying"
}

export function buildUserState(userRow: UserRow) {
  const stats = db.prepare('SELECT * FROM stats WHERE user_id = ?').get(userRow.tg_id) as unknown as
    | StatsRow
    | undefined;
  return {
    id: userRow.tg_id,
    name: userRow.name,
    email: userRow.email ?? null,
    pocketOptionId: userRow.pocket_option_id,
    status: userRow.status,
    rejectReason: userRow.verify_reject_reason ?? null,
    subscription: userRow.subscription,
    timezone: userRow.timezone,
    language: userRow.language,
    refCode: userRow.ref_code,
    // Web invite link — the `?ref=` code is read on signup to credit the inviter.
    inviteLink: `${WEB_URL}/?ref=${userRow.ref_code}`,
    stats: {
      total: stats?.total ?? 0,
      taken: stats?.taken ?? 0,
      skipped: stats?.skipped ?? 0,
    },
  };
}
