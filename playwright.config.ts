import { defineConfig } from '@playwright/test';

export default defineConfig({
  // CI's renderer produces run-to-run anti-aliasing jitter of a few dozen pixels; baselines are
  // CI-canonical (regenerate on the runner, not a workstation), and this allowance sits two orders
  // of magnitude below any real layout change. Mirrors the showcase's own site-visual.spec.ts.
  expect: { toHaveScreenshot: { maxDiffPixels: 120 } },
  testDir: 'e2e',
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  // wrangler dev, not vite preview: the Season section and /events read the CLUB_DB D1 binding
  // at request time (repointed from EVENTS_DB by pass 2.1's Task 9), and vite preview carries no
  // Cloudflare platform bindings at all (platform is undefined there), which would always render
  // an empty calendar. The seed step loads fixture rows into the gitignored local D1 replica
  // (never the real asc-club data the admin screens and import scripts own; see
  // e2e/fixtures/events-seed.sql's header), then wrangler dev serves the real build with local
  // bindings so the Season/events templates render their full, real shape.
  webServer: {
    command:
      'npx wrangler d1 execute asc-club --local --file=e2e/fixtures/events-seed.sql && npm run build && npx wrangler dev --port 4173 --local',
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  use: { baseURL: 'http://localhost:4173' },
});
