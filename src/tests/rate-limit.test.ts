import { describe, expect, it, vi } from 'vitest';
import type { RateLimit } from '@cloudflare/workers-types';
import { checkRateLimit, checkRateLimitKeys, RATE_LIMIT_MESSAGE } from '$theme/rate-limit';

function fakeBinding(outcomes: Record<string, boolean>): RateLimit {
  return {
    limit: vi.fn(async ({ key }: { key: string }) => ({ success: outcomes[key] ?? true })),
  } as unknown as RateLimit;
}

describe('checkRateLimit', () => {
  it('degrades to open when the binding is absent', async () => {
    await expect(checkRateLimit(undefined, 'ip:203.0.113.5')).resolves.toBe(true);
  });

  it('passes under the limit', async () => {
    const binding = fakeBinding({ 'ip:203.0.113.5': true });
    await expect(checkRateLimit(binding, 'ip:203.0.113.5')).resolves.toBe(true);
    expect(binding.limit).toHaveBeenCalledWith({ key: 'ip:203.0.113.5' });
  });

  it('fails closed for a representative key over the limit', async () => {
    const binding = fakeBinding({ 'email:flood@example.com': false });
    await expect(checkRateLimit(binding, 'email:flood@example.com')).resolves.toBe(false);
  });
});

describe('checkRateLimitKeys', () => {
  it('degrades to open when the binding is absent, checking nothing', async () => {
    await expect(checkRateLimitKeys(undefined, ['ip:203.0.113.5', 'email:a@example.com'])).resolves.toBe(true);
  });

  it('passes when every key is under its limit', async () => {
    const binding = fakeBinding({ 'ip:203.0.113.5': true, 'email:a@example.com': true });
    await expect(checkRateLimitKeys(binding, ['ip:203.0.113.5', 'email:a@example.com'])).resolves.toBe(true);
  });

  it('fails closed the moment any key is over its limit, short-circuiting the rest', async () => {
    const binding = fakeBinding({ 'ip:203.0.113.5': true, 'email:flood@example.com': false });
    const result = await checkRateLimitKeys(binding, ['ip:203.0.113.5', 'email:flood@example.com', 'email:never-checked@example.com']);
    expect(result).toBe(false);
    expect(binding.limit).toHaveBeenCalledTimes(2);
  });

  it('answers true for an empty key list (nothing to key on)', async () => {
    const binding = fakeBinding({});
    await expect(checkRateLimitKeys(binding, [])).resolves.toBe(true);
    expect(binding.limit).not.toHaveBeenCalled();
  });
});

describe('RATE_LIMIT_MESSAGE', () => {
  it('is a plain, non-empty user-facing string', () => {
    expect(RATE_LIMIT_MESSAGE.length).toBeGreaterThan(0);
  });
});
