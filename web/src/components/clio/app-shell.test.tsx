import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClioAppShell } from './app-shell';

vi.mock('@/tauri/menu-actions', () => ({
  useMenuAction: vi.fn(),
}));

afterEach(cleanup);

function installMatchMedia(matches: (query: string) => boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn((query: string): MediaQueryList => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
      matches: matches(query),
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    })),
    writable: true,
  });
}

function renderShell() {
  render(
    <ClioAppShell
      contextBar={<span>Context</span>}
      navigation={<nav>Navigation</nav>}
      statusStrip={<span>Status</span>}
      workbench={<aside aria-label="Workspace canvas">Canvas content</aside>}
      workbenchRevealKey="resource-1"
    >
      <span>Conversation</span>
    </ClioAppShell>,
  );
}

describe('ClioAppShell responsive workbench', () => {
  it('uses the sheet workbench at compact desktop widths', () => {
    installMatchMedia((query) => query === '(min-width: 768px)');

    renderShell();

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Workspace canvas' })).toBeVisible();
    expect(screen.queryByRole('separator', { name: 'Resize workspace canvas' })).toBeNull();
  });

  it('uses the resizable workbench when the viewport is wide enough', () => {
    installMatchMedia((query) => query.startsWith('(min-width:'));

    renderShell();

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('separator', { name: 'Resize workspace canvas' })).toBeVisible();
    expect(screen.getByRole('complementary', { name: 'Workspace canvas' })).toBeVisible();
  });
});
