// ASC's component registry. `callout` reuses cairn's own showcase build function verbatim (same
// class names: `.callout`/`.callout-title`/`.callout-body`/`.callout-points`), which the copied
// `prose.css` already styles, so it renders correctly with zero new CSS (the
// reuse-Waymark's-own-shape lesson from the ecxc-ski rebuild). `passage`, the `cards`/`card` pair,
// and the `facts`/`fact` pair have no Waymark equivalent and are this site's own components (Task
// 2's content-migration findings #1 and the icon-headed prose block, and the 2026-07-15 shared-
// components review): `passage` is a titled prose block with no card chrome (an icon-headed
// heading followed by a paragraph, the shape the migrated content already used); `cards`/`card` is
// the one flexible card-grid family that answers both the migrated `.cta-list` (a whole-card link,
// `href` present) and `.card-grid.icon-cards` (a static feature card, `href` absent) shapes from
// the old Hugo site, closest in spirit to the ecxc-ski `week`/`day` and `programs`/`program`
// nested-composite pattern; `facts`/`fact` is a quiet label/value list (cost, eligibility, and
// similar at-a-glance attributes of the surrounding topic) that renders a semantic `<dl>` with no
// card chrome at all, per A1's "cards mark objects, facts describe them" reading. All three get
// their own styling in `asc-components.css`.
import { h } from 'hastscript';
import type { Element, ElementContent } from 'hast';
import { defineRegistry, defineComponent, fields } from '@glw907/cairn-cms';
import { headRow, isElement, strAttr, type ComponentContext } from '@glw907/cairn-cms/render';
import { makeIconRenderer } from '$chassis/render.js';
import { ICON_PATHS } from './icons.js';

// `related`/`ref` (a cross-reference list ending a section, not a card grid) and `page-cta`/
// `cta-action` (the sitewide closing panel, generalized off education's hand-rolled markup) are
// this site's own components too (the 2026-07-15 shared-components review). `related` shares
// `facts`'s nesting mechanic: the container filters its slot's children by class, and `ref` is
// hidden from the standalone picker. `page-cta`'s lead reuses the engine's `title` slot (the
// same `[Label]` bracket grammar every other component's title uses) so the directive stays
// consistent, even though the design spec calls it a "lead" line; its actions reuse the same
// nested-child mechanic, filtering the one `body` slot for the `cta-link` marker class that
// `cta-action` renders, so a page-cta can hold plain body prose and action buttons in the one
// markdown region.

// The chassis wires the icon set into the render helpers; this theme owns only the glyph data
// (ICON_PATHS) and where each build() function calls makeIcon.
const makeIcon = makeIconRenderer(ICON_PATHS);

// A path attribute a card can point at: an in-page anchor, a site path, a cairn: reference, or a
// full URL. fields.url's validator only accepts an absolute http(s) URL (URL_RE in fieldset.ts),
// which cannot express an internal link like `/join/` or `/issues-and-support/?category=general
// #report-an-issue`, both of which the migrated content needs from this same attribute.
const LINK_PATTERN = '^(#|/|cairn:|https?://)';
const LINK_HELP = 'Use an anchor (#id), a path (/page), a cairn: link, or a full URL.';

