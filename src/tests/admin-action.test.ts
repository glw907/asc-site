import { describe, expect, it } from 'vitest';
import { adminAction } from '$admin-club/lib/adminAction';
import type { Editor } from '@glw907/cairn-cms';

function event(editor: Editor | null) {
  return { locals: { editor } };
}

const owner: Editor = { email: 'owner@example.com', displayName: 'Owner', role: 'owner' };
const editor: Editor = { email: 'editor@example.com', displayName: 'Editor', role: 'editor' };

describe('adminAction', () => {
  it('returns the signed-in editor and a bound audit emitter', () => {
    const result = adminAction(event(editor));
    expect(result.editor.email).toBe('editor@example.com');

    const entry = result.audit('club.events.viewed', { count: 3 });
    expect(entry.actor).toBe('editor@example.com');
    expect(entry.action).toBe('club.events.viewed');
    expect(entry.detail).toEqual({ count: 3 });
    expect(typeof entry.at).toBe('number');
  });

  it('throws (a login redirect) when no editor is signed in', () => {
    expect(() => adminAction(event(null))).toThrow();
  });

  it('rejects a non-owner editor with ownerOnly set', () => {
    expect(() => adminAction(event(editor), { ownerOnly: true })).toThrow();
  });

  it('allows an owner through ownerOnly', () => {
    const result = adminAction(event(owner), { ownerOnly: true });
    expect(result.editor.role).toBe('owner');
  });
});
