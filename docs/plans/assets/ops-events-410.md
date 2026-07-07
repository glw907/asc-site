# The ops events/classes 410 retirement (prepared, HELD for Geoff's go)

Pass 2.1's Task 9 repoints the site's own events/season reads at `asc-club` (see
`src/theme/events-data.ts`, `src/theme/season-data.ts`, and `wrangler.toml`'s reader note on
`EVENTS_DB`). That leaves the ops dashboard's own event/class **management** surface
(`ops.aksailingclub.org/events`, and its `/api/events*` and `/api/classes*` routes) stale: the
volunteer workflow for creating, editing, and deleting events and classes now lives in cairn's
`/admin/club/events` and `/admin/club/classes` (Tasks 5 and 6 of this pass's plan), so the ops
routes above no longer write anything the site reads. Per the plan's global constraint
("**asc-ops is NEVER altered**... the ops 410 retirement is PREPARED but HELD for Geoff's go"),
this document is the prepared patch, not a deployed change. **Nothing in this document has been
applied to `~/Projects/aksailingclub-legacy`; that repo is untouched.**

## Scope

Retired (return `410 Gone`): the events management view and every events/classes API route.

- `GET /events` (the ops dashboard's events management page)
- `POST /api/events`, `GET /api/events/:id/edit`, `PUT`/`POST /api/events/:id`, `DELETE
  /api/events/:id`
- `GET /api/classes/:id/edit`, `PATCH /api/classes/:id/status`, `PUT`/`POST /api/classes/:id`

**Deliberately excluded** from this patch, left live:

- `GET /images/:filename` (`serveImageHandler`): still serves the historical event/class photo
  bytes the ops dashboard uploaded; asc-club's `classes` table carries no photo column at all (see
  `events-data.ts`'s own header on this pass's data loss there), and until those historical event
  photos are pulled into cairn's media library, this route is the only thing serving them. 410-ing
  it would break existing image references with no replacement.
- `GET /api/schema` (and its `OPTIONS` preflight): cross-app, consumed by
  `handbook.aksailingclub.org`, unrelated to events/classes administration.
- `ops/src/routes/events.js` and `ops/src/routes/classes.js` themselves, and their imports in
  `ops/src/index.js`: left in place. The patch guards the routing table only (early-return `410`
  before the existing dispatch), so the retirement is a pure routing change, trivially reversible,
  and never touches the handler modules or the `DB` binding.

## The patch

Unified diff against `~/Projects/aksailingclub-legacy/ops/src/index.js` (current as read
2026-07-07). Insert the guard immediately before the existing `// Events view` block, so every
request that would have reached the old handlers is intercepted first.

```diff
--- a/ops/src/index.js
+++ b/ops/src/index.js
@@
 		// Send payment request: POST /api/assignments/:id/send-payment
 		const sendPaymentMatch = url.pathname.match(/^\/api\/assignments\/(\d+)\/send-payment$/);
 		if (sendPaymentMatch && method === 'POST') {
 			const assignmentId = parseInt(sendPaymentMatch[1]);
 			return sendPaymentRequestHandler(request, env, userEmail, assignmentId, log);
 		}
 
+		// RETIRED (pass 2.1, Task 9): events/classes administration moved to cairn's
+		// /admin/club/events and /admin/club/classes, both against the new asc-club D1. This
+		// guard intercepts every route the old ops-dashboard events/classes admin served, before
+		// the routing table below ever reaches eventsViewHandler/createEventHandler/etc. Rollback
+		// is deleting this block; nothing else in this file changes.
+		const isRetiredEventsRoute =
+			url.pathname === '/events' ||
+			url.pathname === '/api/events' ||
+			/^\/api\/events\/\d+(\/edit)?$/.test(url.pathname) ||
+			/^\/api\/classes\/[^/]+(\/edit|\/status)?$/.test(url.pathname);
+		if (isRetiredEventsRoute) {
+			return new Response('Events and classes now live in the club admin. See /admin/club.', {
+				status: 410,
+				headers: { 'Content-Type': 'text/plain' },
+			});
+		}
+
 		// Events view
 		if (url.pathname === '/events') {
 			return eventsViewHandler(env, userEmail, log);
 		}
```

The body text ("Events and classes now live in the club admin. See /admin/club.") intentionally
gives no bare host, since the club admin lives on `dev.aksailingclub.org` today and moves to
`aksailingclub.org` at the site cutover; update the wording at deploy time if the target host has
changed since this document was written.

## Deploy (when Geoff gives the go, not before)

```sh
cd ~/Projects/aksailingclub-legacy/ops
# apply the diff above (by hand or `git apply`), then:
npx wrangler deploy
```

Verify immediately after:

```sh
curl -i https://ops.aksailingclub.org/events
curl -i -X POST https://ops.aksailingclub.org/api/events
curl -i https://ops.aksailingclub.org/images/some-existing-file.jpg   # expect 200 or 404, never 410
curl -i https://ops.aksailingclub.org/api/schema                       # expect 200, never 410
```

The first two must return `410`; the last two must behave exactly as before (unaffected by this
patch).

## Rollback

The patch is additive and self-contained (one guard block, no deleted code): revert the single
commit, or delete the inserted block by hand, and `npx wrangler deploy` again. No data migration,
no D1 change, nothing to undo beyond the routing guard itself.
