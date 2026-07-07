import { describe, it, expect } from 'vitest';
import { buildEventsPage, type EventDetailRow } from '$theme/events-data';
import type { MediaRef } from '@glw907/cairn-cms/media';

const CURRENT_YEAR = 2026;

const NO_IMAGE = (_ref: MediaRef) => undefined;
const IDENTITY_MARKDOWN = async (md: string) => `<p>${md}</p>`;

function row(overrides: Partial<EventDetailRow>): EventDetailRow {
  return {
    title: 'An event',
    slug: 'an-event',
    event_type: 'regatta',
    start_date: null,
    end_date: null,
    date_history: null,
    location: null,
    short_description: null,
    long_description: null,
    hero_image: null,
    hero_image_alt: null,
    registration_url: null,
    registration_status: null,
    ...overrides,
  };
}

describe('buildEventsPage', () => {
  it('pulls a meeting out of its month bucket entirely, regardless of date', async () => {
    const data = await buildEventsPage(
      [row({ title: 'June Meeting', slug: 'june-meeting', event_type: 'meeting', start_date: '2026-06-10' })],
      { currentYear: CURRENT_YEAR, resolveMedia: NO_IMAGE, renderMarkdown: IDENTITY_MARKDOWN },
    );
    expect(data.monthSections).toEqual([]);
    expect(data.meetings).toHaveLength(1);
    expect(data.meetings[0].title).toBe('June Meeting');
  });

  it('groups a real month into its own section and orders sections chronologically', async () => {
    const data = await buildEventsPage(
      [
        row({ title: 'July event', slug: 'july-event', start_date: '2026-07-10' }),
        row({ title: 'May event', slug: 'may-event', start_date: '2026-05-10' }),
      ],
      { currentYear: CURRENT_YEAR, resolveMedia: NO_IMAGE, renderMarkdown: IDENTITY_MARKDOWN },
    );
    expect(data.monthSections.map((s) => s.label)).toEqual(['May', 'July']);
  });

  it('buckets an out-of-season row into Off-Season, sorted chronologically', async () => {
    const data = await buildEventsPage(
      [
        row({ title: 'BNAC', slug: 'bnac', start_date: '2026-10-09' }),
        row({ title: 'End of Season', slug: 'eos', start_date: '2026-11-07' }),
      ],
      { currentYear: CURRENT_YEAR, resolveMedia: NO_IMAGE, renderMarkdown: IDENTITY_MARKDOWN },
    );
    expect(data.offSeason.map((e) => e.title)).toEqual(['BNAC', 'End of Season']);
  });

  it('only ever badges a registration status on a class row, never a plain event', async () => {
    const data = await buildEventsPage(
      [
        row({
          title: 'Intro Class',
          slug: 'intro-class',
          event_type: 'class',
          start_date: '2026-06-18',
          registration_status: 'closed',
        }),
        row({
          title: 'A Regatta With A Link',
          slug: 'a-regatta',
          event_type: 'regatta',
          start_date: '2026-06-19',
          registration_url: 'https://example.com',
        }),
      ],
      { currentYear: CURRENT_YEAR, resolveMedia: NO_IMAGE, renderMarkdown: IDENTITY_MARKDOWN },
    );
    const [intro, regatta] = data.monthSections[0].events;
    expect(intro.registrationStatusLabel).toBe('Closed (Waitlist Open)');
    expect(intro.registrationStatusKind).toBe('error');
    expect(regatta.registrationStatusLabel).toBeUndefined();
    expect(regatta.registrationUrl).toBe('https://example.com');
  });

  it('only lists a TOC link for a section that actually has events, in order', async () => {
    const data = await buildEventsPage(
      [
        row({ title: 'July event', slug: 'july-event', start_date: '2026-07-10' }),
        row({ title: 'BNAC', slug: 'bnac', start_date: '2026-10-09' }),
        row({ title: 'Meeting', slug: 'meeting', event_type: 'meeting', start_date: '2026-11-14' }),
      ],
      { currentYear: CURRENT_YEAR, resolveMedia: NO_IMAGE, renderMarkdown: IDENTITY_MARKDOWN },
    );
    expect(data.tocLinks).toEqual([
      { href: '#section-july', label: 'Jul' },
      { href: '#section-off-season', label: 'Off-Season' },
      { href: '#section-meetings', label: 'Meetings' },
    ]);
  });

  it('resolves a real photo when the resolver has one, and falls back to none when it does not', async () => {
    const withPhoto = await buildEventsPage(
      [row({ title: 'BNAC', slug: 'bnac', start_date: '2026-10-09', hero_image: 'bnac.jpg', hero_image_alt: 'Racing' })],
      {
        currentYear: CURRENT_YEAR,
        resolveMedia: () => '/media/bnac.29d75df78f196b2e.jpg',
        renderMarkdown: IDENTITY_MARKDOWN,
      },
    );
    expect(withPhoto.offSeason[0].image).toEqual({ url: '/media/bnac.29d75df78f196b2e.jpg', alt: 'Racing' });

    const withoutPhoto = await buildEventsPage(
      [row({ title: 'BNAC', slug: 'bnac', start_date: '2026-10-09', hero_image: 'unmigrated.jpg' })],
      { currentYear: CURRENT_YEAR, resolveMedia: NO_IMAGE, renderMarkdown: IDENTITY_MARKDOWN },
    );
    expect(withoutPhoto.offSeason[0].image).toBeUndefined();
  });

  it('renders long_description through the injected markdown renderer only when present', async () => {
    const data = await buildEventsPage(
      [
        row({ title: 'With', slug: 'with', start_date: '2026-06-01', long_description: 'Bring gloves.' }),
        row({ title: 'Without', slug: 'without', start_date: '2026-06-02' }),
      ],
      { currentYear: CURRENT_YEAR, resolveMedia: NO_IMAGE, renderMarkdown: IDENTITY_MARKDOWN },
    );
    const [withCard, withoutCard] = data.monthSections[0].events;
    expect(withCard.longDescriptionHtml).toBe('<p>Bring gloves.</p>');
    expect(withoutCard.longDescriptionHtml).toBeUndefined();
  });

  it('flags isEmpty only when every bucket is empty', async () => {
    const empty = await buildEventsPage([], {
      currentYear: CURRENT_YEAR,
      resolveMedia: NO_IMAGE,
      renderMarkdown: IDENTITY_MARKDOWN,
    });
    expect(empty.isEmpty).toBe(true);
    expect(empty.tocLinks).toEqual([]);

    const notEmpty = await buildEventsPage([row({ title: 'X', slug: 'x', start_date: '2026-06-01' })], {
      currentYear: CURRENT_YEAR,
      resolveMedia: NO_IMAGE,
      renderMarkdown: IDENTITY_MARKDOWN,
    });
    expect(notEmpty.isEmpty).toBe(false);
  });
});
