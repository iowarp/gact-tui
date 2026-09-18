import { beforeEach, describe, expect, it } from 'vitest';
import { useDesktopTitleStore } from './desktop-title';

beforeEach(() => {
  useDesktopTitleStore.getState().clearTitleContext();
});

describe('useDesktopTitleStore', () => {
  it('starts with an empty context, so the title bar falls back to the product name', () => {
    expect(useDesktopTitleStore.getState().context).toEqual({});
  });

  it('replaces the whole context on setTitleContext, not a per-field merge', () => {
    useDesktopTitleStore
      .getState()
      .setTitleContext({ blueprint: 'EarthScope', session: 'NDP demo', workspace: 'flat-ndp' });
    expect(useDesktopTitleStore.getState().context).toEqual({
      blueprint: 'EarthScope',
      session: 'NDP demo',
      workspace: 'flat-ndp',
    });

    useDesktopTitleStore.getState().setTitleContext({ session: 'Second session' });
    expect(useDesktopTitleStore.getState().context).toEqual({ session: 'Second session' });
  });

  it('resets to empty on clearTitleContext', () => {
    useDesktopTitleStore.getState().setTitleContext({ session: 'NDP demo', workspace: 'flat-ndp' });
    useDesktopTitleStore.getState().clearTitleContext();
    expect(useDesktopTitleStore.getState().context).toEqual({});
  });
});
