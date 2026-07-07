import { describe, expect, it, vi } from 'vitest';
import type { AdminActionAuditRecord } from '@glw907/cairn-cms/sveltekit';
import { createClubAuditSink } from '$admin-club/lib/audit-sink';
import { fakeD1 } from './_fake-d1';

const RECORD: AdminActionAuditRecord = {
  action: 'update',
  entity: 'class',
  entityId: 'fleet-tune-up-weekend',
  detail: 'no change',
  editor: 'owner@example.com',
};

describe('createClubAuditSink', () => {
  it('inserts one row into audit_log with the record mapped to its columns', async () => {
    const { db, calls } = fakeD1();
    const sink = createClubAuditSink(db);
    sink(RECORD);
    // The insert is fire-and-forget (a promise the sink does not await), so give its own
    // microtask a turn before asserting the call landed.
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain('INSERT INTO audit_log');
    expect(calls[0].args).toEqual(['owner@example.com', 'update', 'class', 'fleet-tune-up-weekend', 'no change']);
  });

  it('maps a missing entityId/detail to null, never undefined', async () => {
    const { db, calls } = fakeD1();
    const sink = createClubAuditSink(db);
    sink({ action: 'create', entity: 'class', editor: 'owner@example.com' });
    await Promise.resolve();
    await Promise.resolve();
    expect(calls[0].args).toEqual(['owner@example.com', 'create', 'class', null, null]);
  });

  it('logs, but never throws, when the insert itself rejects', async () => {
    const failing = {
      prepare: () => ({
        bind: () => ({
          run: () => Promise.reject(new Error('D1 unavailable')),
        }),
      }),
    };
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const sink = createClubAuditSink(failing as unknown as Parameters<typeof createClubAuditSink>[0]);
    expect(() => sink(RECORD)).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    expect(errorSpy).toHaveBeenCalledWith('admin/club: audit_log insert failed', expect.any(Error));
    errorSpy.mockRestore();
  });
});
