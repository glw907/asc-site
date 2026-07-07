#!/usr/bin/env node
/**
 * Import script: asc-ops.email_templates -> asc-club.email_templates (read-only source,
 * idempotent target), plus one hand-authored addition for the redesigned offer flow.
 *
 * asc-ops is never altered; this only ever SELECTs from it. The write side is a
 * natural-key upsert keyed on `id` (already the same stable string on both sides, e.g.
 * `class_signup`, `payment_request`: no slug-style remapping needed, unlike
 * `ops-events.mjs`'s slug-to-id move). Re-running never creates a duplicate row, it only
 * updates a row whose mapped columns actually changed and otherwise skips it. Every
 * insert or update is audited (actor 'import:ops'); a no-op re-run still audits one
 * batch-summary row so the run itself stays observable.
 *
 * WHAT PORTS UNCHANGED: every ops template body is already plain markdown with
 * `{{variable}}` placeholders (`shared/template.js`'s own `renderTemplate`, a bare
 * `String.replace` with no conditional syntax of its own -- ops's "conditional sections"
 * like `{{fee_section}}`/`{{description_section}}` are ordinary variables, precomputed as
 * an empty string or a filled one by the CALLING code, `ops/src/services/email.js`, never
 * evaluated inside the template text itself). There is no Resend-specific markup to strip:
 * ops rendered these same strings to HTML via a small local `markdownToHtml` and sent them
 * through the Resend API purely as the message body, exactly the shape asc-club's own
 * `email_templates.body` column wants. See `ops-email-templates.README.md` for the full
 * variable vocabulary, template by template, since none of that context survives the
 * column copy alone.
 *
 * WHAT DOES NOT PORT: `reply_to` on the ops side is a literal committee address (never a
 * variable), carried over as-is. `updated_by` is NULL on most ops rows (no admin has ever
 * hand-edited them there); asc-club's own `email_templates.updated_by` is `NOT NULL`
 * (migration 0007), so a null source value becomes the same `'import:ops'` actor this
 * script already audits writes under, not a guess at a real person.
 *
 * ONE TEMPLATE THIS SCRIPT AUTHORS, NOT PORTS: `class_offer`, the redesigned time-limited
 * waitlist offer's own notification (`offers.ts`'s `offerSpot`). Ops has no equivalent:
 * its `class_approval` template announces open registration to everyone via a
 * `registration_url` (the whole MW-backed flow the design suite's no-port ruling retires),
 * not a single-use claim link to one specific waitlisted person. Seeded here, not in a
 * migration, because it belongs in the same table alongside its ported siblings and the
 * same idempotent upsert already handles "does this row need to change" for it too.
 *
 * Usage: node scripts/import/ops-email-templates.mjs [--dry-run]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DRY_RUN = process.argv.includes('--dry-run');

/** The mapped column order for asc-club's `email_templates` table. */
const COLUMNS = ['id', 'subject', 'reply_to', 'body', 'updated_by'];

/** The one template ops has no equivalent of (this file's own header explains why): seeded
 *  through the same upsert as every ported row, so a re-run's change-detection handles it
 *  identically once it exists. */
const CLASS_OFFER_TEMPLATE = {
  id: 'class_offer',
  subject: 'A spot is open -- {{item_display_name}}',
  reply_to: 'program-committee@aksailingclub.org',
  body: `Hi {{person_name}},

**Good news** -- a spot has opened up in **{{item_display_name}}**!

**Claim it here:** {{claim_url}}

This link is good for one use and expires **{{expires_at}}**. If it expires before you claim it, we'll offer the spot to the next person on the waitlist.

If you have questions, reply to this email or contact {{committee_email}}.

---
Alaska Sailing Club
aksailingclub.org`,
  updated_by: 'authored:pass-2-2',
};

function d1Binding(toml, bindingName) {
  const re = new RegExp(
    `\\[\\[d1_databases\\]\\]\\s*\\nbinding = "${bindingName}"\\s*\\ndatabase_name = "([^"]+)"\\s*\\ndatabase_id = "([^"]+)"`,
  );
  const m = toml.match(re);
  if (!m) throw new Error(`ops-email-templates: could not find d1_databases binding ${bindingName} in wrangler.toml`);
  return { name: m[1], id: m[2] };
}

