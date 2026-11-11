import type { DocumentAnchor } from '@clio/core/v3';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DraftMark, MarkPlace } from './comment-model';

const Session = createContext<unknown>(undefined);

vi.mock('./comment-session', () => ({ useCommentSession: () => useContext(Session) }));

import { CommentCapture } from './comment-capture';

/** The parts of a comment session the capture uses: open, text mode, its marks. */
function FakeSession({ children }: { children: ReactNode }) {
  const [marks, setMarks] = useState<DraftMark[]>([]);
  const value = {
    open: true,
    active: true,
    mode: 'text',
    marks,
    setEditing: () => undefined,
    addMark: (anchor: DocumentAnchor, place: MarkPlace = {}) => {
      const label = `S${marks.length + 1}`;
      setMarks((current) => [
        ...current,
        { label, mode: 'text', anchor, comment: '', sendToAgent: true, preview: '', ...place },
      ]);
      return label;
    },
  };
  return <Session.Provider value={value}>{children}</Session.Provider>;
}

const rect = (left: number, top: number) =>
  ({
    left,
    top,
    width: 40,
    height: 10,
    right: left + 40,
    bottom: top + 10,
    x: left,
    y: top,
  }) as DOMRect;

beforeEach(() => {
  vi.spyOn(Range.prototype, 'getClientRects').mockImplementation(
    () => [rect(10, 10)] as unknown as DOMRectList,
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function frame() {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
  });
}

describe('CommentCapture', () => {
  it('draws a mark on the pane it was made on, not on a pane beside it', async () => {
    // A paper's source and PDF can show the same words; both panes share one session.
    const { getByTestId } = render(
      <FakeSession>
        <CommentCapture>
          <p data-testid="source">Burst buffers absorb checkpoint writes.</p>
        </CommentCapture>
        <CommentCapture>
          <p data-testid="pdf">Burst buffers absorb checkpoint writes.</p>
        </CommentCapture>
      </FakeSession>,
    );
    const words = getByTestId('pdf').firstChild!;
    const range = document.createRange();
    range.setStart(words, 14);
    range.setEnd(words, 20);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
    fireEvent.mouseUp(getByTestId('pdf'));
    await frame();
    await frame();
    const pane = (id: string) => getByTestId(id).parentElement!;
    expect(
      pane('pdf').querySelector('[data-slot="comment-text-layer"] [data-mark-label="S1"]'),
    ).not.toBeNull();
    expect(pane('source').querySelector('[data-slot="comment-text-layer"]')).toBeNull();
  });

  it('leaves a selection inside a viewer that makes its own text marks to that viewer', () => {
    // The PDF viewer sends a pdf-quad itself; a source-less text-quote from the pane
    // around it, on a touch or keyboard selection, was resolved against the wrong file.
    const marks: DocumentAnchor[] = [];
    const { getByTestId } = render(
      <Session.Provider
        value={{
          open: true,
          active: true,
          mode: 'text',
          marks: [],
          setEditing: () => undefined,
          addMark: (anchor: DocumentAnchor) => {
            marks.push(anchor);
            return 'S1';
          },
        }}
      >
        <CommentCapture>
          <div data-comment-text="own">
            <p data-testid="pdf-text">The drain no longer competes with checkpoint writes.</p>
          </div>
        </CommentCapture>
      </Session.Provider>,
    );
    const words = getByTestId('pdf-text').firstChild!;
    const range = document.createRange();
    range.setStart(words, 4);
    range.setEnd(words, 9);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
    fireEvent.touchEnd(getByTestId('pdf-text'));
    fireEvent.keyUp(getByTestId('pdf-text'), { shiftKey: true });
    fireEvent.mouseUp(getByTestId('pdf-text'));
    expect(marks).toEqual([]);
  });
});
