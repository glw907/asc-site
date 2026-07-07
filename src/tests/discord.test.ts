import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildAssetRequestSubmittedNotice,
  buildClassFilledNotice,
  buildOfferSentNotice,
  buildPaymentRequestNotice,
  buildWaitlistSignupNotice,
  notifyDiscord,
} from '$admin-club/lib/discord';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('notification builders', () => {
  it('buildPaymentRequestNotice shapes the assets-channel embed', () => {
    const notification = buildPaymentRequestNotice({
      memberName: 'Jamie Rivera',
      assetTypeName: 'RV spot',
      amount: '$450.00',
      dueBy: 'July 30, 2026',
    });
    expect(notification).toEqual({
      channel: 'assets',
      eventType: 'payment_request',
      title: 'Payment request sent: RV spot',
      fields: [
        { name: 'Member', value: 'Jamie Rivera' },
        { name: 'Amount', value: '$450.00' },
        { name: 'Due by', value: 'July 30, 2026' },
      ],
    });
  });

  it('buildAssetRequestSubmittedNotice omits the Notes field when no notes were left', () => {
    const notification = buildAssetRequestSubmittedNotice({ memberName: 'Sam Lee', assetTypeName: 'Mooring' });
    expect(notification.channel).toBe('assets');
    expect(notification.eventType).toBe('asset_request');
    expect(notification.fields).toEqual([
      { name: 'Member', value: 'Sam Lee' },
      { name: 'Asset type', value: 'Mooring' },
    ]);
  });

  it('buildAssetRequestSubmittedNotice includes Notes when the member left one', () => {
    const notification = buildAssetRequestSubmittedNotice({
      memberName: 'Sam Lee',
      assetTypeName: 'Mooring',
      notes: 'Needs the shallow-draft slip.',
    });
    expect(notification.fields).toContainEqual({ name: 'Notes', value: 'Needs the shallow-draft slip.' });
  });

  it('buildWaitlistSignupNotice shapes the classes-channel embed', () => {
    const notification = buildWaitlistSignupNotice({ className: 'Youth Sailing 101', applicantName: 'Robin Fox', position: 3 });
    expect(notification).toEqual({
      channel: 'classes',
      eventType: 'waitlist_signup',
      title: 'New waitlist signup: Youth Sailing 101',
      fields: [
        { name: 'Name', value: 'Robin Fox' },
        { name: 'Position', value: '3' },
      ],
    });
  });

  it('buildOfferSentNotice shapes the classes-channel embed', () => {
    const notification = buildOfferSentNotice({ className: 'Youth Sailing 101', applicantName: 'Robin Fox', expiresAt: 'July 10, 2026' });
    expect(notification).toEqual({
      channel: 'classes',
      eventType: 'offer_sent',
      title: 'Offer sent: Youth Sailing 101',
      fields: [
        { name: 'Offered to', value: 'Robin Fox' },
        { name: 'Expires', value: 'July 10, 2026' },
      ],
    });
  });

  it('buildClassFilledNotice shapes the classes-channel embed', () => {
    const notification = buildClassFilledNotice({ className: 'Fleet Tune-Up Weekend', capacity: 10 });
    expect(notification).toEqual({
      channel: 'classes',
      eventType: 'class_filled',
      title: 'Class filled: Fleet Tune-Up Weekend',
      fields: [{ name: 'Capacity', value: '10' }],
    });
  });
});

describe('notifyDiscord', () => {
  const notification = buildWaitlistSignupNotice({ className: 'Youth Sailing 101', applicantName: 'Robin Fox', position: 3 });

  it('POSTs an embed to the channel-matched webhook URL', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal('fetch', fetchSpy);

    await notifyDiscord({ DISCORD_WEBHOOK_CLASSES: 'https://discord.com/api/webhooks/classes-channel' }, notification);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://discord.com/api/webhooks/classes-channel');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string) as { embeds: Array<{ title: string; color: number; fields: unknown[] }> };
    expect(body.embeds).toHaveLength(1);
    expect(body.embeds[0].title).toBe('New waitlist signup: Youth Sailing 101');
    expect(body.embeds[0].fields).toEqual(notification.fields);
    expect(typeof body.embeds[0].color).toBe('number');
  });

  it('reads DISCORD_WEBHOOK_ASSETS for an assets-channel notification', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal('fetch', fetchSpy);
    const assetNotification = buildPaymentRequestNotice({ memberName: 'Jamie Rivera', assetTypeName: 'RV spot', amount: '$450.00', dueBy: 'July 30, 2026' });

    await notifyDiscord({ DISCORD_WEBHOOK_ASSETS: 'https://discord.com/api/webhooks/assets-channel' }, assetNotification);

    expect(fetchSpy).toHaveBeenCalledWith('https://discord.com/api/webhooks/assets-channel', expect.anything());
  });

  it('degrades silently (no throw, no fetch) when the channel webhook secret is unbound', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await expect(notifyDiscord({}, notification)).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('never throws when the fetch itself rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    await expect(
      notifyDiscord({ DISCORD_WEBHOOK_CLASSES: 'https://discord.com/api/webhooks/classes-channel' }, notification),
    ).resolves.toBeUndefined();
  });

  it('never throws when Discord answers a non-2xx status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }));

    await expect(
      notifyDiscord({ DISCORD_WEBHOOK_CLASSES: 'https://discord.com/api/webhooks/classes-channel' }, notification),
    ).resolves.toBeUndefined();
  });
});
