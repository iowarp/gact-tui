import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ClioAppShell } from './app-shell';

vi.mock('@/tauri/menu-actions', () => ({
  useMenuAction: vi.fn(),
}));

afterEach(cleanup);

function installMatchMedia(matches: (query: string) => boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(
      (query: string): MediaQueryList => ({
        addEventListener: vi.fn(),
        addListener: vi.fn(),
        dispatchEvent: vi.fn(() => false),
        matches: matches(query),
        media: query,
        onchange: null,
        removeEventListener: vi.fn(),
        removeListener: vi.fn(),
      }),
    ),
    writable: true,
  });
}

function renderShell() {
  return render(
    <TooltipProvider>
      <ClioAppShell
        contextBar={<span>Context</span>}
        navigation={<nav>Navigation</nav>}
        statusStrip={<span>Status</span>}
        workbench={<aside aria-label="Workspace canvas">Canvas content</aside>}
        workbenchRevealKey="resource-1"
      >
        <span>Conversation</span>
      </ClioAppShell>
    </TooltipProvider>,
  );
}

describe('ClioAppShell responsive workbench', () => {
  it('keeps status and toolbar slots apart when both carry the conversation key', () => {
    installMatchMedia((query) => query.startsWith('(min-width:'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    // The workspace page keys every conversation region by endpoint and conversation.
    const sessionKey = 'http://127.0.0.1:8787:sess_be05d676c7f7';
    try {
      render(
        <TooltipProvider>
          <ClioAppShell
            contextBar={<span key={sessionKey}>Context</span>}
            navigation={<nav>Navigation</nav>}
            statusStrip={<span key={sessionKey}>Status</span>}
            toolbarActions={<span key={sessionKey}>Observability</span>}
            workbench={<aside key={sessionKey}>Canvas content</aside>}
          >
            <span key={sessionKey}>Conversation</span>
          </ClioAppShell>
        </TooltipProvider>,
      );
      expect(screen.getAllByText('Status')).toHaveLength(1);
      expect(screen.getAllByText('Observability')).toHaveLength(1);
      const duplicateKeyWarnings = error.mock.calls.filter((call) =>
        call.some((arg) => typeof arg === 'string' && arg.includes('same key')),
      );
      expect(duplicateKeyWarnings).toEqual([]);
    } finally {
      error.mockRestore();
    }
  });

  it('shows only the conversation when a draft has no canvas or status', () => {
    installMatchMedia((query) => query.startsWith('(min-width:'));
    const { container } = render(
      <ClioAppShell
        contextBar="New conversation"
        navigation={<nav>Navigation</nav>}
        statusStrip={null}
        workbench={null}
      >
        <span>Draft composer</span>
      </ClioAppShell>,
    );
    expect(screen.getByText('Draft composer')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Open workspace canvas' })).toBeNull();
    expect(screen.queryByRole('separator', { name: 'Resize workspace canvas' })).toBeNull();
    expect(container.querySelector('footer')).toBeNull();
  });
  it('fills its title-bar-constrained parent without adding another viewport height', () => {
    installMatchMedia((query) => query === '(min-width: 768px)');

    const { container } = renderShell();

    expect(container.querySelector('[data-slot="sidebar-wrapper"]')).toHaveClass(
      'h-full',
      'min-h-0',
    );
    expect(container.querySelector('.h-dvh')).toBeNull();
  });

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
