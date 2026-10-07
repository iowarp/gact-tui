import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createContext, useContext } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { useDesktopWorkspaceToolbar } from '@/store/desktop-workspace-toolbar';
import { DesktopWorkspaceToolbar } from './desktop-workspace-toolbar';

afterEach(() => {
  cleanup();
  useDesktopWorkspaceToolbar.setState({ host: null, navigationHost: null });
  Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
  document.querySelectorAll('[data-test-toolbar-host]').forEach((element) => element.remove());
});

describe('Workspace toolbar placement', () => {
  it('keeps navigation and actions in the browser header', () => {
    const { container } = render(
      <DesktopWorkspaceToolbar navigation={<button>Sidebar</button>}>
        <button>Session actions</button>
      </DesktopWorkspaceToolbar>,
    );
    expect(
      within(container.querySelector('header')!).getByRole('button', { name: 'Sidebar' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Session actions' })).toBeVisible();
  });

  it('places native controls in the title bar and keeps their route context and events', () => {
    Object.assign(window, { __TAURI_INTERNALS__: {} });
    const RouteContext = createContext('unavailable');
    let clicked = '';
    function SessionAction() {
      const session = useContext(RouteContext);
      return (
        <button
          onClick={() => {
            clicked = session;
          }}
        >
          Actions for {session}
        </button>
      );
    }
    const { container } = render(
      <RouteContext.Provider value="Opal 1">
        <DesktopWorkspaceToolbar navigation={<button>Sidebar</button>}>
          <SessionAction />
        </DesktopWorkspaceToolbar>
      </RouteContext.Provider>,
    );
    // Title bar registration may follow route mounting; the fallback never loses controls.
    expect(container.querySelector('header')).not.toBeNull();
    const host = document.createElement('div');
    const navigationHost = document.createElement('div');
    [host, navigationHost].forEach((element) => {
      element.setAttribute('data-test-toolbar-host', '');
      document.body.append(element);
    });
    act(() => useDesktopWorkspaceToolbar.setState({ host, navigationHost }));
    expect(container.querySelector('header')).toBeNull();
    expect(within(navigationHost).getByRole('button', { name: 'Sidebar' })).toBeVisible();
    fireEvent.click(within(host).getByRole('button', { name: 'Actions for Opal 1' }));
    expect(clicked).toBe('Opal 1');
    act(() => useDesktopWorkspaceToolbar.setState({ host: null, navigationHost: null }));
    expect(screen.getByRole('button', { name: 'Actions for Opal 1' })).toBeVisible();
  });
});