// ─── Callout: cairn's own showcase shape, plus a rendered icon (basic-polish batch 2) ───
// The `icon` attribute below was declared but never drawn: `ctx.attributes.icon` reached the
// hast tree as a data attribute (remarkDirectiveStamp carries every declared attribute), but
// build() never read it, so authoring `icon="anchor"` on a `requirement` callout (the field's
// own help text suggestion, above) silently rendered no glyph at all. The system-success surface
// (payment confirmation, class-registration-complete) is this bug's first real content usage, so
// it is fixed here rather than routed around: a leading inline icon in `.callout-title`, the same
// "icon rides inside the heading" idiom `card`'s title and `passage`'s headRow already use, gated
// on the attribute being set so every existing icon-less callout site-wide renders unchanged.
const callout = defineComponent({
  name: 'callout',
  label: 'Callout',
  description: 'A highlighted note with an optional icon.',
  use: 'Draw the reader to one important idea.',
  group: 'Callouts',
  icon: 'compass',
  build: (ctx) => {
    const icon = strAttr(ctx, 'icon');
    const titleKids: ElementContent[] = icon
      ? [h('span', { className: ['callout-icon'] }, [makeIcon(icon)]), ...ctx.slot('title')]
      : ctx.slot('title');
    return h('aside', { className: ['callout', `callout-${String(ctx.attributes.tone ?? 'note')}`] }, [
      h('p', { className: ['callout-title'] }, titleKids),
      h('div', { className: ['callout-body'] }, ctx.slot('body')),
      h('ul', { className: ['callout-points'] }, ctx.items('points').map((item) => h('li', item))),
    ]);
  },
  attributes: {
    // 'interim' (the design-polish pass, 2026-07-07): a quiet, deliberately unremarkable tone for
    // a "not built yet" placeholder notice, so a page with real content around it doesn't read as
    // broken. The note/tip/warning tones are all right for a callout competing with plain prose;
    // an interim notice is not competing for the reader's attention, it is apologizing for a gap.
    // 'requirement' (2026-07-15 shared-components pass): marks a prerequisite the reader must
    // already satisfy (an Active Participating Member status, a qualification checkout) before
    // the surrounding content applies. Quieter than warning (no caution ink; this is not a
    // hazard), firmer than note (a full border, not just a tinted ground). Its own CSS lives
    // theme-side in asc-components.css, not chassis prose.css, since it is an ASC-specific tone.
    // `icon="anchor"` reads well here (a prerequisite as a thing to hold fast to) but is a
    // suggestion for the author, never a hardcoded default.
    tone: fields.select({
      label: 'Tone',
      required: true,
      options: ['note', 'tip', 'warning', 'interim', 'requirement'],
    }),
    icon: fields.icon({ label: 'Icon', help: 'For the "requirement" tone, "anchor" reads well.' }),
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

// The container/child nesting mechanic shared by cards, facts, related, steps, and page-cta: a
// container keeps only the children its child component built, each identified by the marker class
// that child's build() stamps, so stray prose between the nested blocks never reaches the grid.
function nestedChildren(children: ElementContent[], markerClass: string): ElementContent[] {
  return children.filter((c) => hasClass(c, markerClass));
}

function buildCard(ctx: ComponentContext): Element {
  const icon = strAttr(ctx, 'icon');
  const href = strAttr(ctx, 'href');
  const kids: ElementContent[] = [];
  if (icon) kids.push(h('span', { className: ['asc-card-icon'] }, [makeIcon(icon)]));
  // Basic-polish batch 1 (2026-07-16): the arrow rides inline at the end of the title text, an
  // aria-hidden trailing span exactly like :::related's own arrow idiom, rather than a floating
  // block glyph stranded on its own line under the card body.
  const titleKids: ElementContent[] = [...ctx.slot('title')];
  if (href) titleKids.push(h('span', { className: ['asc-card-arrow'], ariaHidden: 'true' }, [' →']));
  kids.push(h('span', { className: ['asc-card-title'] }, titleKids));
  const head = h('div', { className: ['asc-card-head'] }, kids);
  const body = h('div', { className: ['asc-card-body'] }, ctx.slot('body'));
  if (href) {
    return h('a', { className: ['asc-card', 'asc-card-link'], href }, [head, body]);
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
  build: (ctx) => h('div', { className: ['asc-cards'] }, nestedChildren(ctx.slot('body'), 'asc-card')),
  slots: [{ name: 'body', label: 'Cards', kind: 'markdown' }],
  group: 'Page structure',
  icon: 'grid-nine',
});

// ─── Facts / fact: a quiet label/value list, no card chrome (site-declared) ─
// A `:::facts` list summarizes a handful of at-a-glance attributes of the surrounding topic (cost,
// eligibility, boat size, and similar): quiet structure inside the prose measure, not an object of
// its own, so it never earns card chrome. Each `:::fact` row builds to a `.asc-fact` wrapper `div`
// (styled `display: contents` in asc-components.css) holding a real `<dt>`/`<dd>` pair, so the
// wrapper disappears from layout and the `dt`/`dd` sit as direct children of the enclosing `<dl>`'s
// own CSS grid, while the markup still nests validly inside a `<dl>` (HTML5 groups `dt`/`dd` pairs
// inside a `div`). Same nesting mechanic as `cards`/`card`: the container filters its slot's
// children by class, and the child component is `hidden` from the standalone insert menu.
function buildFact(ctx: ComponentContext): Element {
  return h('div', { className: ['asc-fact'] }, [
    h('dt', { className: ['asc-fact-label'] }, ctx.slot('title')),
    h('dd', { className: ['asc-fact-value'] }, ctx.slot('body')),
  ]);
}

const fact = defineComponent({
  name: 'fact',
  label: 'Fact',
  description: 'One label/value row in a :::facts key-facts list.',
  use: 'One entry inside a :::facts list (used nested).',
  insertTemplate: ':::fact[Label]\nValue.\n:::',
  build: buildFact,
  slots: [
    { name: 'title', label: 'Label', kind: 'inline', required: true },
    { name: 'body', label: 'Value', kind: 'markdown' },
  ],
  group: 'Page structure',
  icon: 'list-checks',
  hidden: true,
});

const facts = defineComponent({
  name: 'facts',
  label: 'Key facts',
  description: 'A label/value list of key facts (cost, eligibility, and similar), rendered as a definition list.',
  use: 'Summarize a handful of at-a-glance facts about the surrounding topic.',
  insertTemplate: '::::facts\n:::fact[Label]\nValue.\n:::\n::::',
  build: (ctx) => h('dl', { className: ['asc-facts'] }, nestedChildren(ctx.slot('body'), 'asc-fact')),
  slots: [{ name: 'body', label: 'Facts', kind: 'markdown' }],
  group: 'Page structure',
  icon: 'list-checks',
});

// ─── Related / ref: a cross-reference list, not a card grid (site-declared) ─
// A `:::related` block ends a section by pointing to a small number of other pages: a hairline
// top rule (this is a footer-like cross-reference, never an object of its own, so it earns no
// card chrome), a fixed "Related" eyebrow, then one `:::ref` link per line. The title link is a
// plain, unclassed anchor so it inherits the site's standard prose link treatment (color,
// underline, focus ring) unscoped; the trailing arrow is an inline `aria-hidden` span appended
// inside the anchor (review round, 2026-07-15: a CSS `::after` arrow was invisible to a screen
// reader announcing the link name, so it moved into markup). Same nesting mechanic as
// `facts`/`fact`: the container filters its slot's children by class, and the child component is
// `hidden` from the standalone insert menu.
function buildRef(ctx: ComponentContext): Element {
  const href = strAttr(ctx, 'href') ?? '#';
  const note = ctx.slot('body');
  const arrow = h('span', { className: ['asc-related-arrow'], ariaHidden: 'true' }, [' →']);
  const kids: ElementContent[] = [h('a', { href }, [...ctx.slot('title'), arrow])];
  if (note.length) kids.push(h('span', { className: ['asc-related-note'] }, note));
  return h('div', { className: ['asc-related-item'] }, kids);
}

const ref = defineComponent({
  name: 'ref',
  label: 'Reference',
  description: 'One link in a :::related cross-reference list.',
  use: 'One entry inside a :::related list (used nested).',
  insertTemplate: ':::ref[Title]{href="/page/"}\nOptional one-line note.\n:::',
  build: buildRef,
  attributes: {
    href: fields.text({ label: 'Link', required: true, pattern: LINK_PATTERN, help: LINK_HELP }),
  },
  slots: [
    { name: 'title', label: 'Title', kind: 'inline', required: true },
    { name: 'body', label: 'Note (optional)', kind: 'markdown' },
  ],
  group: 'Page structure',
  icon: 'arrow-right',
  hidden: true,
});

const related = defineComponent({
  name: 'related',
  label: 'Related',
  description: 'A cross-reference list linking to a small number of other pages, not a card grid.',
  use: "End a section by pointing the reader to what's related.",
  insertTemplate: '::::related\n:::ref[Title]{href="/page/"}\nOptional one-line note.\n:::\n::::',
  build: (ctx) =>
    h('div', { className: ['asc-related'] }, [
      h('p', { className: ['asc-related-eyebrow'] }, ['Related']),
      ...nestedChildren(ctx.slot('body'), 'asc-related-item'),
    ]),
  slots: [{ name: 'body', label: 'Items', kind: 'markdown' }],
  group: 'Page structure',
  icon: 'arrow-right',
});

// ─── Page CTA / CTA action: the sitewide closing panel (site-declared) ──────
// Generalizes education's hand-rolled closer (`.page-cta`/`.page-cta-lead`/`.page-cta-body` in
// asc-components.css, unmigrated until Task 7) into a real component: a `title` slot for the lead
// line (the engine's `[Label]` bracket grammar, labeled "Lead" for the form), a markdown `body`
// slot for the reassurance copy, and any number of nested `:::cta-action` buttons filtered out of
// that same `body` slot by the `cta-link` marker class its build() renders (the actions row's own
// wrapper, never a slot of its own, matching `cards`/`card`'s one-slot nesting). A secondary
// action reuses the chassis's own `.cta-link`/`.cta-secondary` prose classes. A primary action
// carries `.asc-cta-btn` instead of the chassis `.cta-primary`: the club-grounds fireweed budget
// ("the single pop, at most twice a page") is spent only through that class, and a page-cta's one
// allowed primary action is exactly such a spend. `.cta-link` stays on both kinds because it is
// the marker class buildPageCta() filters on; asc-components.css loads after prose.css in the
// same layer, so `.asc-cta-btn`'s dress wins the collision.
function buildCtaAction(ctx: ComponentContext): Element {
  const href = strAttr(ctx, 'href') ?? '#';
  const kind = strAttr(ctx, 'kind') ?? 'secondary';
  const dress = kind === 'primary' ? 'asc-cta-btn' : 'cta-secondary';
  return h('a', { className: ['cta-link', dress], href }, ctx.slot('title'));
}

const ctaAction = defineComponent({
  name: 'cta-action',
  label: 'CTA action',
  description: 'One button in a :::page-cta actions row.',
  use: 'One entry inside a :::page-cta block (used nested).',
  insertTemplate: ':::cta-action[Label]{href="/page/" kind="secondary"}\n:::',
  build: buildCtaAction,
  attributes: {
    href: fields.text({ label: 'Link', required: true, pattern: LINK_PATTERN, help: LINK_HELP }),
    kind: fields.select({ label: 'Kind', options: ['primary', 'secondary'], default: 'secondary' }),
  },
  slots: [{ name: 'title', label: 'Label', kind: 'inline', required: true }],
  group: 'Page structure',
  icon: 'arrow-right',
  hidden: true,
});

function buildPageCta(ctx: ComponentContext): Element {
  const bodyChildren = ctx.slot('body');
  const actionEls = nestedChildren(bodyChildren, 'cta-link');
  const proseChildren = bodyChildren.filter((c) => !hasClass(c, 'cta-link'));
  const kids: ElementContent[] = [h('p', { className: ['page-cta-lead'] }, ctx.slot('title'))];
  if (proseChildren.length) kids.push(h('div', { className: ['page-cta-body'] }, proseChildren));
  if (actionEls.length) kids.push(h('div', { className: ['page-cta-actions'] }, actionEls));
  return h('div', { className: ['page-cta', 'not-prose'] }, kids);
}

const pageCta = defineComponent({
  name: 'page-cta',
  label: 'Page CTA',
  description: 'A closing panel: a lead line, optional body copy, and one or more action buttons.',
  use: "End a content page's closing \"Questions?\"-style section.",
  insertTemplate:
    '::::page-cta[Not finding what you need?]\nBody copy.\n\n:::cta-action[Label]{href="/page/" kind="primary"}\n:::\n::::',
  build: buildPageCta,
  slots: [
    { name: 'title', label: 'Lead', kind: 'inline', required: true },
    { name: 'body', label: 'Body and actions', kind: 'markdown' },
  ],
  group: 'Page structure',
  icon: 'chats',
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

// ─── Membership pricing: a settings-driven dollar figure (Task 3) ──────────
// Same island shape as class-schedule above: build() emits only the no-JavaScript fallback (a
// link to the live join door, since no dollar figure is safe to hard-code here), and
// MembershipPricing.svelte replaces it with the live settings price once mounted
// (membership-pricing.remote.ts). build() itself returns an anchor (inline markup, not a div or
// section), but the directive vocabulary is container-only (remark-directives.ts restores any
// text/leaf directive to literal text) and `hydrate: true` always wraps the build in a `<div>`
// island boundary (rehype-dispatch.ts's islandBoundary). So this component can only ever be
// authored as its OWN line (`:::membership-pricing{tier="..."}` fenced on its own, never after
// other text on the same line), not embedded mid-sentence (B1, 2026-07-15 shared-components
// pass: join.md tried exactly that and the directive rendered as literal text).
const membershipPricing = defineComponent({
  name: 'membership-pricing',
  label: 'Membership price',
  description: "One membership tier's live settings price, on its own line.",
  use: 'Replace a hand-typed dollar figure with the real, settings-driven tier price.',
  insertTemplate: ':::membership-pricing{tier="individual"}\n:::',
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

// ─── Steps / step: a numbered sequence, no card chrome (site-declared) ──────
// A `:::steps` sequence walks the reader through an ordered procedure (before you sail, at the
// dock, when you're done; how to apply): a left number rail whose numerals come from a CSS
// counter in asc-components.css, never authored content, so reordering or inserting a step never
// risks a stale number. Same nesting mechanic as `facts`/`fact` and `related`/`ref`: the
// container filters its slot's children by class, and `step` is hidden from the standalone
// insert menu. The title renders as a `span` (not a heading) because a step is one item in a
// list, not a section of its own. Both the `<ol>` and each `<li>` carry an explicit `list`/
// `listitem` role (review round, 2026-07-15): WebKit drops a list's implicit ARIA semantics once
// `list-style: none` is set (asc-components.css sets it for the CSS-counter rail), so the roles
// are restored in markup rather than left to a browser default that only some engines honor.
function buildStep(ctx: ComponentContext): Element {
  return h('li', { className: ['asc-step'], role: 'listitem' }, [
    h('span', { className: ['asc-step-title'] }, ctx.slot('title')),
    h('div', { className: ['asc-step-body'] }, ctx.slot('body')),
  ]);
}

const step = defineComponent({
  name: 'step',
  label: 'Step',
  description: 'One step in a :::steps numbered sequence.',
  use: 'One entry inside a :::steps list (used nested).',
  insertTemplate: ':::step[Title]\nBody copy.\n:::',
  build: buildStep,
  slots: [
    { name: 'title', label: 'Title', kind: 'inline', required: true },
    { name: 'body', label: 'Body', kind: 'markdown' },
  ],
  group: 'Page structure',
  icon: 'list-checks',
  hidden: true,
});

const steps = defineComponent({
  name: 'steps',
  label: 'Steps',
  description: 'A numbered sequence of steps, rendered as an ordered list with CSS-counted numbers.',
  use: 'Walk the reader through an ordered procedure.',
  insertTemplate: '::::steps\n:::step[Title]\nBody copy.\n:::\n::::',
  build: (ctx) => h('ol', { className: ['asc-steps'], role: 'list' }, nestedChildren(ctx.slot('body'), 'asc-step')),
  slots: [{ name: 'body', label: 'Steps', kind: 'markdown' }],
  group: 'Page structure',
  icon: 'list-checks',
});

// A caption or legend's plain text, flattened from its inline/markdown children, for generating a
// deterministic id (slugifyForId below). Recurses through element children so a legend's markdown
// (a paragraph, a link's own text) still contributes its words.
function textContent(nodes: ElementContent[]): string {
  return nodes
    .map((node) => {
      if (node.type === 'text') return node.value;
      if (isElement(node)) return textContent(node.children);
      return '';
    })
    .join('');
}

// A minimal, dependency-free slug for an id attribute: lowercase, non-alphanumeric runs collapse
// to one hyphen, leading/trailing hyphens trimmed. Deterministic across builds since it only ever
// reads the authored caption/legend text, never a counter or a random value.
function slugifyForId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Every `<table>` element anywhere inside a component's built children, found before
// rehypeTableScroll runs (see the pipeline note below), so aria-labelledby/aria-describedby can be
// stamped directly on the table itself rather than on whatever wrapper eventually surrounds it.
function findTables(nodes: ElementContent[]): Element[] {
  const found: Element[] = [];
  for (const node of nodes) {
    if (isElement(node)) {
      if (node.tagName === 'table') found.push(node);
      found.push(...findTables(node.children));
    }
  }
  return found;
}

// ─── Table: a wrapped markdown table with a variant and an optional legend (site-declared) ──
// A `:::table` wraps a standard markdown table for the design spec's per-context styling: a
// required `variant` attribute (results/fees/gear) sets density and type scale in
// asc-components.css, an optional inline `caption` slot names the table above it, and an
// optional markdown `legend` slot documents any codes or abbreviations the table uses, attached
// tight under it. `caption` and `legend` are declared slots other than `title`/`body`, so the
// engine's own directive stamp (remark-directives.ts) marks a nested `:::caption`/`:::legend`
// container whose name matches the slot name, the same first-class grammar `serializeComponent`
// itself generates for any non-title/body slot; no child component definition is needed the way
// `fact`/`ref`/`step` need one, because a slot only needs a matching nested directive name; it is
// registered nowhere else. The body slot usually holds nothing but the markdown table itself, but
// a figure can legitimately group more than one related table under one shared caption and legend
// (the recap post's two divisions, with interleaved bold sub-labels between them): one figure is
// one logical table group, and every `<table>` in it shares the same caption/legend wiring below.
// The engine's own rehypeTableScroll (createRenderer's default rehype step, see cairn-cms's
// pipeline.js) wraps every `<table>` anywhere in the fully built tree in `.table-scroll` after
// every component build() has run, so this build() never constructs that wrapper itself, it only
// places the table where it belongs relative to the caption and legend.
//
// a11y W2 (review round, 2026-07-15): a caption/legend read as nearby prose to a sighted reader,
// but nothing ties either to the table it describes for a screen reader unless aria-labelledby/
// aria-describedby point at them explicitly. Both ids are slugified from the authored text (stable
// and deterministic across builds); when a figure groups multiple tables, every table in it gets
// the same ids, which is correct since they share one caption and one legend.
function buildTable(ctx: ComponentContext): Element {
  const variant = strAttr(ctx, 'variant') ?? 'results';
  const caption = ctx.slot('caption');
  const legend = ctx.slot('legend');
  const body = ctx.slot('body');
  const tables = findTables(body);
  const kids: ElementContent[] = [];
  if (caption.length) {
    const captionId = `asc-table-caption-${slugifyForId(textContent(caption))}`;
    kids.push(h('figcaption', { id: captionId }, caption));
    for (const t of tables) t.properties.ariaLabelledBy = captionId;
  }
  kids.push(...body);
  if (legend.length) {
    const legendId = `asc-table-legend-${slugifyForId(textContent(legend))}`;
    kids.push(h('div', { className: ['asc-table-legend'], id: legendId }, legend));
    for (const t of tables) t.properties.ariaDescribedBy = legendId;
  }
  return h('figure', { className: ['asc-table', `asc-table-${variant}`] }, kids);
}

const table = defineComponent({
  name: 'table',
  label: 'Table',
  description: 'A markdown table wrapped for its context (results, fees, or gear), with an optional caption and legend.',
  use: 'Present tabular data (a results grid, a fee schedule, a gear list) at the right density for its context.',
  insertTemplate:
    '::::table{variant="results"}\n:::caption\nTable caption.\n:::\n\n| Column | Column |\n| --- | --- |\n| Value | Value |\n\n:::legend\nAbbreviation, meaning.\n:::\n::::',
  build: buildTable,
  attributes: {
    variant: fields.select({ label: 'Variant', required: true, options: ['results', 'fees', 'gear'] }),
  },
  slots: [
    { name: 'caption', label: 'Caption (optional)', kind: 'inline' },
    { name: 'body', label: 'Table', kind: 'markdown', required: true },
    { name: 'legend', label: 'Legend (optional)', kind: 'markdown' },
  ],
  group: 'Page structure',
  icon: 'list-checks',
  preview: {
    attributes: { variant: 'fees' },
    slots: {
      caption: 'Membership dues',
      body: '| Tier | Price |\n| --- | --- |\n| Individual | $50 |',
    },
  },
});

// ─── Availability: a content-facing wrapper around the shared availability-chip (basic-polish
// batch 2b, 2026-07-16) ──────────────────────────────────────────────────────────────────────
// Storage pages (waitlists.md) have their own "Status: Waitlist" bold-prose lines with no chip
// at all, unlike the event surfaces that already draw `.asc-availability-chip` straight from
// Svelte markup (SpineRow, ClassSchedule, the event detail page). No content-facing directive
// reached that chip, so this component is the bridge: it renders the exact same class, styled
// in asc-components.css already, and invents no new visual (per the "reuse the shipped CSS"
// scope). The optional note slot is `kind: 'inline'` rather than `'markdown'` so its phrasing
// content sits in the same `<p>` as the chip, one short status line, not a block paragraph
// stacked under it.
function buildAvailability(ctx: ComponentContext): Element {
  const chip = h('span', { className: ['asc-availability-chip'] }, ctx.slot('title'));
  const note = ctx.slot('body');
  return h('p', { className: ['asc-availability'] }, note.length ? [chip, ' ', ...note] : [chip]);
}

const availability = defineComponent({
  name: 'availability',
  label: 'Availability status',
  description: 'A status chip (Waitlist, Open, and similar), reusing the shared event availability-chip style, with an optional inline note.',
  use: "Mark a resource's current availability status, with a short explanatory note.",
  insertTemplate: ':::availability[Waitlist]\nMulti-year wait is typical.\n:::',
  build: buildAvailability,
  slots: [
    { name: 'title', label: 'Status', kind: 'inline', required: true },
    { name: 'body', label: 'Note (optional)', kind: 'inline' },
  ],
  group: 'Page structure',
  icon: 'list-checks',
  preview: { slots: { title: 'Waitlist', body: 'Multi-year wait is typical.' } },
});

export const ascRegistry = defineRegistry({
  components: [
    callout,
    passage,
    cards,
    card,
    facts,
    fact,
    related,
    ref,
    pageCta,
    ctaAction,
    steps,
    step,
    table,
    availability,
    contactForm,
    donateForm,
    classSchedule,
    membershipPricing,
  ],
});
