# The chassis

The boundary rule, per cairn-cms's canonical statement
(`examples/showcase/src/chassis/README.md` in the `cairn-cms` repo): **a theme is everything that
isn't chassis.** `src/chassis/` holds the genre-free layer ASC's theme (living in `src/theme/`,
plus the route files under `src/routes/` that SvelteKit's filesystem routing pins in place)
mounts onto: the plumbing every site needs regardless of what it looks like. Everything outside
`src/chassis/` (the concrete adapter config, the chrome components, the home and article
composition, the theme's color and type values, the site's own directive registry) is the
theme's own content. A theme file reaches chassis only through its exported seams: the
`$chassis` alias in `.ts`/`.svelte` files, or a relative `@import` in a `.css` file (aliases do
not resolve in CSS), always naming one of the files below.

The chassis files here came from `cairn-cms`'s own showcase, the reference site the chassis
boundary was first cut against (verbatim where a file is genuinely site-agnostic; `content.ts`,
`feed.ts`, and `cairn.server.ts` carry the same shape but wire ASC's own concepts, `posts`,
`pages`, `bulletins`, `fragments`, and `documents`).

## What lives here

| File | What it is |
| --- | --- |
| `content.ts` | The delivery content layer: globs the markdown, builds the site/posts/pages/bulletins/fragments/documents indexes through `createSiteIndexes`. |
| `feed.ts` | Maps the posts index into `cairn-cms/delivery`'s `FeedItem` shape, shared by the RSS and JSON Feed routes. |
| `cairn.server.ts` | The one server-side runtime composition point (`composeRuntime`, `createCairnAdmin`); every server route that needs the runtime imports it from here. |
| `theme-toggle.ts` | The light/dark toggle mechanism: resolve the active theme, apply a choice, persist it to a cookie. |
| `tokens.css` | The token SYSTEM: Tailwind and the DaisyUI plugin activation, the design-scale keys with generic defaults, and the semantic (code-highlight, ink, elevation, CTA) bindings. |
| `prose.css` | The reading-surface foundation: every prose element bound to tokens, with the signature flourish gestures behind `[data-flourish]`. |
| `composition.css` | The composition primitives: card, band, section, hero, sidebar-layout, site-shell. Unused in ASC's current markup, same as in the showcase; the theme reaches for one instead of hand-rolling its own. |
| `render.ts` | The component-grammar wiring: `makeIconRenderer` closes a theme's icon set over the engine's glyph helpers. Added back in Task 3 (the theme build) once the migrated content's directives needed real icons; see the note below for the re-add path. |

Omitted from this copy, deliberately: `dev-gate.ts` (the showcase's dev-backend feature flag;
ASC has no dev backend, per `hooks.server.ts`'s own comment). Per the chassis's own
subtractability rule (a developer may drop an unused chassis element with no other seam
depending on it), adding it back is a matter of copying the file from `cairn-cms`'s showcase and
wiring its one consumer; nothing else references it. `render.ts` was omitted the same way at
Task 1's scaffold time (zero components were registered yet) and re-added in Task 3 by that exact
path, the worked example of the doctrine this file describes.

## Every override seam

**Adapter and delivery wiring.** `content.ts`, `feed.ts`, and `cairn.server.ts` take the theme's
own `cairn.config.ts` adapter (concepts, fields, backend) as input; none of them declares any
content model of its own.

**The token system (`tokens.css`).** Every design-scale key (`--font-*`, `--text-step-*`,
`--spacing-*`, `--leading-*`, `--tracking-*`, `--container-measure*`, `--color-muted`,
`--color-card-border`) is declared inside `@theme` with a generic default. `theme.css` `@import`s
`tokens.css` first, then redeclares the same keys with ASC's real numbers (the club-grounds
story: flag navy, star gold, fireweed, building sage, harbor ink).

**The prose foundation (`prose.css`).** Every element reads a token, so a re-skin carries the
reading surface forward with no edit here.

**The theme-toggle mechanism (`theme-toggle.ts`).** `resolveTheme`/`applyTheme`/`toggleTheme`
know nothing about which two DaisyUI theme names or which cookie name a theme uses;
`SiteHeader.svelte` passes its own `ThemeToggleConfig`.

**Composition primitives (`composition.css`).** `.cairn-card`, `.cairn-band`, `.cairn-section`,
`.cairn-hero`, `.cairn-sidebar-layout`, each exposing its own `--cairn-<primitive>-*` custom
properties for a per-instance override. Adopting one is a theme choice, never a requirement.

## Adding a new primitive or seam

Read this file's boundary rule first: genre-free plumbing and configurable structure belong
here; a specific look, a specific chrome, or a specific content model belongs to the theme.
