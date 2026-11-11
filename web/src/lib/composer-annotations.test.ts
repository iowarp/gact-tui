import { describe, expect, it } from 'vitest';
import { commentSessionParts, markFromSelection, withMark } from './composer-annotations';

const answer = (text: string) =>
  markFromSelection({ kind: 'agent-answer-text', text, sessionId: 's', messageId: 'm' });

describe('comment sessions attached to the next message', () => {
  it('collects marks on one answer into one session labelled S1, S2', () => {
    const first = answer('brighter, tangy');
    const second = answer('dill-caper sauce');
    let sessions = withMark([], first.kind, first.title, first.anchor);
    sessions = withMark(sessions, second.kind, second.title, second.anchor, 'Why this?');
    expect(sessions).toHaveLength(1);
    expect(sessions[0].marks.map((mark) => mark.label)).toEqual(['S1', 'S2']);
    expect(sessions[0].marks[1]).toMatchObject({
      comment: 'Why this?',
      anchor: { profile: 'text-quote', exact: 'dill-caper sauce', source: { message_id: 'm' } },
    });
  });

  it('turns a data zone into a mark whose reference travels as lines under it', () => {
    const zone = markFromSelection({
      kind: 'data-surface-zone',
      title: 'Depth vs. magnitude',
      summary: 'the whole view (500 rows)',
      markdown: '**Depth vs. magnitude**\nDataset: quakes.\n\nZone: the whole view.',
    });
    expect(zone).toMatchObject({
      kind: 'a2ui-surface',
      anchor: { profile: 'dom', tag: 'zone', text_excerpt: 'the whole view (500 rows)' },
    });
    expect(zone.anchor.source?.under).toEqual([
      '**Depth vs. magnitude**',
      'Dataset: quakes.',
      'Zone: the whole view.',
    ]);
  });

  it('sends each non-empty session as one comment_session part and no text', () => {
    const mark = answer('only this');
    const sessions = [
      ...withMark([], mark.kind, mark.title, mark.anchor),
      { kind: 'browser-page' as const, title: 'empty', marks: [] },
    ];
    const parts = commentSessionParts(sessions);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({
      type: 'comment_session',
      metadata: { comment_session: { kind: 'agent-answer' } },
    });
  });
});
