import { describe, expect, it } from 'vitest';
import { APP_TAB_SHARE, appTabShare } from './workbench-app-width';

describe('appTabShare', () => {
  it('opens an app tab at half a wide window when the person never sized the canvas', () => {
    expect(appTabShare(0.4, 1440, false)).toBe(APP_TAB_SHARE);
    // 720 px leaves the frame wider than 600 px, where some views switch layouts.
    expect(APP_TAB_SHARE * 1440).toBeGreaterThan(600 + 48);
  });

  it('keeps the width the person chose', () => {
    expect(appTabShare(0.3, 1440, true)).toBe(0.3);
    expect(appTabShare(0.65, 1440, false)).toBe(0.65);
  });

  it('keeps 400 px of conversation beside the folded left bar', () => {
    const share = appTabShare(0.4, 900, false);
    expect(900 - 56 - share * 900).toBeGreaterThanOrEqual(400);
    expect(share).toBeGreaterThanOrEqual(0.4);
  });

  it('never narrows a canvas when the window has no room', () => {
    expect(appTabShare(0.4, 600, false)).toBe(0.4);
  });
});
