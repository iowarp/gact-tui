import { afterEach, describe, expect, it } from 'vitest';
import {
  clearSavedDrafts,
  deleteSavedDraft,
  saveDraft,
  savedDrafts,
  takeSavedDraft,
} from './composer-saved-drafts';

afterEach(() => clearSavedDrafts());

describe('saved composer drafts', () => {
  it('keeps one list per conversation and takes the newest back first', () => {
    saveDraft('session_a', { text: 'first', references: [] });
    saveDraft('session_a', { text: 'second', references: [] });
    saveDraft('session_b', { text: 'elsewhere', references: [] });

    expect(takeSavedDraft('session_a')?.text).toBe('second');
    expect(savedDrafts('session_a').map((draft) => draft.text)).toEqual(['first']);
    expect(savedDrafts('session_b').map((draft) => draft.text)).toEqual(['elsewhere']);
  });

  it('ignores an empty draft and removes one by id', () => {
    expect(saveDraft('session_a', { text: '   ', references: [] })).toBeUndefined();
    const kept = saveDraft('session_a', { text: 'keep', references: [] })!;
    const dropped = saveDraft('session_a', { text: 'drop', references: [] })!;

    deleteSavedDraft('session_a', dropped.id);
    expect(savedDrafts('session_a')).toEqual([kept]);
    expect(takeSavedDraft('session_a', kept.id)).toEqual(kept);
    expect(savedDrafts('session_a')).toEqual([]);
  });
});
