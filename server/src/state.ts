import { db, type UserRow, type StatsRow } from './db.js';

const BOT_USERNAME = process.env.BOT_USERNAME ?? 'tradesaipocketbot';

/** Promote a verifying user to verified once the simulated delay has elapsed. */
export function maybeVerify(user: UserRow): UserRow {
  if (user.status !== 'verifying' || !user.verify_started_at) return user;
  const delayMs = (Number(process.env.VERIFY_DELAY_SECONDS) || 6) * 1000;
  if (Date.now() - user.verify_started_at >= delayMs) {
    db.prepare(
      `UPDATE users SET status = 'verified', subscription = 'Active' WHERE tg_id = ?`
    ).run(user.tg_id);
    return db.prepare('SELECT * FROM users WHERE tg_id = ?').get(user.tg_id) as unknown as UserRow;
  }
  return user;
}

export function buildUserState(userRow: UserRow) {
  const user = maybeVerify(userRow);
  const stats = db.prepare('SELECT * FROM stats WHERE user_id = ?').get(user.tg_id) as unknown as StatsRow;
  return {
    id: user.tg_id,
    name: user.name,
    pocketOptionId: user.pocket_option_id,
    status: user.status,
    subscription: user.subscription,
    timezone: user.timezone,
    language: user.language,
    refCode: user.ref_code,
    // `startapp` opens the Mini App directly (and passes start_param) so the
    // referral is credited; `start` would only open the bot chat.
    inviteLink: `https://t.me/${BOT_USERNAME}?startapp=ref_${user.ref_code}`,
    stats: {
      total: stats?.total ?? 0,
      taken: stats?.taken ?? 0,
      skipped: stats?.skipped ?? 0,
    },
  };
}
