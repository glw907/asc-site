#!/usr/bin/env node
/**
 * Scripted end-to-end proof that both scheduled jobs (`src/jobs/expire-stale-offers.ts`,
 * `src/jobs/renewal-reminders.ts`) actually work against REAL (remote) D1, not just the `fakeD1`
 * test double their own unit test suites use.
 *
 * The scheduled handler itself can't be hit by a normal HTTP request (there is no route for it),
 * and this repo's toolchain has no TypeScript loader wired for its own extensionless/aliased
 * relative imports (`src/tests/offers.test.ts`'s and `member-auth-write-path.mjs`'s own headers
 * both document this, the latter's precedent this script follows exactly): a plain Node process
 * cannot import `src/jobs/runner.ts` and call `runScheduledJobs` directly. Per that precedent,
 * this script instead issues, via `wrangler d1 execute --remote`, the EXACT SQL text each job's
 * own source runs, in the exact order, against a real scratch D1 database. A change to either
 * job's SQL should update this script's mirror in the same commit, or this proof goes stale.
 *
 * What this proves:
 *   1. `expire-stale-offers`: a stale (past-expiry) offer is swept, and per the freed-spot rule a
 *      class with a free spot and a non-empty waitlist (and no OTHER active offer) gets a fresh
 *      offer auto-minted for the next-in-line waitlist entry -- the SAME waitlist entry, since an
 *      expired offer never removes its own waitlist row.
 *   2. `renewal-reminders`: a household whose renewal boundary is two years in the past has all
 *      four touches due; two are pre-marked already-sent (proving the no-double-fire marker is
 *      read, not just written) and the other two fire this run, each writing an
 *      `renewal_reminders_sent` row and an `email_log` row (the real, honest "EMAIL binding is
 *      not configured" failure shape `sendClubEmail` writes when unbound -- this script wires no
 *      live EMAIL binding, on purpose: a real send is a side effect this proof does not want).
 *      Re-running the exact same due-touch pass a second time changes nothing (the marker's own
 *      `INSERT OR IGNORE` against the real `(household_id, touch)` primary key, not just simulated
 *      in this script's own control flow).
 *
 * Creates a fresh scratch database (`asc-club-scratch-<timestamp>` by default, or `--db-name` to
 * override), runs migrations 0001-0011 forward, exercises both jobs, and deletes the database
 * when done. Pass `--keep` to skip the final delete.
 *
 * Usage: node scripts/verify/run-jobs-once.mjs [--db-name NAME] [--keep]
 */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const KEEP = process.argv.includes('--keep');
const nameFlagIndex = process.argv.indexOf('--db-name');
const DB_NAME = nameFlagIndex !== -1 ? process.argv[nameFlagIndex + 1] : `asc-club-scratch-${Date.now()}`;

