// ASC's component registry. `callout` reuses cairn's own showcase build function verbatim (same
// class names: `.callout`/`.callout-title`/`.callout-body`/`.callout-points`), which the copied
// `prose.css` already styles, so it renders correctly with zero new CSS (the
// reuse-Waymark's-own-shape lesson from the ecxc-ski rebuild). `passage` and the `cards`/`card`
// pair have no Waymark equivalent and are this site's own components (Task 2's content-migration
// findings #1 and the icon-headed prose block): `passage` is a titled prose block with no card
// chrome (an icon-headed heading followed by a paragraph, the shape the migrated content already
// used); `cards`/`card` is the one flexible card-grid family that answers both the migrated
// `.cta-list` (a whole-card link, `href` present) and `.card-grid.icon-cards` (a static feature
// card, `href` absent) shapes from the old Hugo site, closest in spirit to the ecxc-ski `week`/
// `day` and `programs`/`program` nested-composite pattern. Both get their own styling in
// `asc-components.css`.
import { h } from 'hastscript';
import type { Element, ElementContent } from 'hast';
import { defineRegistry, defineComponent, fields } from '@glw907/cairn-cms';
import { headRow, isElement, strAttr, type ComponentContext } from '@glw907/cairn-cms/render';
import { makeIconRenderer } from '$chassis/render.js';
import { ICON_PATHS } from './icons.js';

// The chassis wires the icon set into the render helpers; this theme owns only the glyph data
// (ICON_PATHS) and where each build() function calls makeIcon.
const makeIcon = makeIconRenderer(ICON_PATHS);

// A path attribute a card can point at: an in-page anchor, a site path, a cairn: reference, or a
// full URL. fields.url's validator only accepts an absolute http(s) URL (URL_RE in fieldset.ts),
// which cannot express an internal link like `/join/` or `/issues-and-support/?category=general
// #report-an-issue`, both of which the migrated content needs from this same attribute.
const LINK_PATTERN = '^(#|/|cairn:|https?://)';
const LINK_HELP = 'Use an anchor (#id), a path (/page), a cairn: link, or a full URL.';

// ─── Callout: cairn's own showcase shape, unchanged ─────────────────────────
const callout = defineComponent({
  name: 'callout',
  label: 'Callout',
  description: 'A highlighted note with an optional icon.',
  use: 'Draw the reader to one important idea.',
  group: 'Callouts',
  icon: 'compass',
  build: (ctx) =>
    h('aside', { className: ['callout', `callout-${String(ctx.attributes.tone ?? 'note')}`] }, [
      h('p', { className: ['callout-title'] }, ctx.slot('title')),
      h('div', { className: ['callout-body'] }, ctx.slot('body')),
      h('ul', { className: ['callout-points'] }, ctx.items('points').map((item) => h('li', item))),
    ]),
  attributes: {
    // 'interim' (the design-polish pass, 2026-07-07): a quiet, deliberately unremarkable tone for
    // a "not built yet" placeholder notice, so a page with real content around it doesn't read as
    // broken. The note/tip/warning tones are all right for a callout competing with plain prose;
    // an interim notice is not competing for the reader's attention, it is apologizing for a gap.
    tone: fields.select({ label: 'Tone', required: true, options: ['note', 'tip', 'warning', 'interim'] }),
    icon: fields.icon({ label: 'Icon' }),
  },
  slots: [
    { name: 'title', label: 'Title', kind: 'inline', required: true },
    { name: 'body', label: 'Body', kind: 'markdown' },
    { name: 'points', label: 'Points', kind: 'repeatable', itemFields: { text: fields.text({ label: 'Item' }) } },
  ],
  preview: {
    attributes: { tone: 'note' },
    slots: { title: 'What we ask', body: 'Intro sentence.', points: ['First point', 'Second point'] },
  },
});

// ─── Passage: a titled prose block, no card chrome (site-declared) ──────────
function buildPassage(ctx: ComponentContext): Element {
  const icon = strAttr(ctx, 'icon');
  const iconEl = icon ? makeIcon(icon) : undefined;
  return h('section', { className: ['asc-passage'] }, [
    headRow(ctx.slot('title'), iconEl, 3),
    h('div', { className: ['asc-passage-body'] }, ctx.slot('body')),
  ]);
}

const passage = defineComponent({
  name: 'passage',
  label: 'Passage',
  description: 'A titled block of prose, with no card chrome.',
  use: 'Give a stretch of prose its own heading without boxing it in a card.',
  build: buildPassage,
  attributes: {
    icon: fields.icon({ label: 'Icon' }),
  },
  slots: [
    { name: 'title', label: 'Title', kind: 'inline', required: true },
    { name: 'body', label: 'Body', kind: 'markdown' },
  ],
  group: 'Page structure',
  icon: 'compass',
  preview: { attributes: { icon: 'compass' }, slots: { title: 'Big Lake, Alaska', body: 'Body copy.' } },
});

// ─── Cards / card: a flexible link-or-feature card grid (site-declared) ─────
function hasClass(node: ElementContent, cls: string): boolean {
  return isElement(node) && Array.isArray(node.properties?.className) && node.properties.className.includes(cls);
}

function buildCard(ctx: ComponentContext): Element {
  const icon = strAttr(ctx, 'icon');
  const href = strAttr(ctx, 'href');
  const kids: ElementContent[] = [];
  if (icon) kids.push(h('span', { className: ['asc-card-icon'] }, [makeIcon(icon)]));
  kids.push(h('span', { className: ['asc-card-title'] }, ctx.slot('title')));
  const head = h('div', { className: ['asc-card-head'] }, kids);
  const body = h('div', { className: ['asc-card-body'] }, ctx.slot('body'));
  if (href) {
    return h('a', { className: ['asc-card', 'asc-card-link'], href }, [
      head,
      body,
      h('span', { className: ['asc-card-arrow'] }, [makeIcon('arrow-right')]),
    ]);
  }
  return h('div', { className: ['asc-card'] }, [head, body]);
}