/** Runs one or more `;`-joined SQL statements against a named D1 database via wrangler,
 *  returning the parsed per-statement result array (`--json` gives clean stdout, no banner
 *  text to strip). */
function execStatements(dbName, sql) {
  const stdout = execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', dbName, '--remote', '--command', sql, '--json'],
    { cwd: ROOT_DIR, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  );
  return JSON.parse(stdout);
}

/** A SQL literal for a value already known to be a string, number, or null; never used on
 *  raw user input, only on values already read back from D1 itself or this script's own
 *  hand-authored constant above. */
function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

function toTemplateRow(src) {
  return {
    id: src.id,
    subject: src.subject,
    reply_to: src.reply_to ?? null,
    body: src.body,
    updated_by: src.updated_by ?? 'import:ops',
    sourceId: src.id,
  };
}

function changedColumns(existing, incoming) {
  if (!existing) return COLUMNS;
  return COLUMNS.filter((col) => String(existing[col] ?? '') !== String(incoming[col] ?? ''));
}

function main() {
  const toml = readFileSync(path.join(ROOT_DIR, 'wrangler.toml'), 'utf8');
  const opsDb = d1Binding(toml, 'EVENTS_DB');
  const clubDb = d1Binding(toml, 'CLUB_DB');

  const [opsResult] = execStatements(opsDb.name, 'SELECT id, subject, reply_to, body, updated_by FROM email_templates ORDER BY id');
  const sourceRows = [...opsResult.results.map(toTemplateRow), toTemplateRow(CLASS_OFFER_TEMPLATE)];

  const [clubResult] = execStatements(clubDb.name, 'SELECT * FROM email_templates');
  const existingById = new Map(clubResult.results.map((row) => [row.id, row]));

  const batchId = `ops-email-templates-${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
  const statements = [];
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  for (const row of sourceRows) {
    const existing = existingById.get(row.id);
    const diff = changedColumns(existing, row);
    const actor = row.id === CLASS_OFFER_TEMPLATE.id ? 'authored:pass-2-2' : 'import:ops';
    const source = row.id === CLASS_OFFER_TEMPLATE.id ? 'authored for the redesigned offer flow, no ops equivalent' : `source=asc-ops.email_templates.id=${row.sourceId}`;

    if (!existing) {
      const cols = [...COLUMNS];
      const vals = cols.map((c) => sqlLiteral(row[c]));
      statements.push(`INSERT INTO email_templates (${cols.join(', ')}) VALUES (${vals.join(', ')});`);
      statements.push(
        `INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES ` +
          `(${sqlLiteral(actor)}, 'import.insert', 'email_template', ${sqlLiteral(row.id)}, ` +
          `${sqlLiteral(`import_batch=${batchId}; ${source}`)});`,
      );
      inserted += 1;
    } else if (diff.length > 0) {
      const sets = diff.map((c) => `${c} = ${sqlLiteral(row[c])}`).concat(`updated_at = datetime('now')`).join(', ');
      statements.push(`UPDATE email_templates SET ${sets} WHERE id = ${sqlLiteral(row.id)};`);
      statements.push(
        `INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES ` +
          `(${sqlLiteral(actor)}, 'import.update', 'email_template', ${sqlLiteral(row.id)}, ` +
          `${sqlLiteral(`import_batch=${batchId}; ${source}; changed=${diff.join(',')}`)});`,
      );
      updated += 1;
    } else {
      unchanged += 1;
    }
  }

  statements.push(
    `INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES ` +
      `('import:ops', 'import.batch', 'email_template', NULL, ` +
      `${sqlLiteral(`import_batch=${batchId}; source_count=${sourceRows.length}; inserted=${inserted}; updated=${updated}; unchanged=${unchanged}`)});`,
  );

  const sql = statements.join('\n');
  console.log(
    `ops-email-templates: batch ${batchId}, ${sourceRows.length} source rows (${opsResult.results.length} from ops, 1 authored), ` +
      `${inserted} to insert, ${updated} to update, ${unchanged} unchanged`,
  );

  if (DRY_RUN) {
    console.log('--dry-run: planned SQL follows, nothing executed\n');
    console.log(sql);
    return;
  }

  execStatements(clubDb.name, sql);
  console.log(`ops-email-templates: applied to ${clubDb.name}`);
}

main();
