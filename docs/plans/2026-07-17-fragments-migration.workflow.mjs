export const meta = {
  name: 'fragments-migration',
  description: 'Stage runner for the ASC fragments migration: adopt, probes, survey, extract',
  whenToUse:
    'Invoked one stage at a time by docs/plans/2026-07-17-fragments-migration.md with args {stage}; the conductor runs judgment between stages.',
  phases: [
    { title: 'Adopt', detail: 'bump + four adoption seams, one implementer, no commit' },
    { title: 'Probes', detail: 'P1-P7 worktree fan-out plus two serial editor agents' },
    { title: 'Survey', detail: 'nine candidate verifiers plus one sweep, read-only' },
    { title: 'Extract', detail: 'serial per-fragment implementers, then the agreement test' },
  ],
}

const SPEC = 'docs/2026-07-17-fragments-migration-design.md'

const PREAMBLE =
  'You are working the ASC site repo (aksailingclub-org). Read ' +
  SPEC +
  ' first; your task references its sections by name. Skip agent-memory maintenance. ' +
  'Your final output is data for an orchestrator, not a human-facing message.'

const FINDING = {
  type: 'object',
  required: ['probe', 'seat', 'promise', 'observed', 'greenAndWrong', 'severity', 'logEntry'],
  properties: {
    probe: { type: 'string', description: 'Probe ID, e.g. P2 or E3' },
    seat: { type: 'string', enum: ['developer', 'editor'] },
    promise: { type: 'string', description: 'What the docs/changelog promise for this surface' },
    observed: { type: 'string', description: 'What actually happened, with the concrete evidence (command, output, screenshot path)' },
    greenAndWrong: {
      type: 'boolean',
      description: 'Could a consumer ship this wrong state with check/test/build all green?',
    },
    severity: { type: 'string', enum: ['blocker', 'major', 'minor', 'note'] },
    logEntry: { type: 'string', description: 'One friction-log-ready sentence' },
  },
}

const ADOPT_RESULT = {
  type: 'object',
  required: ['summary', 'notificationsEvidence', 'gate', 'diary'],
  properties: {
    summary: { type: 'string' },
    notificationsEvidence: {
      type: 'string',
      description: 'The actual commands and output proving the embedded-enforcement check, not reasoning',
    },
    gate: {
      type: 'object',
      required: ['check', 'test', 'build'],
      properties: {
        check: { type: 'string' },
        test: { type: 'string' },
        build: { type: 'string' },
      },
    },
    diary: {
      type: 'array',
      items: FINDING,
      description: 'Developer-seat diary of the adoption recipe; empty only if genuinely nothing was unclear, and then say so in summary',
    },
  },
}

const EDITOR_RESULT = {
  type: 'object',
  required: ['findings', 'screenshots'],
  properties: {
    findings: { type: 'array', items: FINDING },
    screenshots: {
      type: 'array',
      items: { type: 'string' },
      description: 'Absolute paths, one per probe moment worth the conductor seeing',
    },
  },
}

const VERDICT = {
  type: 'object',
  required: ['candidate', 'verdict', 'flipped', 'blockConsumers', 'reasoning'],
  properties: {
    candidate: { type: 'string', description: 'The spec verdict-table row, e.g. "2 club address"' },
    verdict: { type: 'string', enum: ['convert', 'partial', 'drop'] },
    flipped: { type: 'boolean', description: 'True if this differs from the spec provisional verdict' },
    blockConsumers: {
      type: 'array',
      items: { type: 'string' },
      description: 'Content files that genuinely want the same rendered block, with the class-a/class-b call per file',
    },
    reasoning: { type: 'string' },
    extractionNotes: { type: 'string', description: 'The exact source block and anything the extractor must know' },
    agreementFacts: {
      type: 'array',
      items: { type: 'string' },
      description: 'For drop/partial: canonical fact strings plus the files that must carry each',
    },
  },
}

const SWEEP_RESULT = {
  type: 'object',
  required: ['newCandidates'],
  properties: {
    newCandidates: {
      type: 'array',
      items: {
        type: 'object',
        required: ['what', 'where', 'shape'],
        properties: {
          what: { type: 'string' },
          where: { type: 'array', items: { type: 'string' } },
          shape: { type: 'string', description: 'Likely fragment shape, or why it fails the blocks-only bar' },
        },
      },
    },
  },
}

