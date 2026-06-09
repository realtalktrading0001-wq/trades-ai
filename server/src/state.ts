import { db, type UserRow, type StatsRow } from './db.js';
import { verifyPocketOptionId, PO_CONFIGURED, MIN_DEPOSIT_USD } from './pocketoption.js';

const BOT_USERNAME = process.env.BOT_USERNAME ?? 'tradesaipocketbot';

// Per-user throttle so polling doesn't hammer the PocketOption API.
const lastCheck = new Map<string, number>();
const CHECK_INTERVAL_MS = 3000;

/** Move a user to 'rejected' with a reason, and return the fresh row. */
function rejectUser(tgId: string, reason: 'not_found' | 'duplicate'): UserRow {
  db.prepare(`UPDATE users SET status = 'rejected', verify_reject_reason = ? WHERE tg_id = ?`).run(
    reason,
    tgId
  );
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
    return rejectUser(user.tg_id, 'duplicate');
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
 * Real verification: look the submitted PocketOption ID up against our affiliate.
 * If the Partners API returns the user (registered under us), promote to verified.
 * This is the single seam for verification — called from the registration endpoints.
 */
export async function runVerification(user: UserRow): Promise<UserRow> {
  if (user.status === 'verified' || !user.pocket_option_id) return user;

  if (!PO_CONFIGURED) return simulateVerify(user);

  const now = Date.now();
  if (now - (lastCheck.get(user.tg_id) ?? 0) < CHECK_INTERVAL_MS) return user;
  lastCheck.set(user.tg_id, now);

  const result = await verifyPocketOptionId(user.pocket_option_id);
  if (result.registered) return markVerified(user, result.depositAmount);

  const startedAt = user.verify_started_at ?? 0;

  // Definitive "not under our affiliate". Give a short grace window first so a
  // brand-new registration that hasn't propagated yet isn't falsely rejected,
  // then move to 'rejected' (the UI then tells them to register via our link).
  if (result.notFound && startedAt) {
    const graceMs = (Number(process.env.VERIFY_REJECT_SECONDS) || 8) * 1000;
    if (Date.now() - startedAt >= graceMs) return rejectUser(user.tg_id, 'not_found');
    return user; // still within grace
  }

  // Safety net: never leave a user stuck on "Verifying…" forever. If the API has
  // only thrown transient/network errors past the hard cap, reject so the heads-up
  // card shows and they can retry — rather than spinning indefinitely.
  const timeoutMs = (Number(process.env.VERIFY_TIMEOUT_SECONDS) || 30) * 1000;
  if (startedAt && Date.now() - startedAt >= timeoutMs) return rejectUser(user.tg_id, 'not_found');

  return user; // transient error within the cap — stays "verifying"
}

export function buildUserState(userRow: UserRow) {
  const stats = db.prepare('SELECT * FROM stats WHERE user_id = ?').get(userRow.tg_id) as unknown as
    | StatsRow
    | undefined;
  return {
    id: userRow.tg_id,
    name: userRow.name,
    pocketOptionId: userRow.pocket_option_id,
    status: userRow.status,
    rejectReason: userRow.verify_reject_reason ?? null,
    subscription: userRow.subscription,
    timezone: userRow.timezone,
    language: userRow.language,
    refCode: userRow.ref_code,
    // `startapp` opens the Mini App directly (and passes start_param) so the
    // referral is credited; `start` would only open the bot chat.
    inviteLink: `https://t.me/${BOT_USERNAME}?startapp=ref_${userRow.ref_code}`,
    stats: {
      total: stats?.total ?? 0,
      taken: stats?.taken ?? 0,
      skipped: stats?.skipped ?? 0,
    },
  };
}
