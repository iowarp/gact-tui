import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useReferenceThisSelectionAction } from '@/hooks/use-reference-this-selection-action';
import type { ComposerAnnotation } from '@/lib/composer-annotations';
import { ClioComposerAnnotations } from './composer-annotations';
import { SelectionActionsProvider } from './selection-actions';

/**
 * G0: `clio.mermaid.v1` AND `clio.workflow.v1` both render through
 * `ClioMermaidDiagram` (`a2ui-mermaid-catalog.tsx` / `a2ui-workflow-catalog.tsx`
 * each thread their own `dataUri` through to it), so this one test file
 * covers the shared toolbar wiring both get: download (SVG/PNG/source), copy,
 * full screen, and Reference this.
 *
 * `MermaidPreview` (the real mermaid.js render, already covered one level
 * down by `mermaid.test.tsx` and `zoom-pan.test.ts`) and `CodeBlock`
 * (shiki-backed, slow/async in jsdom) are stubbed, the same way
 * `a2ui-code-view.test.tsx` stubs `CodeBlock` — these tests are about the G0
 * toolbar this component owns, not the renderers underneath it.
 */

const SAMPLE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60"><text>diagram</text></svg>';

vi.mock('@/components/mermaidcn/mermaid-preview', () => ({
  MermaidPreview: ({
    chart,
    onSvgOutputChange,
  }: {
    chart: string;
    onSvgOutputChange: (svg: string) => void;
  }) => {
    // Stands in for a successful mermaid.js render: reports a fixed, valid
    // SVG synchronously, so the toolbar's svgOutput-gated formats are ready
    // by the time `render()` returns.
    useEffect(() => {
      onSvgOutputChange(SAMPLE_SVG);
    }, [chart, onSvgOutputChange]);
    return <div data-slot="mermaid-preview">{chart}</div>;
  },
}));

