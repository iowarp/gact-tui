import { describe, expect, it } from 'vitest';
import { placeCommentEditor } from './comment-editor-placement';

const viewport = { width: 1440, height: 900 };
const size = { width: 416, height: 290 };
// The tray at the bottom right, as in a maximized view.
const tray = { left: 1270, top: 680, width: 256, height: 80 };

describe('placeCommentEditor', () => {
  it('keeps the editor below its mark when nothing is in the way', () => {
    expect(placeCommentEditor({ left: 400, top: 200 }, size, tray, viewport)).toEqual({
      left: 400,
      top: 200,
    });
  });

  it('moves an editor that would cover the tray to the tray’s left', () => {
    const placed = placeCommentEditor({ left: 866, top: 560 }, size, tray, viewport);
    expect(placed.left + size.width).toBeLessThanOrEqual(tray.left);
  });

  it('goes above the tray when there is no room to its left', () => {
    const narrow = { width: 600, height: 900 };
    const smallTray = { left: 300, top: 700, width: 256, height: 80 };
    const placed = placeCommentEditor({ left: 100, top: 600 }, size, smallTray, narrow);
    expect(placed.top + size.height).toBeLessThanOrEqual(smallTray.top);
  });
});
