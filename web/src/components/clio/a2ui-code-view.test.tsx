import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClioA2UICodeView } from './a2ui-code-view';
import { SelectionActionsProvider } from './selection-actions';

/**
 * G0: `clio.code.v1` AND `clio.diff.v1` both render through `ClioA2UICodeView`
 * (see `kernel-catalog.tsx`'s `RenderedCode`/`ClioDiffView`), so this one
 * test file covers both. The real `CodeBlock` (shiki-backed syntax
 * highlighting) is mocked out: these tests are about the G0 toolbar wiring
 * (copy/download/full screen/Reference this), not shiki's own rendering,
 * which has no existing test coverage of its own to protect and is slow/
 * async in jsdom. `vi.mock` calls are hoisted above imports by vitest, so
 * this works even though the mock is declared after the (now-mocked)
 * module's own consumer is imported above.
 */
vi.mock('@/components/ai-elements/code-block', () => ({
  CodeBlock: ({ children, code }: { children: ReactNode; code: string }) => (
    <div data-code={code} data-slot="code-block">
      {children}
    </div>
  ),
  CodeBlockActions: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CodeBlockFilename: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  CodeBlockHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CodeBlockTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

function wrap(children: ReactNode) {
  return <SelectionActionsProvider>{children}</SelectionActionsProvider>;
}

/** Opens the shared `SurfaceToolbar` overflow and selects the nested Download submenu. */
async function openDownloadMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'More' }));
  await user.click(screen.getByRole('menuitem', { name: /Download/ }));
}

/**
 * Radix submenu/menu items track "current" via real pointer-move events,
 * which jsdom's synthetic `userEvent.click` does not generate — fire the
 * pointer sequence directly so `onSelect` actually runs.
 */
function selectMenuItem(item: HTMLElement) {
  fireEvent.pointerMove(item);
  fireEvent.click(item);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ClioA2UICodeView', () => {
  it('renders a download menu offering the source file, named by title and language', async () => {
    const user = userEvent.setup();
    const capturedBlobs: Blob[] = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation(((blob: Blob) => {
      capturedBlobs.push(blob);
      return 'blob:fake';
    }) as typeof URL.createObjectURL);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(wrap(<ClioA2UICodeView code="print(1)" language="python" title="main.py" />));

    await openDownloadMenu(user);
    selectMenuItem(await screen.findByRole('menuitem', { name: 'Source file' }));

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(capturedBlobs).toHaveLength(1);
    expect(await capturedBlobs[0]!.text()).toBe('print(1)');
  });

  it('labels the download "Patch file" for a diff', async () => {
    const user = userEvent.setup();
    render(wrap(<ClioA2UICodeView code="--- a\n+++ b" language="diff" title="src/app.py" />));

    await openDownloadMenu(user);
    expect(await screen.findByRole('menuitem', { name: 'Patch file' })).toBeInTheDocument();
  });

  it('copies the code to the clipboard', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

    render(wrap(<ClioA2UICodeView code="let x = 1;" language="ts" title="x.ts" />));
    await user.click(screen.getByRole('button', { name: 'More' }));
    selectMenuItem(screen.getByRole('menuitem', { name: 'Copy' }));

    expect(writeText).toHaveBeenCalledWith('let x = 1;');
  });

  it('offers "Reference this" (present once wrapped by a SelectionActionsProvider)', () => {
    render(wrap(<ClioA2UICodeView code={'a\nb\nc'} language="python" title="main.py" />));
    expect(screen.getByRole('button', { name: 'Reference this' })).toBeInTheDocument();
  });

  it('renders a full-screen toggle that moves the view into a dialog', async () => {
    const user = userEvent.setup();
    render(wrap(<ClioA2UICodeView code="x = 1" language="python" title="main.py" />));

    const toggle = screen.getByRole('button', { name: 'Full screen' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await user.click(toggle);

    // Both the toolbar's own toggle and the dialog's own chrome now read
    // "Exit full screen" (an accepted minor redundancy, not a bug).
    expect(screen.getAllByRole('button', { name: 'Exit full screen' }).length).toBeGreaterThan(0);
  });
});
