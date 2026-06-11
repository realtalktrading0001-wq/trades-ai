// One-off cleanup: enforce "one PocketOption ID = one user" on existing data.
//
// For each pocket_option_id held by 2+ accounts, KEEP the oldest verified account
// (by created_at) and demote the rest back to 'unregistered' (clears their id so
// they can re-register with a fresh broker account). Any 'verifying' row sharing a
// kept id is demoted too.
//
// SAFE BY DEFAULT: prints what it WOULD do (dry-run). Pass --apply to commit.
//
// Run locally:   node server/scripts/dedupe-uids.mjs            (dry-run)
//                node server/scripts/dedupe-uids.mjs --apply     (commit)
// Run on Render (shell):  the same, with DATA_DIR/RENDER already set by the host.

import { DatabaseSync } from 'node:sqlite';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APPLY = process.argv.includes('--apply');

// Mirror db.ts: DATA_DIR > /var/data (Render) > ./server/data (local).
const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir =
  process.env.DATA_DIR || (process.env.RENDER ? '/var/data' : join(__dirname, '..', 'data'));
const dbPath = join(dataDir, 'signalai.sqlite');
console.log(`[dedupe] db: ${dbPath}  mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);

const db = new DatabaseSync(dbPath);

// pocket_option_ids claimed (verified/verifying) by more than one account.
const dupes = db
  .prepare(
    `SELECT pocket_option_id AS id, COUNT(*) AS n
       FROM users
      WHERE pocket_option_id IS NOT NULL AND status IN ('verified','verifying')
      GROUP BY pocket_option_id
      HAVING n > 1
      ORDER BY n DESC`
  )
  .all();

if (dupes.length === 0) {
  console.log('[dedupe] no duplicate PocketOption IDs found. Nothing to do. ✅');
  process.exit(0);
}

const demote = db.prepare(
  `UPDATE users SET status='unregistered', subscription='Not registered',
     pocket_option_id=NULL, verify_started_at=NULL, verify_reject_reason=NULL
   WHERE tg_id=?`
);

let demoted = 0;
for (const { id, n } of dupes) {
  // All accounts on this id, verified first, then oldest first → keep row[0].
  const rows = db
    .prepare(
      `SELECT tg_id, status, created_at FROM users
        WHERE pocket_option_id=? AND status IN ('verified','verifying')
        ORDER BY (status='verified') DESC, created_at ASC`
    )
    .all(id);
  const keep = rows[0];
  const drop = rows.slice(1);
  console.log(`\n[dedupe] id ${id} held by ${n} accounts:`);
  console.log(`   KEEP  ${keep.tg_id} (${keep.status})`);
  for (const r of drop) {
    console.log(`   DEMOTE ${r.tg_id} (${r.status}) -> unregistered`);
    if (APPLY) demote.run(r.tg_id);
    demoted++;
  }
}

console.log(
  `\n[dedupe] ${dupes.length} duplicated id(s), ${demoted} account(s) ${
    APPLY ? 'demoted ✅' : 'would be demoted (dry-run — re-run with --apply)'
  }`
);
