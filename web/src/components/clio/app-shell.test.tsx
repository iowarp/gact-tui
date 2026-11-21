import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useSidebar } from '@/components/ui/sidebar';
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

function installResizableMatchMedia(matches: (query: string, wide: boolean) => boolean) {
  let wide = true;
  const listeners = new Set<() => void>();
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn(
      (query: string): MediaQueryList =>
        ({
          get matches() {
            return matches(query, wide);
          },
          media: query,
          onchange: null,
          addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
          removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(() => false),
        }) as unknown as MediaQueryList,
    ),
  });
  return (next: boolean) =>
    act(() => {
      wide = next;
      for (const listener of [...listeners]) listener();
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

  it('does not turn an open pocket into a sheet over the conversation when the window narrows', () => {
    const resize = installResizableMatchMedia(
      (query, wide) => query.startsWith('(min-width:') && (wide || query === '(min-width: 768px)'),
    );

    renderShell();
    expect(screen.getByRole('separator', { name: 'Resize workspace canvas' })).toBeVisible();

    resize(false);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('Conversation')).toBeVisible();

    resize(true);
    expect(screen.getByRole('complementary', { name: 'Workspace canvas' })).toBeVisible();
  });

  it('reopens the person’s open left bar when the window widens after folding it', () => {
    document.cookie = 'sidebar_state=true; path=/';
    const resize = installResizableMatchMedia((query, wide) =>
      query === '(max-width: 1023px)'
        ? !wide
        : query.startsWith('(min-width:') && (wide || query === '(min-width: 768px)'),
    );
    function NavigationProbe() {
      return <nav>{useSidebar().open ? 'Bar open' : 'Bar folded'}</nav>;
    }
    render(
      <TooltipProvider>
        <ClioAppShell
          contextBar={<span>Context</span>}
          navigation={<NavigationProbe />}
          statusStrip={null}
          workbench={null}
        >
          <span>Conversation</span>
        </ClioAppShell>
      </TooltipProvider>,
    );
    expect(screen.getByText('Bar open')).toBeInTheDocument();

    resize(false);
    expect(screen.getByText('Bar folded')).toBeInTheDocument();
    // The window's fold is not the person's choice, so a reload keeps the open bar.
    expect(document.cookie).toContain('sidebar_state=true');

    resize(true);
    expect(screen.getByText('Bar open')).toBeInTheDocument();
  });

  it('reopens the left bar after the phone layout replaced it, when the window folded it', () => {
    document.cookie = 'sidebar_state=true; path=/';
    // Narrow is a phone here: under 768px the shell swaps out the desktop layout.
    const resize = installResizableMatchMedia((query, wide) =>
      query.startsWith('(max-width:') ? !wide : query.startsWith('(min-width:') && wide,
    );
    function NavigationProbe() {
      return <nav>{useSidebar().open ? 'Bar open' : 'Bar folded'}</nav>;
    }
    render(
      <TooltipProvider>
        <ClioAppShell
          contextBar={<span>Context</span>}
          navigation={<NavigationProbe />}
          statusStrip={null}
          workbench={null}
        >
          <span>Conversation</span>
        </ClioAppShell>
      </TooltipProvider>,
    );
    expect(screen.getByText('Bar open')).toBeInTheDocument();

    resize(false);
    expect(screen.queryByRole('separator', { name: 'Resize navigation' })).toBeNull();

    resize(true);
    expect(screen.getByRole('separator', { name: 'Resize navigation' })).toBeInTheDocument();
    expect(screen.getByText('Bar open')).toBeInTheDocument();
    expect(document.cookie).toContain('sidebar_state=true');
  });

  it('keeps the left bar folded after widening when the person folded it while narrow', () => {
    document.cookie = 'sidebar_state=true; path=/';
    const resize = installResizableMatchMedia((query, wide) =>
      query === '(max-width: 1023px)'
        ? !wide
        : query.startsWith('(min-width:') && (wide || query === '(min-width: 768px)'),
    );
    function NavigationProbe() {
      const { open, setOpen } = useSidebar();
      return (
        <nav>
          <button onClick={() => setOpen(!open)} type="button">
            {open ? 'Bar open' : 'Bar folded'}
          </button>
        </nav>
      );
    }
    render(
      <TooltipProvider>
        <ClioAppShell
          contextBar={<span>Context</span>}
          navigation={<NavigationProbe />}
          statusStrip={null}
          workbench={null}
        >
          <span>Conversation</span>
        </ClioAppShell>
      </TooltipProvider>,
    );

    resize(false);
    act(() => screen.getByText('Bar folded').click());
    act(() => screen.getByText('Bar open').click());
    resize(true);
    expect(screen.getByText('Bar folded')).toBeInTheDocument();
  });
});