const EXTRACT_RESULT = {
  type: 'object',
  required: ['fragmentId', 'consumersEdited', 'byteIdentical', 'gate', 'commit'],
  properties: {
    fragmentId: { type: 'string' },
    consumersEdited: { type: 'array', items: { type: 'string' } },
    byteIdentical: {
      type: 'array',
      items: { type: 'string' },
      description: 'Class-a consumers where the replaced block matched the fragment byte for byte',
    },
    gate: { type: 'string' },
    commit: { type: 'string', description: 'The commit hash' },
    notes: { type: 'string' },
  },
}

const DEV_PROBES = [
  {
    id: 'P1',
    task:
      "Edit src/theme/cairn.config.ts and remove routing: 'embedded' from the fragments concept declaration (then also try routing: 'page'). Run npm run check and npm run build after each. Observe: what tells you the reserved concept requires embedded routing, and WHEN (config parse, check, build, runtime, or never)?",
  },
  {
    id: 'P2',
    task:
      'Remove the resolveFragment forwarding from the render wrapper (find where Stage 0 added it). Create a scratch fragment in src/content/fragments/, include it from an existing page with the ::include directive, run npm run cairn:manifest, then the full gate, then render the consuming page from a build preview. Observe: does the include silently splice to nothing while check/test/build stay green? This is the prime green-and-wrong candidate; capture exactly what the page shows.',
  },
  {
    id: 'P3',
    task:
      "Remove the fragments glob from the manifest plugin's configuration only (keep the createSiteIndexes glob). Create a scratch fragment file directly, run npm run cairn:manifest, and inspect src/content/.cairn/index.json plus whatever the admin build sees. Observe: which layer sees the fragment and which does not, and what an editor or developer is actually told about the divergence.",
  },
  {
    id: 'P4',
    task:
      'Add ::include{fragment="never-existed"} to an existing page, run npm run cairn:manifest, then npm run build. Observe: confirm the build fails as the changelog promises, and read the error as a first consumer would. Does it name the consuming file, the include line, and the fix?',
  },
  {
    id: 'P5',
    task:
      'Create a scratch fragment and include it from a BULLETIN entry under src/content/bulletins/ (manifest, gate, render). The changelog says an editor includes a fragment "in any post or page". Observe: does the include render in the bulletin, is the boundary enforced, and is it told or discovered?',
  },
  {
    id: 'P6',
    task:
      "Create a scratch fragment, run npm run cairn:manifest and npm run build, serve the build preview. Observe: the fragment's computed permalink returns 404, and the fragment appears in neither the sitemap nor any feed the build emits. Record the permalink you derived and how you derived it.",
  },
  {
    id: 'P7',
    task:
      'Remove the fragments glob from createSiteIndexes in src/chassis/content.ts only (keep the manifest plugin glob). Create a scratch fragment, include it from a page, manifest, gate, render. Observe: the mirror of P3. Which layer notices, what fails, and what would an editor see in the admin versus the reader on the page?',
  },
]

function devProbePrompt(p) {
  return (
    PREAMBLE +
    ' You are in a THROWAWAY git worktree: break anything, fix nothing, and never commit. Run npm install first. ' +
    'Baseline: the fragments concept is already adopted per spec Stage 0. ' +
    'Execute exactly one probe from the spec Stage 1 developer table. Probe ' +
    p.id +
    ': ' +
    p.task +
    ' Return one finding per the schema. A "behaves exactly as documented" result is still a finding.'
  )
}

const EDITOR_COMMON =
  PREAMBLE +
  ' You are in a THROWAWAY git worktree: never commit. Run npm install first. Drive the real /admin as a signed-in editor: ' +
  'mint a local admin session following the e2e/helpers/admin-session.ts precedent against the local D1 replica ' +
  '(its member analogue e2e/helpers/member-session.ts documents the mechanism), serve the app locally, and drive it ' +
  'with Playwright. Save a screenshot at every probe moment worth the conductor seeing and return the absolute paths. ' +
  'Any friction in getting the editor seat running is itself a finding (seat: developer). ' +
  'Execute the following probes from the spec Stage 1 editor table, in order, one finding each: '

const EDITOR_HAPPY =
  EDITOR_COMMON +
  'E1 (create a fragment, publish it, include it in a page via the "Include a fragment" picker; record the whole first-editor loop: discoverability, picker flow, save), ' +
  'E2 (how the included block reads in the preview; the fold pill label and its tooltip), ' +
  'E8 (author a fragment carrying the site :::facts directive, the :::table{variant="fees"} directive, a cairn: link, and a media image; include it in a page; verify render parity between the fragment spliced in a consumer and the same markdown native to the page).'

