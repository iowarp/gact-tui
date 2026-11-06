import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClioComposerAnnotations } from './composer-annotations';
import { DataReferenceThisButton } from './data-reference-this-button';
import { SelectionActionsProvider } from './selection-actions';
import { useReferenceThisSelectionAction } from '@/hooks/use-reference-this-selection-action';
import type { CommentAttachment } from '@clio/core/v3';
import { SurfaceFullScreenHost, useSurfaceFullScreen } from './surface-full-screen';

afterEach(cleanup);

function Page({
  buildReference,
}: {
  buildReference: () => { title: string; summary: string; markdown: string };
}) {
  const [annotations, setAnnotations] = useState<readonly CommentAttachment[]>([]);
  const [focused, setFocused] = useState(0);
  useReferenceThisSelectionAction({ annotations, onAnnotationsChange: setAnnotations }, () =>
    setFocused((count) => count + 1),
  );
  return (
    <>
      <DataReferenceThisButton buildReference={buildReference} />
      <ClioComposerAnnotations
        annotations={annotations}
        onChange={setAnnotations}
      />
      <output data-testid="sent-comments" hidden>{JSON.stringify(annotations)}</output>
      <output data-testid="focus">{focused}</output>
    </>
  );
}

describe('DataReferenceThisButton', () => {
  it('references selected text with its surface context and clears the browser selection afterwards', async () => {
    render(
      <SelectionActionsProvider>
        <section className="group">
          <p>First step then final step</p>
          <Page
            buildReference={() => ({
              title: 'Flowchart',
              summary: 'whole diagram',
              markdown: 'Artifact: artifact://flow',
            })}
          />
        </section>
      </SelectionActionsProvider>,
    );
    const text = screen.getByText('First step then final step').firstChild!;
    const range = document.createRange();
    range.setStart(text, 16);
    range.setEnd(text, 26);
    window.getSelection()!.addRange(range);
    fireEvent(document, new Event('selectionchange'));
    await userEvent.click(screen.getByRole('button', { name: 'Reference selected text' }));
    expect(window.getSelection()!.isCollapsed).toBe(true);
    expect(screen.getByRole('list', { name: 'Attached comments' })).toHaveTextContent(
      'Selected text: final step',
    );
    // The full reference travels to the agent as the lines under the mark.
    const sent = screen.getByTestId('sent-comments');
    expect(sent).toHaveTextContent('Artifact: artifact://flow');
    expect(sent).toHaveTextContent('final step');
  });
  it('attaches the built reference to the composer and focuses it, via the shared selection-action registry', async () => {
    const user = userEvent.setup();
    const buildReference = vi.fn(() => ({
      markdown: '**Depth vs. magnitude chart** — artifact_earthquakes01\n\nZone: 23 of 270 rows.',
      summary: '23 of 270 rows',
      title: 'Depth vs. magnitude chart',
    }));
    render(
      <SelectionActionsProvider>
        <Page buildReference={buildReference} />
      </SelectionActionsProvider>,
    );

    expect(buildReference).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Reference this' }));

    expect(buildReference).toHaveBeenCalledTimes(1);
    const attached = screen.getByRole('list', { name: 'Attached comments' });
    expect(attached).toHaveTextContent('Depth vs. magnitude chart');
    expect(attached).toHaveTextContent('23 of 270 rows');
    expect(screen.getByTestId('focus')).toHaveTextContent('1');
  });

  it('shows the plain summary on the card, never the flattened full markdown block (coordinator review)', async () => {
    const user = userEvent.setup();
    const buildReference = vi.fn(() => ({
      markdown:
        '**Depth vs. magnitude chart** — artifact_earthquakes01\n\nZone: 172 of 500 rows — depth 6.8–14.9.\n\n| id | depth |\n| --- | --- |\n| eq0001 | 7.1 |\n\n```json\n{"dataUri":"artifact://x"}\n```',
      summary: '172 of 500 rows — depth 6.8–14.9',
      title: 'Depth vs. magnitude chart',
    }));
    render(
      <SelectionActionsProvider>
        <Page buildReference={buildReference} />
      </SelectionActionsProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Reference this' }));

    const attached = screen.getByRole('list', { name: 'Attached comments' });
    // The card's own text never contains raw markdown syntax.
    expect(attached).toHaveTextContent('172 of 500 rows — depth 6.8–14.9');
    expect(attached.textContent).not.toContain('**');
    expect(attached.textContent).not.toContain('```');
    expect(attached.textContent).not.toContain('|');

    // The full block, its table included, travels as the lines under the mark.
    expect(screen.getByTestId('sent-comments')).toHaveTextContent('eq0001');
  });

  it('renders nothing outside a SelectionActionsProvider, rather than crashing the surface', () => {
    render(
      <DataReferenceThisButton
        buildReference={() => ({ markdown: 'x', summary: 'x', title: 'x' })}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Reference this' })).not.toBeInTheDocument();
  });

  it('closes the expanded view before attaching one reference and focusing the composer', async () => {
    const user = userEvent.setup();
    function ExpandedPage() {
      const [fullscreen, setFullscreen] = useSurfaceFullScreen();
      const [annotations, setAnnotations] = useState<readonly CommentAttachment[]>([]);
      const [focused, setFocused] = useState(0);
      useReferenceThisSelectionAction({ annotations, onAnnotationsChange: setAnnotations }, () => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        setFocused((count) => count + 1);
      });
      return (
        <>
          <button type="button" onClick={() => setFullscreen(true)}>
            Expand
          </button>
          <SurfaceFullScreenHost
            fullscreen={fullscreen}
            onOpenChange={setFullscreen}
            title="Figure"
            headerExtra={
              <DataReferenceThisButton
                buildReference={() => ({
                  markdown: 'Figure reference',
                  summary: 'whole image',
                  title: 'Figure',
                })}
              />
            }
          >
            <span>Figure content</span>
          </SurfaceFullScreenHost>
          <ClioComposerAnnotations annotations={annotations} onChange={() => {}} />
          <output data-testid="focus">{focused}</output>
        </>
      );
    }
    render(
      <SelectionActionsProvider>
        <ExpandedPage />
      </SelectionActionsProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Expand' }));
    expect(screen.getByRole('dialog', { name: 'Figure' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Reference this' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Attached comments' })).toHaveTextContent('Figure');
    expect(screen.getByTestId('focus')).toHaveTextContent('1');
  });
});