vi.mock('@/components/ai-elements/code-block', () => ({
  CodeBlock: ({ children, code }: { children: ReactNode; code: string }) => (
    <div data-code={code} data-slot="code-block">
      {children}
    </div>
  ),
  CodeBlockFilename: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  CodeBlockHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CodeBlockTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const { ClioMermaidDiagram } = await import('./mermaid-diagram');

// Single-line, so the rendered text matches this constant exactly — a
// newline in the DOM text would otherwise be whitespace-normalized by
// `screen.getByText`'s matcher while this raw string is not.
const SOURCE = 'flowchart LR; a[Fetch] --> b[Process];';

function wrap(children: ReactNode) {
  return <SelectionActionsProvider>{children}</SelectionActionsProvider>;
}

/** Opens the shared `SurfaceToolbar` overflow and the nested Download submenu. */
async function openDownloadMenu(user: ReturnType<typeof userEvent.setup>) {
  // Radix can still be closing the prior nested menu after a download.
  await user.keyboard('{Escape}');
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

/** Mirrors `a2ui-chart.test.tsx`'s harness: attaches "Reference this" clicks to a real composer-annotations list. */
function ComposerHarness({ children }: { children: ReactNode }) {
  const [annotations, setAnnotations] = useState<readonly ComposerAnnotation[]>([]);
  useReferenceThisSelectionAction({ annotations, onAnnotationsChange: setAnnotations }, () => {});
  return (
    <>
      {children}
      <ClioComposerAnnotations
        annotations={annotations}
        onRemove={(gone) => setAnnotations(annotations.filter((item) => item !== gone))}
      />
    </>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ClioMermaidDiagram', () => {
  it('shows the rendered diagram by default and switches to the Mermaid source view', async () => {
    const user = userEvent.setup();
    render(wrap(<ClioMermaidDiagram source={SOURCE} title="Pipeline" />));

    expect(screen.getByText('Pipeline')).toBeInTheDocument();
    expect(screen.getByText(SOURCE)).toBeInTheDocument(); // the mocked MermaidPreview's own chart text
    expect(screen.queryByText('Mermaid source')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.click(screen.getByRole('menuitem', { name: 'Diagram view' }));
    const sourceOption = screen.getByRole('menuitemradio', { name: 'Mermaid source' });
    fireEvent.pointerMove(sourceOption);
    fireEvent.click(sourceOption);

    expect(screen.getByText('Mermaid source')).toBeInTheDocument();
    expect(document.querySelector('[data-code]')).toHaveAttribute('data-code', SOURCE);

    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.click(screen.getByRole('menuitem', { name: 'Diagram view' }));
    const renderOption = screen.getByRole('menuitemradio', { name: 'Rendered diagram' });
    fireEvent.pointerMove(renderOption);
    fireEvent.click(renderOption);
    expect(screen.queryByText('Mermaid source')).not.toBeInTheDocument();
  });

  it('offers SVG, PNG, and Mermaid source downloads, each producing the right file', async () => {
    const user = userEvent.setup();
    const capturedBlobs: Blob[] = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation(((blob: Blob) => {
      capturedBlobs.push(blob);
      return 'blob:fake';
    }) as typeof URL.createObjectURL);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    // The PNG format rasterizes `svgOutput` via canvas — the same
    // canvas/Image stand-ins `mermaid-export.test.ts` uses for `svgToPngBlob`.
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function toBlob(
      this: HTMLCanvasElement,
      callback,
    ) {
      callback(new Blob(['png-bytes'], { type: 'image/png' }));
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => ({
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: '',
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext);
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', FakeImage as unknown as typeof Image);

    render(wrap(<ClioMermaidDiagram source={SOURCE} title="Pipeline" />));

    await openDownloadMenu(user);
    // Not `.toBeEnabled()`: a Radix menu item is a `div[role=menuitem]`, not a
    // form control, so jest-dom's form-control disabled check never applies —
    // Radix's own `data-disabled` attribute is the real signal here.
    expect(await screen.findByRole('menuitem', { name: 'SVG image' })).not.toHaveAttribute(
      'data-disabled',
    );
    expect(screen.getByRole('menuitem', { name: 'PNG image' })).not.toHaveAttribute(
      'data-disabled',
    );
    selectMenuItem(screen.getByRole('menuitem', { name: 'SVG image' }));
    expect(await capturedBlobs.at(-1)!.text()).toBe(SAMPLE_SVG);

    await openDownloadMenu(user);
    selectMenuItem(await screen.findByRole('menuitem', { name: 'Mermaid source' }));
    expect(await capturedBlobs.at(-1)!.text()).toBe(SOURCE);

    await openDownloadMenu(user);
    selectMenuItem(await screen.findByRole('menuitem', { name: 'PNG image' }));
    // PNG rasterization has a few more async hops (loading the SVG into an
    // `<img>`, then the canvas) than the synchronous SVG/source downloads.
    await waitFor(() => expect(capturedBlobs.at(-1)?.type).toBe('image/png'));
  });

  it("copies the Mermaid source to the clipboard through the toolbar's one copy affordance", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    // `Object.defineProperty`, not `Object.assign`: `userEvent.setup()` (used
    // by the earlier tests in this file) installs its own getter-only
    // `navigator.clipboard` stub, and a plain assignment would throw trying
    // to invoke a setter that stub never defines.
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

    render(wrap(<ClioMermaidDiagram source={SOURCE} title="Pipeline" />));
    await user.click(screen.getByRole('button', { name: 'More' }));
    selectMenuItem(screen.getByRole('menuitem', { name: 'Copy source' }));

    expect(writeText).toHaveBeenCalledWith(SOURCE);
    // Exactly one obvious way to copy: the Source view's own header carries
    // no second copy button now that the toolbar provides it.
    expect(screen.queryByRole('button', { name: /copy mermaid source/iu })).not.toBeInTheDocument();
  });

  it('moves the diagram into a full-screen dialog and back, without duplicating it', async () => {
    const user = userEvent.setup();
    render(wrap(<ClioMermaidDiagram source={SOURCE} title="Pipeline" />));

    const toggle = screen.getByRole('button', { name: 'Full screen' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await user.click(toggle);

    const dialog = screen.getByRole('dialog', { name: 'Pipeline' });
    expect(within(dialog).getByText(SOURCE)).toBeInTheDocument();
    expect(screen.getAllByText(SOURCE)).toHaveLength(1); // the SAME content, never duplicated

    await user.click(within(dialog).getByRole('button', { name: 'Exit full screen' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText(SOURCE)).toBeInTheDocument(); // back inline
  });

  it('"Reference this" attaches the diagram, naming the source artifact when it has one', async () => {
    const user = userEvent.setup();
    render(
      wrap(
        <ComposerHarness>
          <ClioMermaidDiagram
            dataUri="artifact://artifact_pipeline01"
            source={SOURCE}
            title="Pipeline"
          />
        </ComposerHarness>,
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Reference this' }));

    const attached = screen.getByRole('list', { name: 'Attached selections' });
    expect(attached).toHaveTextContent('Pipeline');
    expect(attached).toHaveTextContent('the whole diagram');

    await user.click(screen.getByRole('button', { name: /Show the full .* reference/u }));
    const popover = await screen.findByText('Sent with your next message, exactly as shown below.');
    const popoverBody = popover.closest('[data-slot="popover-content"]') as HTMLElement;
    expect(popoverBody).toHaveTextContent('artifact_pipeline01');
  });

  it('"Reference this" names an inline diagram with no dataUri by its source, not a blank label', async () => {
    const user = userEvent.setup();
    render(
      wrap(
        <ComposerHarness>
          <ClioMermaidDiagram source={SOURCE} />
        </ComposerHarness>,
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Reference this' }));

    await user.click(screen.getByRole('button', { name: /Show the full .* reference/u }));
    const popover = await screen.findByText('Sent with your next message, exactly as shown below.');
    const popoverBody = popover.closest('[data-slot="popover-content"]') as HTMLElement;
    expect(popoverBody).toHaveTextContent('inline diagram');
    expect(popoverBody).toHaveTextContent('flowchart LR'); // the query JSON names the diagram by its source
  });
});