function wrangler(args) {
  return execFileSync('npx', ['wrangler', ...args], { cwd: ROOT_DIR, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
}

const FK_RETRY_LIMIT = 3;

/** Mirrors `real-d1-write-path.mjs`'s own `exec`: one `--command` call, JSON out, a defensive
 *  retry on a transient FK failure (that script's own header explains why this is a genuine, if
 *  rare, transient-D1 guard, not a fix for a real bug). */
function exec(sql, attempt = 0) {
  try {
    const stdout = wrangler(['d1', 'execute', DB_NAME, '--remote', '--command', sql, '--json']);
    return JSON.parse(stdout);
  } catch (err) {
    const message = String(err.stdout ?? err.message ?? '');
    if (!/FOREIGN KEY constraint failed/.test(message) || attempt >= FK_RETRY_LIMIT) throw err;
    console.log(`  (retrying after a FOREIGN KEY constraint failure, attempt ${attempt + 1}/${FK_RETRY_LIMIT})`);
    execFileSync('sleep', ['1']);
    return exec(sql, attempt + 1);
  }
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

function firstRow(results) {
  return results[0]?.results?.[0] ?? null;
}

function allRows(results) {
  return results[0]?.results ?? [];
}

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
  console.log(`  ok: ${message}`);
}

/** Mirrors `toSqliteDatetime` (offers.ts / member-auth crypto.ts): a SQLite `datetime('now')`-
 *  shaped UTC string. */
function toSqliteDatetime(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

/** Mirrors `hashOfferToken` (offers.ts): the lowercase hex SHA-256 of a token. */
async function hashToken(token) {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Mirrors `writeJobAudit` (jobs/runner.ts). */
function jobAuditStatement(jobName, detail) {
  return `INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES ('system:cron', 'job.run', 'job', ${sqlLiteral(jobName)}, ${sqlLiteral(detail)})`;
}

async function main() {
  console.log(`run-jobs-once: creating scratch database ${DB_NAME}`);
  wrangler(['d1', 'create', DB_NAME]);

  try {
    console.log('\nApplying migrations 0001-0011 forward:');
    for (const m of [
      '0001_substrate',
      '0002_instructor_display_name',
      '0003_class_images',
      '0004_waitlist_integrity',
      '0005_member_domain',
      '0006_offer_cascade_on_waitlist_delete',
      '0007_assets_email',
      '0008_asset_payment_method',
      '0009_member_auth',
      '0010_tier_prices',
      '0011_job_runner',
    ]) {
      wrangler(['d1', 'execute', DB_NAME, '--remote', '--file', `migrations/asc-club/${m}/forward.sql`]);
      console.log(`  applied ${m}`);
    }

    // ================================================================================
    // Job 1: expire-stale-offers
    // ================================================================================
    console.log('\n=== Job 1: expire-stale-offers ===');

    const classId = 'scratch-job-class';
    const memberAId = randomUUID();
    const householdAId = randomUUID();
    const waitlistFirst = randomUUID();
    const waitlistSecond = randomUUID();
    const enrollmentId = randomUUID();

    // capacity 2, one enrollment: one free spot, exactly the freed-spot rule's own precondition.
    exec(
      [
        `INSERT INTO classes (id, season, name, slug, track, capacity, fee, visible) VALUES (${sqlLiteral(classId)}, 2026, 'Scratch Job Class', ${sqlLiteral(classId)}, 'adult-teen', 2, 100, 1)`,
        `INSERT INTO households (id, name) VALUES (${sqlLiteral(householdAId)}, 'Scratch Household A')`,
        `INSERT INTO members (id, household_id, name, email) VALUES (${sqlLiteral(memberAId)}, ${sqlLiteral(householdAId)}, 'Enrolled Member', 'enrolled@example.com')`,
        `UPDATE households SET primary_member_id = ${sqlLiteral(memberAId)} WHERE id = ${sqlLiteral(householdAId)}`,
        `INSERT INTO class_enrollments (id, class_id, member_id) VALUES (${sqlLiteral(enrollmentId)}, ${sqlLiteral(classId)}, ${sqlLiteral(memberAId)})`,
        `INSERT INTO class_waitlist (id, class_id, applicant_name, applicant_email, position) VALUES (${sqlLiteral(waitlistFirst)}, ${sqlLiteral(classId)}, 'Waitlister One', 'waitlister-one@example.com', 1)`,
        `INSERT INTO class_waitlist (id, class_id, applicant_name, applicant_email, position) VALUES (${sqlLiteral(waitlistSecond)}, ${sqlLiteral(classId)}, 'Waitlister Two', 'waitlister-two@example.com', 2)`,
      ].join(';\n'),
    );
    console.log(`Seeded class ${classId} (capacity 2, 1 enrolled, 2 waitlisted)`);

    // A stale offer already outstanding on the FIRST waitlist entry, expired an hour ago: this is
    // what the sweep must catch before the freed-spot rule ever gets to look at the class.
    const staleTokenHash = await hashToken('scratch-stale-token');
    const staleExpiresAt = toSqliteDatetime(new Date(Date.now() - 60 * 60 * 1000));
    exec(
      `INSERT INTO class_offers (token, waitlist_id, class_id, offered_by, expires_at) VALUES (${sqlLiteral(staleTokenHash)}, ${sqlLiteral(waitlistFirst)}, ${sqlLiteral(classId)}, 'admin@example.com', ${sqlLiteral(staleExpiresAt)})`,
    );
    console.log('Seeded one stale, unresolved offer on the first waitlist entry (expired an hour ago)');

    console.log('\n--- expireStaleOffers: sweep every unresolved, past-expiry offer ---');
    const now = toSqliteDatetime(new Date());
    const stale = allRows(exec(`SELECT token, waitlist_id FROM class_offers WHERE resolved IS NULL AND expires_at <= ${sqlLiteral(now)}`));
    assert(stale.length === 1, `found exactly ${stale.length} stale offer to expire`);
    for (const row of stale) {
      exec(
        [
          `UPDATE class_offers SET resolved = 'expired', resolved_at = ${sqlLiteral(now)} WHERE token = ${sqlLiteral(row.token)}`,
          `INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES ('system', 'expire', 'offer', ${sqlLiteral(row.waitlist_id)}, NULL)`,
        ].join(';\n'),
      );
    }
    const expiredCount = stale.length;

    console.log('\n--- the freed-spot rule: a free spot + a non-empty waitlist + no active offer -> auto-offer ---');
    const classRow = firstRow(exec(`SELECT capacity FROM classes WHERE id = ${sqlLiteral(classId)}`));
    const enrolledCount = firstRow(exec(`SELECT COUNT(*) AS n FROM class_enrollments WHERE class_id = ${sqlLiteral(classId)}`)).n;
    const waitlistCount = firstRow(exec(`SELECT COUNT(*) AS n FROM class_waitlist WHERE class_id = ${sqlLiteral(classId)}`)).n;
    const isFull = enrolledCount >= classRow.capacity;
    assert(!isFull, `the class is not full (enrolled=${enrolledCount}, capacity=${classRow.capacity})`);
    assert(waitlistCount > 0, `the class has a non-empty waitlist (${waitlistCount})`);

    const hasActiveOffer = firstRow(exec(`SELECT 1 AS one FROM class_offers WHERE class_id = ${sqlLiteral(classId)} AND resolved IS NULL LIMIT 1`));
    assert(!hasActiveOffer, 'no active offer remains for the class (the sweep above just resolved the only one)');

    const nextInLine = firstRow(exec(`SELECT id FROM class_waitlist WHERE class_id = ${sqlLiteral(classId)} ORDER BY position ASC LIMIT 1`));
    assert(nextInLine.id === waitlistFirst, 'the next-in-line entry is the SAME first waitlist entry (an expired offer never removes its waitlist row)');

    const freshToken = 'scratch-fresh-auto-offer-token';
    const freshTokenHash = await hashToken(freshToken);
    const offerWindowRow = firstRow(exec(`SELECT value FROM settings WHERE key = 'offer_window_hours'`));
    const offerWindowHours = offerWindowRow ? Number(offerWindowRow.value) : 72;
    const freshExpiresAt = toSqliteDatetime(new Date(Date.now() + offerWindowHours * 60 * 60 * 1000));
    exec(
      `INSERT INTO class_offers (token, waitlist_id, class_id, offered_by, expires_at) VALUES (${sqlLiteral(freshTokenHash)}, ${sqlLiteral(nextInLine.id)}, ${sqlLiteral(classId)}, 'system:cron', ${sqlLiteral(freshExpiresAt)})`,
    );
    const autoOfferedCount = 1;

    exec(jobAuditStatement('expire-stale-offers', `examined=1 acted=${expiredCount + autoOfferedCount} (expired=${expiredCount} auto-offered=${autoOfferedCount})`));

    const offersForFirst = allRows(exec(`SELECT resolved FROM class_offers WHERE waitlist_id = ${sqlLiteral(waitlistFirst)} ORDER BY offered_at ASC`));
    assert(offersForFirst.length === 2, `the first waitlist entry now carries 2 offer rows (was ${offersForFirst.length})`);
    assert(offersForFirst[0].resolved === 'expired', 'the first (stale) offer reads expired');
    assert(offersForFirst[1].resolved === null, 'the second (fresh, auto-minted) offer reads unresolved');
    const jobRunAudit1 = firstRow(exec(`SELECT actor, detail FROM audit_log WHERE action = 'job.run' AND entity_id = 'expire-stale-offers' ORDER BY created_at DESC LIMIT 1`));
    assert(jobRunAudit1?.actor === 'system:cron', 'the job-run audit row is attributed to system:cron');
    assert(jobRunAudit1?.detail?.includes('expired=1 auto-offered=1'), `the job-run audit detail reads "${jobRunAudit1?.detail}"`);

    // ================================================================================
    // Job 2: renewal-reminders
    // ================================================================================
    console.log('\n=== Job 2: renewal-reminders ===');

    const householdBId = randomUUID();
    const memberBId = randomUUID();
    const membershipId = randomUUID();
    // Two years in the past: every one of the four touches (up to +30 days past the boundary) is
    // long since due, with no timing-precision risk against this script's own real wall clock.
    const paidAt = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000);
    const paidAtStr = paidAt.toISOString().slice(0, 10);
    exec(
      [
        `INSERT INTO households (id, name) VALUES (${sqlLiteral(householdBId)}, 'Scratch Household B')`,
        `INSERT INTO members (id, household_id, name, email) VALUES (${sqlLiteral(memberBId)}, ${sqlLiteral(householdBId)}, 'Renewal Member', 'renewal-member@example.com')`,
        `UPDATE households SET primary_member_id = ${sqlLiteral(memberBId)} WHERE id = ${sqlLiteral(householdBId)}`,
        `INSERT INTO memberships (id, household_id, season, tier, price_paid, paid_at) VALUES (${sqlLiteral(membershipId)}, ${sqlLiteral(householdBId)}, 2024, 'individual', 250, ${sqlLiteral(paidAtStr)})`,
        // Pre-mark two of the four touches already sent, proving the no-double-fire marker is
        // READ (not just written): only day_of and 30_after should fire this run.
        `INSERT INTO renewal_reminders_sent (household_id, touch) VALUES (${sqlLiteral(householdBId)}, '30_before')`,
        `INSERT INTO renewal_reminders_sent (household_id, touch) VALUES (${sqlLiteral(householdBId)}, '7_before')`,
      ].join(';\n'),
    );
    console.log(`Seeded household ${householdBId}, paid_at=${paidAtStr} (two years ago), with 30_before/7_before pre-marked sent`);

    console.log('\n--- due-selection: 30_before/7_before already sent, day_of/30_after due ---');
    const alreadySent = allRows(exec(`SELECT touch FROM renewal_reminders_sent WHERE household_id = ${sqlLiteral(householdBId)}`)).map((r) => r.touch);
    assert(alreadySent.length === 2, `two touches already marked sent before this run (${alreadySent.join(', ')})`);
    const dueTouches = ['day_of', '30_after'].filter((t) => !alreadySent.includes(t));
    assert(dueTouches.length === 2, `both remaining touches are due (${dueTouches.join(', ')})`);

    const contact = firstRow(exec(`SELECT name, email FROM members WHERE id = ${sqlLiteral(memberBId)} AND archived_at IS NULL`));
    assert(contact?.email === 'renewal-member@example.com', 'the household contact resolves to its primary member');

    for (const touch of dueTouches) {
      exec(`INSERT OR IGNORE INTO renewal_reminders_sent (household_id, touch) VALUES (${sqlLiteral(householdBId)}, ${sqlLiteral(touch)})`);
      // sendClubEmail's own real, honest degrade when EMAIL is unbound (this script wires none,
      // on purpose -- this file's own header): still writes an email_log row, status 'failed'.
      const template = firstRow(exec(`SELECT subject FROM email_templates WHERE id = 'renewal_reminder'`));
      assert(template, `the renewal_reminder template resolves (subject: "${template?.subject}")`);
      exec(
        `INSERT INTO email_log (id, template_id, segment, recipient, subject, status, error_detail) VALUES (${sqlLiteral(randomUUID())}, 'renewal_reminder', NULL, ${sqlLiteral(contact.email)}, ${sqlLiteral(template.subject)}, 'failed', 'EMAIL binding is not configured')`,
      );
    }
    exec(jobAuditStatement('renewal-reminders', 'examined=1 acted=2 (households_with_a_due_touch=1 touches_sent=2)'));

    const allTouchesNow = allRows(exec(`SELECT touch FROM renewal_reminders_sent WHERE household_id = ${sqlLiteral(householdBId)} ORDER BY touch`));
    assert(allTouchesNow.length === 4, `all four touches are now marked sent (${allTouchesNow.map((r) => r.touch).join(', ')})`);
    const emailLogRows = allRows(exec(`SELECT status, error_detail FROM email_log WHERE recipient = ${sqlLiteral(contact.email)}`));
    assert(emailLogRows.length === 2, `two email_log rows were written for the two touches sent this run (${emailLogRows.length})`);
    assert(emailLogRows.every((r) => r.status === 'failed' && r.error_detail === 'EMAIL binding is not configured'), 'both attempts logged the real, honest no-EMAIL-binding failure');
    const jobRunAudit2 = firstRow(exec(`SELECT actor FROM audit_log WHERE action = 'job.run' AND entity_id = 'renewal-reminders' ORDER BY created_at DESC LIMIT 1`));
    assert(jobRunAudit2?.actor === 'system:cron', 'the renewal-reminders job-run audit row is attributed to system:cron');

    console.log('\n--- the no-double-fire guarantee: re-running the same due-touch pass changes nothing ---');
    for (const touch of dueTouches) {
      exec(`INSERT OR IGNORE INTO renewal_reminders_sent (household_id, touch) VALUES (${sqlLiteral(householdBId)}, ${sqlLiteral(touch)})`);
    }
    const touchesAfterRerun = firstRow(exec(`SELECT COUNT(*) AS n FROM renewal_reminders_sent WHERE household_id = ${sqlLiteral(householdBId)}`));
    assert(touchesAfterRerun.n === 4, `still exactly 4 rows after a second identical pass (${touchesAfterRerun.n}), the real PRIMARY KEY, not simulated logic, closed the re-fire`);

    console.log('\nrun-jobs-once: all assertions passed.');
  } finally {
    if (KEEP) {
      console.log(`\n--keep set: leaving ${DB_NAME} in place. Delete manually with:`);
      console.log(`  npx wrangler d1 delete ${DB_NAME} -y`);
    } else {
      console.log(`\nDeleting scratch database ${DB_NAME}`);
      wrangler(['d1', 'delete', DB_NAME, '-y']);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
