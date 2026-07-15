// Regression for the initiative-5 review HIGH finding: hooks.server.ts must construct the
// engine's admin guard with the site's own declared role vocabulary. A bare `createAuthGuard()`
// silently falls back to cairn's DEFAULT_ROLES (owner/editor only), so a real club-admin session
// would resolve to 'none' capability and lose every engine content screen. Mocking the guard
// module and asserting its call args is cheaper and more honest than exercising `handle`
// end-to-end (which would need a full D1-backed session and a fake platform.env).
import { describe, expect, it, vi } from 'vitest';

const createAuthGuard = vi.fn(() => async ({ event, resolve }: { event: unknown; resolve: (event: unknown) => unknown }) =>
  resolve(event),
);

vi.mock('@glw907/cairn-cms/sveltekit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@glw907/cairn-cms/sveltekit')>();
  return { ...actual, createAuthGuard };
});

describe('hooks.server.ts', () => {
  // 20s, not the 5s default: this import pulls in the whole theme (cairn.config.ts's adapter,
  // markdown registry, icon set, several .svelte islands), which is slow to transform under a
  // full-suite run's contention even though it is fast in isolation.
  it(
    'constructs the admin guard with the site role vocabulary',
    async () => {
      const { roles } = await import('$theme/cairn.config.js');
      await import('../hooks.server');
      expect(createAuthGuard).toHaveBeenCalledWith({ roles });
    },
    20000,
  );
});