const card = defineComponent({
  name: 'card',
  label: 'Card',
  description: 'One card in a card grid: a whole-card link if it carries an href, a static feature card otherwise.',
  use: 'One entry inside a :::cards grid (used nested).',
  insertTemplate: ':::card[Title]{icon="compass" href="/page/"}\nShort description.\n:::',
  build: buildCard,
  attributes: {
    icon: fields.icon({ label: 'Icon' }),
    href: fields.text({ label: 'Link (optional)', pattern: LINK_PATTERN, help: LINK_HELP }),
  },
  slots: [
    { name: 'title', label: 'Title', kind: 'inline', required: true },
    { name: 'body', label: 'Description', kind: 'markdown' },
  ],
  group: 'Page structure',
  icon: 'grid-nine',
  hidden: true,
});

const cards = defineComponent({
  name: 'cards',
  label: 'Card grid',
  description: 'A row of side-by-side cards (nested :::card blocks).',
  use: 'List a handful of related destinations or features together.',
  insertTemplate: '::::cards\n:::card[Title]{icon="compass" href="/page/"}\nShort description.\n:::\n::::',
  build: (ctx) => h('div', { className: ['asc-cards'] }, ctx.slot('body').filter((c) => hasClass(c, 'asc-card'))),
  slots: [{ name: 'body', label: 'Cards', kind: 'markdown' }],
  group: 'Page structure',
  icon: 'grid-nine',
});

// ─── Contact / donate forms: hydrated islands (completion-pass manifest item 2) ─
// Both are content-authored placements with no attributes: build() emits only the no-JavaScript
// fallback (a plain mailto link), and the live, interactive form (ContactForm.svelte,
// DonateForm.svelte) mounts over it once the island runtime hydrates (see cairn.config.ts's
// `rendering.islands`). A reader with JavaScript disabled never sees an empty loading state,
// only this fallback, permanently.
const contactForm = defineComponent({
  name: 'contact-form',
  label: 'Contact form',
  description: "The routed contact form (name, email, phone, category, message), live-mounted over a mailto fallback.",
  use: 'Let a reader send a message that routes to the right volunteer committee.',
  insertTemplate: ':::contact-form\n:::',
  hydrate: true,
  build: () =>
    h('p', { className: ['contact-form-fallback'] }, [
      'Email ',
      h('a', { href: 'mailto:board@aksailingclub.org' }, ['board@aksailingclub.org']),
      " and we'll route your message to the right volunteer committee.",
    ]),
  group: 'Page structure',
  icon: 'envelope-simple',
});

const donateForm = defineComponent({
  name: 'donate-form',
  label: 'Donate form',
  description: 'The preset/custom donation amount form, live-mounted over a mailto fallback.',
  use: 'Let a reader make a one-time donation.',
  insertTemplate: ':::donate-form\n:::',
  hydrate: true,
  build: () =>
    h('p', { className: ['donate-form-fallback'] }, [
      'Email ',
      h('a', { href: 'mailto:board@aksailingclub.org' }, ['board@aksailingclub.org']),
      " and we'll help you make a gift.",
    ]),
  group: 'Page structure',
  icon: 'heart',
});

// ─── Class schedule: the live season schedule, a hydrated island (2026-07-13) ─
// Same island shape as the forms above: build() emits only the no-JavaScript fallback (a
// pointer to the events page, the sentence this placement replaced in education.md), and
// ClassSchedule.svelte mounts over it with the live rows (class-schedule.remote.ts).
const classSchedule = defineComponent({
  name: 'class-schedule',
  label: 'Class schedule',
  description: 'The live class schedule: dates, lifecycle status, and signup links per class, read from the club database.',
  use: "Show the season's classes with live registration status.",
  insertTemplate: ':::class-schedule\n:::',
  hydrate: true,
  build: () =>
    h('p', { className: ['class-schedule-fallback'] }, [
      'Class dates, openings, and sign-up links live on the ',
      h('a', { href: '/events/' }, ['events page']),
      '.',
    ]),
  group: 'Page structure',
  icon: 'graduation-cap',
});

// ─── Membership pricing: an inline, settings-driven dollar figure (Task 3) ──
// Same island shape as class-schedule above: build() emits only the no-JavaScript fallback (a
// link to the live join door, since no dollar figure is safe to hard-code here), and
// MembershipPricing.svelte replaces it with the live settings price once mounted
// (membership-pricing.remote.ts). Renders inline (an anchor, not a block element) so it drops
// into a sentence the same way the migrated `.cta-list` links do.
const membershipPricing = defineComponent({
  name: 'membership-pricing',
  label: 'Membership price',
  description: "One membership tier's live settings price, inline in a sentence.",
  use: 'Replace a hand-typed dollar figure with the real, settings-driven tier price.',
  insertTemplate: ':::membership-pricing{tier="individual"}:::',
  hydrate: true,
  build: (ctx) => {
    const tier = strAttr(ctx, 'tier') ?? 'individual';
    return h('a', { className: ['membership-pricing-fallback'], href: '/join/apply' }, [`current ${tier} pricing`]);
  },
  attributes: {
    tier: fields.select({ label: 'Tier', required: true, options: ['individual', 'family', 'young-adult'] }),
  },
  group: 'Page structure',
  icon: 'graduation-cap',
  preview: { attributes: { tier: 'individual' } },
});

export const ascRegistry = defineRegistry({
  components: [callout, passage, cards, card, contactForm, donateForm, classSchedule, membershipPricing],
});
