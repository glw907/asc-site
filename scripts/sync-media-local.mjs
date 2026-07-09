#!/usr/bin/env node
// Seeds the LOCAL R2 simulator with every media-library object, so `npm run dev` serves real
// photos and a design iteration never needs a deploy to be judged. Downloads each object from
// the deployed dev site (Access service token required in the environment) and writes it into
// wrangler's local state via `wrangler r2 object put --local`, under the same content-addressed
// key the media route reads (`media/<hash[0:2]>/<hash>.<ext>`, cairn's r2Key naming). Re-running
// is idempotent: existing keys are overwritten with identical bytes. One-time per checkout, or
// after new media lands in src/content/.cairn/media.json.
//
// Usage: source ~/.local/secrets && node scripts/sync-media-local.mjs
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
// Plain-file mirror for the vite dev /media fallback (vite.config.ts): the local R2 seed below
// is unreachable under `vite dev` until the engine's onlyIf-Headers bug is fixed upstream, so
// the dev server serves these files directly instead.
const DEV_MEDIA = join(ROOT, '.dev-media');
mkdirSync(DEV_MEDIA, { recursive: true });
const BASE = 'https://dev.aksailingclub.org';
const id = process.env.ASC_ACCESS_CLIENT_ID;
const secret = process.env.ASC_ACCESS_CLIENT_SECRET;
if (!id || !secret) {
  console.error('sync-media-local: ASC_ACCESS_CLIENT_ID/SECRET missing; source ~/.local/secrets first.');
  process.exit(1);
}
const headers = { 'CF-Access-Client-Id': id, 'CF-Access-Client-Secret': secret };

const manifest = JSON.parse(readFileSync(join(ROOT, 'src/content/.cairn/media.json'), 'utf8'));
const items = Array.isArray(manifest) ? manifest : Object.values(manifest);
const dir = mkdtempSync(join(tmpdir(), 'asc-media-'));
let ok = 0;
let failed = 0;

for (const item of items) {
  const { slug, hash, ext } = item;
  if (!slug || !hash || !ext) continue;
  const url = `${BASE}/media/${slug}.${hash}.${ext}`;
  const key = `media/${hash.slice(0, 2)}/${hash}.${ext}`;
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const file = join(dir, `${hash}.${ext}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    writeFileSync(file, bytes);
    writeFileSync(join(DEV_MEDIA, `${slug}.${hash}.${ext}`), bytes);
    execFileSync(
      'npx',
      ['wrangler', 'r2', 'object', 'put', `asc-site-media/${key}`, '--file', file, '--local'],
      { cwd: ROOT, stdio: 'pipe' },
    );
    ok++;
    console.log(`synced ${slug} -> ${key}`);
  } catch (err) {
    failed++;
    console.error(`FAILED ${slug}: ${err.message}`);
  }
}
rmSync(dir, { recursive: true, force: true });
console.log(`sync-media-local: ${ok} synced, ${failed} failed, of ${items.length} manifest entries`);
process.exit(failed > 0 ? 1 : 0);
