import { describe, it, expect } from 'vitest';
import { buildEventOrder, buildEventsPage, toEventCard, type EventDetailRow } from '$theme/events-data';
import type { MediaRef } from '@glw907/cairn-cms/media';

const CURRENT_YEAR = 2026;

const NO_IMAGE = (_ref: MediaRef) => undefined;
const IDENTITY_MARKDOWN = async (md: string) => `<p>${md}</p>`;

function row(overrides: Partial<EventDetailRow>): EventDetailRow {
  return {
    id: 'an-event-id',
    title: 'An event',
    slug: 'an-event',
    event_type: 'racing',
    start_date: null,
    start_time: null,
    end_date: null,
    end_time: null,
    date_history: null,
    location: null,
    short_description: null,
    long_description: null,
    hero_image: null,
    hero_image_alt: null,
    registration_url: null,
    registration_status: null,
    fee: null,
    ...overrides,
  };
}

describe('buildEventsPage', () => {
  it('pulls a governance row out of its month bucket entirely, regardless of date', async () => {
    const data = await buildEventsPage(
      [row({ title: 'June Meeting', slug: 'june-meeting', event_type: 'governance', start_date: '2026-06-10' })],
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
          event_type: 'racing',
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

  it('carries a class row\'s registrationUrl straight through: the signup route is computed upstream by the CLUB_DB query, not this pure function', async () => {
    const data = await buildEventsPage(
      [
        row({
          title: 'Intro Class',
          slug: 'intro-class',
          event_type: 'class',
          start_date: '2026-06-18',
          registration_url: '/classes/abc123/signup',
        }),
      ],
      { currentYear: CURRENT_YEAR, resolveMedia: NO_IMAGE, renderMarkdown: IDENTITY_MARKDOWN },
    );
    expect(data.monthSections[0].events[0].registrationUrl).toBe('/classes/abc123/signup');
  });

  it('only lists a TOC link for a section that actually has events, in order', async () => {
    const data = await buildEventsPage(
      [
        row({ title: 'July event', slug: 'july-event', start_date: '2026-07-10' }),
        row({ title: 'BNAC', slug: 'bnac', start_date: '2026-10-09' }),
        row({ title: 'Meeting', slug: 'meeting', event_type: 'governance', start_date: '2026-11-14' }),
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

  it("routes a class on its own id, not its (season-scoped, non-unique) slug", async () => {
    const data = await buildEventsPage(
      [
        row({ title: 'Adult Intro', slug: 'adult-intro', id: 'class-row-id', event_type: 'class', start_date: '2026-06-01' }),
        row({ title: 'BNAC', slug: 'bnac', id: 'event-row-id', event_type: 'racing', start_date: '2026-10-09' }),
      ],
      { currentYear: CURRENT_YEAR, resolveMedia: NO_IMAGE, renderMarkdown: IDENTITY_MARKDOWN },
    );
    expect(data.monthSections[0].events[0].routeId).toBe('class-row-id');
    expect(data.offSeason[0].routeId).toBe('bnac');
  });

  it('formats start_time/end_time into a friendly 12-hour range, omitted when absent', async () => {
    const withRange = await buildEventsPage(
      [row({ title: 'A', slug: 'a', start_date: '2026-06-01', start_time: '09:00', end_time: '13:30' })],
      { currentYear: CURRENT_YEAR, resolveMedia: NO_IMAGE, renderMarkdown: IDENTITY_MARKDOWN },
    );
    expect(withRange.monthSections[0].events[0].timeDisplay).toBe('9:00 AM–1:30 PM');

    const noTime = await buildEventsPage([row({ title: 'B', slug: 'b', start_date: '2026-06-02' })], {
      currentYear: CURRENT_YEAR,
      resolveMedia: NO_IMAGE,
      renderMarkdown: IDENTITY_MARKDOWN,
    });
    expect(noTime.monthSections[0].events[0].timeDisplay).toBeUndefined();
  });

  it("carries a class's fee, never a plain event's (which has no fee column)", async () => {
    const data = await buildEventsPage(
      [
        row({ title: 'Class', slug: 'a-class', event_type: 'class', start_date: '2026-06-01', fee: 100 }),
        row({ title: 'Regatta', slug: 'a-regatta', event_type: 'racing', start_date: '2026-06-02' }),
      ],
      { currentYear: CURRENT_YEAR, resolveMedia: NO_IMAGE, renderMarkdown: IDENTITY_MARKDOWN },
    );
    const [classCard, regattaCard] = data.monthSections[0].events;
    expect(classCard.fee).toBe(100);
    expect(regattaCard.fee).toBeUndefined();
  });

  it('summarizes short_description verbatim when it fits, and truncates at a word boundary otherwise', async () => {
    const short = await buildEventsPage(
      [row({ title: 'A', slug: 'a', start_date: '2026-06-01', short_description: 'Bring gloves.' })],
      { currentYear: CURRENT_YEAR, resolveMedia: NO_IMAGE, renderMarkdown: IDENTITY_MARKDOWN },
    );
    expect(short.monthSections[0].events[0].summary).toBe('Bring gloves.');

    const long = await buildEventsPage(
      [
        row({
          title: 'B',
          slug: 'b',
          start_date: '2026-06-02',
          short_description:
            'This is a deliberately long lede sentence meant to exceed the ninety character truncation boundary by a fair margin.',
        }),
      ],
      { currentYear: CURRENT_YEAR, resolveMedia: NO_IMAGE, renderMarkdown: IDENTITY_MARKDOWN },
    );
    const summary = long.monthSections[0].events[0].summary as string;
    expect(summary.length).toBeLessThanOrEqual(91); // 90 chars plus the ellipsis
    expect(summary.endsWith('…')).toBe(true);
    expect(summary.endsWith(' …')).toBe(false); // no dangling space before the ellipsis
  });

  it("falls back to a stripped-markdown pass over long_description when there is no short_description (a class row)", async () => {
    const data = await buildEventsPage(
      [
        row({
          title: 'Intro Class',
          slug: 'intro-class',
          event_type: 'class',
          start_date: '2026-06-01',
          long_description: '## Bring your own **gear**\n\nSee [the list](https://example.com) for details.',
        }),
      ],
      { currentYear: CURRENT_YEAR, resolveMedia: NO_IMAGE, renderMarkdown: IDENTITY_MARKDOWN },
    );
    expect(data.monthSections[0].events[0].summary).toBe('Bring your own gear See the list for details.');
  });
});

describe('toEventCard', () => {
  it('is the same enrichment buildEventsPage runs per row, exported for a single-row read', async () => {
    const card = await toEventCard(
      row({ title: 'BNAC', slug: 'bnac', start_date: '2026-10-09' }),
      CURRENT_YEAR,
      NO_IMAGE,
      IDENTITY_MARKDOWN,
    );
    expect(card.title).toBe('BNAC');
    expect(card.routeId).toBe('bnac');
  });
});

describe('buildEventOrder', () => {
  it('orders every row chronologically by its own effective date', () => {
    const order = buildEventOrder(
      [
        row({ title: 'July', slug: 'july', id: 'july-id', start_date: '2026-07-10' }),
        row({ title: 'May', slug: 'may', id: 'may-id', start_date: '2026-05-10' }),
        row({ title: 'June', slug: 'june', id: 'june-id', start_date: '2026-06-10' }),
      ],
      CURRENT_YEAR,
    );
    expect(order.map((o) => o.title)).toEqual(['May', 'June', 'July']);
    expect(order[0].routeId).toBe('may');
  });

  it('routes a class entry on its id and sorts a genuinely undated row last', () => {
    const order = buildEventOrder(
      [
        row({ title: 'TBD', slug: 'tbd', id: 'tbd-id', event_type: 'class' }),
        row({ title: 'Dated Class', slug: 'dated-class', id: 'dated-class-id', event_type: 'class', start_date: '2026-06-01' }),
      ],
      CURRENT_YEAR,
    );
    expect(order.map((o) => o.title)).toEqual(['Dated Class', 'TBD']);
    expect(order[0].routeId).toBe('dated-class-id');
  });
});
