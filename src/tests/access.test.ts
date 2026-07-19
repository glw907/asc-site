import { describe, expect, it } from 'vitest';
import { canReach } from '@glw907/cairn-cms';
import { access } from '$theme/cairn.config.js';
import { editorWithRole } from './_editor';

// Spot-checks over the T3 access map (docs/plans/2026-07-19-asc-roles-adoption.md): the two named
// carve-outs, the Publisher widening, and one no-rule target so the test states what the engine's
// own default actually does rather than assuming it. Full role-by-function matrix coverage is T5,
// driven off this same `access` value.

describe('the access map', () => {
  it('denies Publisher the documents screen (the Waiver-text carve-out)', () => {
    expect(canReach(access, editorWithRole('Publisher'), 'documents')).toBe(false);
  });

  it('denies Webmaster the documents screen', () => {
    expect(canReach(access, editorWithRole('Webmaster'), 'documents')).toBe(false);
  });

  it('admits Club manager and Administrator to the documents screen', () => {
    expect(canReach(access, editorWithRole('Club manager'), 'documents')).toBe(true);
    expect(canReach(access, editorWithRole('Administrator'), 'documents')).toBe(true);
  });

  it('admits Publisher to /admin/club/email (the Publisher widening)', () => {
    expect(canReach(access, editorWithRole('Publisher'), '/admin/club/email')).toBe(true);
  });

  it('admits Publisher to /admin/club/announce (the Publisher widening)', () => {
    expect(canReach(access, editorWithRole('Publisher'), '/admin/club/announce')).toBe(true);
  });

  it('denies Publisher the /admin/club section default', () => {
    expect(canReach(access, editorWithRole('Publisher'), '/admin/club')).toBe(false);
  });

  it('denies Publisher a section child with no deeper override, e.g. /admin/club/money', () => {
    expect(canReach(access, editorWithRole('Publisher'), '/admin/club/money')).toBe(false);
  });

  it('admits Publisher to media (the media-picker landmine: Publisher edits image-bearing posts)', () => {
    expect(canReach(access, editorWithRole('Publisher'), 'media')).toBe(true);
  });

  it('denies Instructor (none capability) every mapped target regardless of the map', () => {
    expect(canReach(access, editorWithRole('Instructor'), 'posts')).toBe(false);
    expect(canReach(access, editorWithRole('Instructor'), 'media')).toBe(false);
  });

  // `help` is not a valid access-map key at all (not a concept, not one of cairn's four fixed
  // screens), so the map carries no rule for it. The engine's own documented default for a target
  // with no rule is "any editor-capability session reaches it" -- this is what makes the matrix's
  // "Publisher excluded from Help" cell unenforceable (constraint 2), and this test pins the actual
  // observed behavior rather than assuming it.
  it('admits any editor-capability role to the unmappable help target (the engine default for no rule)', () => {
    expect(canReach(access, editorWithRole('Webmaster'), 'help')).toBe(true);
    expect(canReach(access, editorWithRole('Publisher'), 'help')).toBe(true);
  });
});
