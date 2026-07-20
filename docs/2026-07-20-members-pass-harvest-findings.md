# Members pass: cairn harvest findings

> The cairn-bound findings from the Members pass (the first `admin-screen-passes`
> pass). Filed for the harvest per the DX-harvest mandate. The two rulings below were
> settled mid-pass; the build findings section is appended at pass close, when the
> toolkit has been shaken by its first consumer.

## Ruling: the admin toolkit ships inside the cairn package, behind a subpath export (Geoff, 2026-07-20)

The toolkit publishes into `@glw907/cairn-cms` itself, exposed through a dedicated
subpath export (shape: `@glw907/cairn-cms/admin-toolkit`), never as a sibling npm
package. The grounds:

- The toolkit's heavy part already lives in cairn. Its daisy class vocabulary exists
  only because the blessed-set safelist compiles into `cairn-admin.css`, cairn's own
  bundle. A separate package would not make cairn leaner where it counts; component
  source is inert until imported and tree-shakes to zero for consumers that skip it.
- Atomic versioning. Components lean on exact daisy class names the safelist
  guarantees. One package means the safelist and its consumers version together, and
  the toolkit READMEs' class inventories live in the repo whose build they audit. Two
  packages mint a skew hazard (toolkit vX needing classes admin-CSS vY tree-shook out)
  and a second range every site must keep agreeing with the first.
- One ritual, one ceremony. The daisy absorption ritual (below) stays a single
  in-repo procedure, and cairn-release stays the only release process. A second
  package doubles versioning, changelog, publish, and doc-gate ceremony for one
  maintainer and three consumer sites, against the simplify-it doctrine.
- The subpath is the future seam. It keeps the main export surface clean, makes the
  toolkit legible as its own product, and is the line along which a split would
  happen if a genuine engine-less consumer ever appears. Until then a split is
  speculative structure.

Publication remains consumer-gated (the kit-first ruling): components are born in
the ASC theme layer, Members shakes them, and they move to cairn with the generality
already proven. The subpath ruling settles where they land, not when.

## Ruling: harvest cadence is wave-by-graduation, not per-pass and not end-of-series (Geoff, 2026-07-20)

A component graduates into cairn when its second consuming screen has used it with
the contract unchanged, or when cairn's own admin screens want it (engine pull beats
calendar). Each graduating cohort batches into one cairn release under the normal
release doctrine, so the series produces a few harvest releases, not one per pass
and not a single big-bang harvest at the end. The grounds:

- The cost asymmetry: a wrong contract published in cairn is a breaking change
  across every consumer; the same mistake in ASC's theme layer is one local
  refactor. One consumer exercises only part of a general contract; the second
  screen is the shakedown that earns publication.
- Iteration speed: a local tweak is a commit; a published tweak is a release plus a
  dependency bump on every site. Components stay local while their churn rate is
  high.
- Against end-of-series: Money is deliberately late, a big-bang harvest is a large
  hard-to-review pass, and waiting delays the harvest's real payoff (cairn's own
  admin adopting the toolkit).

Consequence for this pass: the Members set stays in the ASC theme layer at close.
The first harvest wave is expected after the next screen pass (Classes or Assets)
proves which contracts held. Each wave shrinks ASC's local surface: the site swaps
local copies for the `admin-toolkit` subpath imports and deletes them.

## Engine item: the daisy absorption ritual (Geoff, 2026-07-20)

Cairn owns the daisyUI dependency for admin surfaces, so cairn gets a scheduled
update ritual rather than ad hoc bumps:

- Automated bump PRs (Dependabot or Renovate on `daisyui`).
- Per release: read the daisy changelog, rebuild, verify every blessed-set class
  still compiles into `cairn-admin.css`, run the visual suite, and note new daisy
  components worth adopting into the toolkit.
- The audit surface is the per-component class inventory each toolkit README entry
  carries, which makes an upgrade's blast radius mechanical to grep.

## Build findings (appended at pass close)

Pending: which toolkit contracts proved general enough for cairn as-is, which need a
second consuming screen first, and any engine or contract deficiencies the build
surfaced.