const EDITOR_WRONG =
  EDITOR_COMMON +
  'E3 (publish a page that includes a DRAFT fragment: what does the public page render, and what warned the editor, and when), ' +
  'E4 (rename a fragment with two or more inbound includes: verify the rewrite commit touches every consumer; check what happens to a draft consumer with unsaved editor changes), ' +
  'E5 (try deleting a still-included fragment: confirm the refusal names the consumers; read the dialog as an editor would), ' +
  'E6 (make a fragment include another fragment: confirm the save refusal and record its message), ' +
  'E7 (insert an ::include line with no fragment attribute: confirm the preview notice the 0.87.0 changelog says was fixed).'

const CANDIDATES = [
  '1 mooring cost and eligibility',
  '2 club address',
  '3 storage fees',
  '4 club-boat ground rules',
  '5 life-jacket rule',
  '6 camping and RV quick facts',
  '7 who-to-ask contact routes',
  '8 class registration path',
  '9 discord channel vocabulary',
]

function surveyPrompt(candidate) {
  return (
    PREAMBLE +
    ' READ-ONLY task: edit nothing. Verify one row of the spec Stage 2 verdict table against the content as it exists ' +
    'TODAY under src/content/ (the survey docs/fragment-candidates.md names the historical locations; trust the files, ' +
    'not the survey). Candidate: ' +
    candidate +
    '. Apply the blocks-only bar from the spec (Ratified decisions, item 2): a consumer counts only if it genuinely ' +
    'wants the SAME rendered block; a table row cannot take a block splice; voice-adapted prose stays prose. ' +
    'Confirm or flip the provisional verdict with concrete evidence (quote the blocks). For drop or partial verdicts, ' +
    'list the canonical fact strings and the files that must keep agreeing (the agreement test consumes these). ' +
    'For convert or partial, record the exact source block and per-consumer class-a (byte-identical replacement) or ' +
    'class-b (convergence edit) calls in extractionNotes.'
  )
}

const SWEEP_PROMPT =
  PREAMBLE +
  ' READ-ONLY task: edit nothing. Sweep src/content/pages and src/content/posts for content that logically lives in ' +
  'multiple places but is NOT one of the nine candidates in docs/fragment-candidates.md: repeated facts blocks, ' +
  'repeated fee or rule statements, repeated closers. The nine known candidates are out of scope. Apply the ' +
  'blocks-only bar from the spec before proposing anything; an empty result is a fine result.'

// Some callers deliver args JSON-encoded rather than as a value; accept both.
const input = typeof args === 'string' ? JSON.parse(args) : args

if (!input || !input.stage) {
  throw new Error("Pass args {stage: 'adopt' | 'probes' | 'survey' | 'extract'} per the plan doc.")
}

if (input.stage === 'adopt') {
  phase('Adopt')
  const result = await agent(
    PREAMBLE +
      ' Execute spec Stage 0 ("bump and adopt") on the current branch exactly as written: bump @glw907/cairn-cms to ' +
      '^0.87.0 and npm install; EMPIRICALLY verify the embedded-enforcement change against the notifications concept ' +
      '(home banner still renders; notification entries absent from site.all(), the sitemap, and feeds; return the ' +
      'commands and output as notificationsEvidence); adopt the four seams (the fragments concept declaration in ' +
      "src/theme/cairn.config.ts with routing: 'embedded'; the src/content/fragments/*.md glob into createSiteIndexes " +
      'in src/chassis/content.ts AND the manifest plugin; { screen: "fragments" } in the existing navLayout, gated ' +
      'like posts/pages; resolveFragment forwarded in the render wrapper). Read src/chassis/README.md before touching ' +
      'src/chassis/ and reach chassis only through its exported seams. The adoption recipe is cairn\'s guide ' +
      'docs/guides/reuse-content-across-entries.md in ~/Projects/cairn-cms; follow it as a first consumer would, and ' +
      'diary every moment it is unclear, wrong, or incomplete (developer seat). Create src/content/fragments/ with a ' +
      '.gitkeep so the empty concept is live. Gate: npm run check (0 errors, 0 warnings), npm test, npm run build. ' +
      'Do NOT commit; leave the working tree for the conductor review.',
    { agentType: 'site-implementer', model: 'sonnet', label: 'adopt', phase: 'Adopt', schema: ADOPT_RESULT },
  )
  return result
}

