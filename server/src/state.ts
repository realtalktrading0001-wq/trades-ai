import { db, type UserRow, type StatsRow } from './db.js';
import { verifyPocketOptionId, PO_CONFIGURED, MIN_DEPOSIT_USD } from './pocketoption.js';

const BOT_USERNAME = process.env.BOT_USERNAME ?? 'tradesaipocketbot';

// Per-user throttle so polling doesn't hammer the PocketOption API.
const lastCheck = new Map<string, number>();
const CHECK_INTERVAL_MS = 3000;

function markVerified(user: UserRow, depositAmount: number): UserRow {
  db.prepare(`UPDATE users SET status = 'verified', subscription = 'Active' WHERE tg_id = ?`).run(
    user.tg_id
  );
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

  // Definitive "not under our affiliate". Give a short grace window first so a
  // brand-new registration that hasn't propagated yet isn't falsely rejected,
  // then move to 'rejected' (the UI then tells them to register via our link).
  if (result.notFound && user.verify_started_at) {
    const graceMs = (Number(process.env.VERIFY_REJECT_SECONDS) || 8) * 1000;
    if (Date.now() - user.verify_started_at >= graceMs) {
      db.prepare(`UPDATE users SET status = 'rejected' WHERE tg_id = ?`).run(user.tg_id);
      return db.prepare('SELECT * FROM users WHERE tg_id = ?').get(user.tg_id) as unknown as UserRow;
    }
  }
  return user; // still within grace / transient error — stays "verifying"
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
