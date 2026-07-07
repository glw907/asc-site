#!/usr/bin/env node
/**
 * Wires a Cloudflare Cron Trigger `scheduled()` export into the SvelteKit build's generated
 * Worker, run after `vite build` (chained into the `build` npm script).
 *
 * WHY THIS SCRIPT EXISTS: `@sveltejs/adapter-cloudflare` has no cron-trigger feature. Its shipped
 * Worker template (`@sveltejs/adapter-cloudflare/files/worker.js`, read directly to confirm this)
 * exports only `export default { fetch }`, nothing else, and every `vite build` overwrites
 * whatever file `wrangler.toml`'s own `main` key names with a fresh copy of that same template
 * (`@sveltejs/adapter-cloudflare/index.js`: `let worker_dest = wrangler_config.main`, then
 * `builder.rimraf(worker_dest)` and a full rewrite). That second fact rules out the naive fix, a
 * hand-authored wrapper file at `main` importing the built worker and adding `scheduled` itself:
 * the adapter owns whatever path `main` names and destroys anything else already there on every
 * build, so a wrapper checked into git at that path would not survive a second `vite build`.
 *
 * This script instead runs AFTER the adapter has already written its own `_worker.js`, and
 * appends a `scheduled` property onto the SAME `worker_default` object the file's own
 * `export { worker_default as default }` statement already re-exports. That export is a live
 * binding to the variable, not a snapshot, so mutating the object's properties after the export
 * statement still reaches whatever bundles and evaluates the module (Wrangler, via esbuild, at
 * `wrangler dev`/`deploy` time -- this file is never processed by Vite itself). `import`
 * declarations are hoisted to the top of a module regardless of their source position (ECMA-262
 * ModuleDeclarationInstantiation), so appending one after other top-level statements, including
 * the adapter's own `export` line, is valid syntax that resolves before any code runs.
 *
 * Idempotent: re-running against an already-wired file is a no-op (checked via the marker
 * comment), so this script is safe to chain unconditionally into `build`.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const WORKER_PATH = path.resolve('.svelte-kit/cloudflare/_worker.js');
const MARKER = '// job-runner: scheduled() handler wired by scripts/wire-scheduled-handler.mjs';

function main() {
  if (!existsSync(WORKER_PATH)) {
    console.error(`wire-scheduled-handler: ${WORKER_PATH} does not exist -- did \`vite build\` run first?`);
    process.exitCode = 1;
    return;
  }

  const original = readFileSync(WORKER_PATH, 'utf8');
  if (original.includes(MARKER)) {
    console.log('wire-scheduled-handler: already wired, skipping.');
    return;
  }

  const appended = `${original}
${MARKER}
import { runScheduledJobs } from '../../src/jobs/runner.ts';
worker_default.scheduled = async function (controller, env, ctx) {
  ctx.waitUntil(runScheduledJobs(env));
};
`;
  writeFileSync(WORKER_PATH, appended);
  console.log(`wire-scheduled-handler: appended a scheduled() handler to ${WORKER_PATH}`);
}

main();