// The editor seat probes admin UI that cairn has already rebuilt on an unreleased branch (the
// include chip, the fold pill, the preview boundary, the publish blast radius). Probing 0.87.0
// would harvest friction that 0.88.0 already fixes, so E1-E8 defer until it ships
// (Geoff, 2026-07-17). Pass {editor: true} once ASC is on ^0.88.0.
if (input.stage === 'probes') {
  phase('Probes')
  const withEditor = input.editor === true
  log(
    withEditor
      ? 'P1-P7 fan out in worktrees; editor agents run serially beside them'
      : 'P1-P7 fan out in worktrees; editor seat E1-E8 DEFERRED to cairn 0.88.0',
  )
  const [dev, editor] = await parallel([
    () =>
      parallel(
        DEV_PROBES.map((p) => () =>
          agent(devProbePrompt(p), {
            agentType: 'general-purpose',
            model: 'sonnet',
            isolation: 'worktree',
            label: 'probe:' + p.id,
            phase: 'Probes',
            schema: FINDING,
          }),
        ),
      ),
    async () => {
      if (!withEditor) return []
      const happy = await agent(EDITOR_HAPPY, {
        agentType: 'general-purpose',
        model: 'sonnet',
        isolation: 'worktree',
        label: 'probe:E1,E2,E8',
        phase: 'Probes',
        schema: EDITOR_RESULT,
      })
      const wrong = await agent(EDITOR_WRONG, {
        agentType: 'general-purpose',
        model: 'sonnet',
        isolation: 'worktree',
        label: 'probe:E3-E7',
        phase: 'Probes',
        schema: EDITOR_RESULT,
      })
      return [happy, wrong].filter(Boolean)
    },
  ])
  return {
    developer: (dev || []).filter(Boolean),
    editor: (editor || []).flatMap((r) => r.findings),
    screenshots: (editor || []).flatMap((r) => r.screenshots),
    editorDeferred: !withEditor,
  }
}

if (input.stage === 'survey') {
  phase('Survey')
  const [verdicts, sweep] = await parallel([
    () =>
      parallel(
        CANDIDATES.map((c) => () =>
          agent(surveyPrompt(c), {
            agentType: 'general-purpose',
            model: 'sonnet',
            label: 'verify:' + c.split(' ')[0],
            phase: 'Survey',
            schema: VERDICT,
          }),
        ),
      ),
    () =>
      agent(SWEEP_PROMPT, {
        agentType: 'general-purpose',
        model: 'sonnet',
        label: 'sweep:new-duplicates',
        phase: 'Survey',
        schema: SWEEP_RESULT,
      }),
  ])
  return { verdicts: (verdicts || []).filter(Boolean), sweep }
}

if (input.stage === 'extract') {
  phase('Extract')
  if (!Array.isArray(input.fragments) || !Array.isArray(input.agreements)) {
    throw new Error('extract needs input.fragments and input.agreements, resolved by the conductor at plan step 3.')
  }
  const results = []
  for (const f of input.fragments) {
    results.push(
      await agent(
        PREAMBLE +
          ' Extract ONE fragment on the current branch. The conductor-resolved verdict for it: ' +
          JSON.stringify(f) +
          ' Create src/content/fragments/' +
          f.id +
          '.md carrying the canonical block (frontmatter per the concept schema; the fragment id is editor-facing). ' +
          'In each listed consumer, replace the duplicated block with ::include{fragment="' +
          f.id +
          '"}. A class-a consumer must be a byte-identical extraction: the fragment body must be exactly the block the ' +
          'consumer carried, so rendering cannot change. A class-b consumer takes the convergence edit the verdict ' +
          'describes. Run npm run cairn:manifest, then the full gate (npm run check 0/0, npm test, npm run build), ' +
          'then commit ONLY the files this fragment touched, imperative mood, ' +
          'Co-Authored-By: Claude <noreply@anthropic.com>.',
        {
          agentType: 'site-implementer',
          model: 'sonnet',
          label: 'extract:' + f.id,
          phase: 'Extract',
          schema: EXTRACT_RESULT,
        },
      ),
    )
  }
  const agreementTest = await agent(
    PREAMBLE +
      ' Write src/tests/content-agreement.test.ts per the spec section "The agreement test", test-first, from this ' +
      'conductor-resolved agreements list: ' +
      JSON.stringify(input.agreements) +
      ' For each canonical fact string, assert it appears in each named content file (read the files from disk in the ' +
      'test, vitest style, matching the existing src/tests/ conventions). Prove the test is meaningful: temporarily ' +
      'break one fact in one file, watch it fail, restore it. Then delete docs/fragment-candidates.md (its header ' +
      'names this pass as the deletion trigger; rationale survives in the spec verdict table). Full gate, then commit ' +
      'the test and the deletion together, imperative mood, Co-Authored-By: Claude <noreply@anthropic.com>.',
    {
      agentType: 'site-implementer',
      model: 'sonnet',
      label: 'agreement-test',
      phase: 'Extract',
      schema: EXTRACT_RESULT,
    },
  )
  return { fragments: results.filter(Boolean), agreementTest }
}

throw new Error('Unknown stage: ' + input.stage)
