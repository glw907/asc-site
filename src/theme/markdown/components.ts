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
    tone: fields.select({ label: 'Tone', required: true, options: ['note', 'tip', 'warning'] }),
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

// ─── MembershipWorks: the club's registration widget, embedded as-is (Task 4) ─
// The engine's sanitize floor runs before component dispatch (see the render pipeline's own
// header comment), so a component's build() output, unlike raw markdown HTML, is never stripped
// of a script element: this is the sanctioned seam for a trusted third-party embed a page
// genuinely needs, not a loophole. `open` is MembershipWorks's own `data-ini` panel key (e.g.
// `"!event-list"` for the class-registration list); `data-org` is the club's fixed account id.
function buildMembershipWorks(ctx: ComponentContext): Element {
  const open = strAttr(ctx, 'open') ?? '';
  return h('div', { className: ['mw-embed'] }, [
    h('script', { src: 'https://cdn.membershipworks.com/mfm.js' }),
    h('div', {
      id: 'SFctr',
      className: ['SF'],
      'data-org': '32205',
      'data-ini': open,
      'data-scl': '0',
      'data-sfi': '1',
    }),
  ]);
}

const membershipworks = defineComponent({
  name: 'membershipworks',
  label: 'MembershipWorks embed',
  description: "The club's MembershipWorks widget, embedded exactly as the live site does (a known constraint: it is not stylable).",
  use: 'Hand a registration or account flow to MembershipWorks.',
  build: buildMembershipWorks,
  attributes: {
    open: fields.text({
      label: 'Panel',
      required: true,
      pattern: '^!?[a-zA-Z0-9_-]+$',
      help: 'The MembershipWorks data-ini panel key, e.g. "join" or "!event-list".',
    }),
  },
  group: 'Page structure',
  icon: 'graduation-cap',
  preview: { attributes: { open: '!event-list' } },
});

export const ascRegistry = defineRegistry({ components: [callout, passage, cards, card, membershipworks] });
