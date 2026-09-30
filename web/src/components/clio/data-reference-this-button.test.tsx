import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClioComposerAnnotations } from './composer-annotations';
import { DataReferenceThisButton } from './data-reference-this-button';
import { SelectionActionsProvider } from './selection-actions';
import { useReferenceThisSelectionAction } from '@/hooks/use-reference-this-selection-action';
import type { ComposerAnnotation } from '@/lib/composer-annotations';

afterEach(cleanup);

function Page({ buildReference }: { buildReference: () => { title: string; markdown: string } }) {
  const [annotations, setAnnotations] = useState<readonly ComposerAnnotation[]>([]);
  const [focused, setFocused] = useState(0);
  useReferenceThisSelectionAction({ annotations, onAnnotationsChange: setAnnotations }, () =>
    setFocused((count) => count + 1),
  );
  return (
    <>
      <DataReferenceThisButton buildReference={buildReference} />
      <ClioComposerAnnotations
        annotations={annotations}
        onRemove={(gone) => setAnnotations(annotations.filter((item) => item !== gone))}
      />
      <output data-testid="focus">{focused}</output>
    </>
  );
}

describe('DataReferenceThisButton', () => {
  it('attaches the built reference to the composer and focuses it, via the shared selection-action registry', async () => {
    const user = userEvent.setup();
    const buildReference = vi.fn(() => ({
      markdown: '**Depth vs. magnitude chart** — artifact_earthquakes01\n\nZone: 23 of 270 rows.',
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
    const attached = screen.getByRole('list', { name: 'Attached selections' });
    expect(attached).toHaveTextContent('Depth vs. magnitude chart');
    expect(attached).toHaveTextContent('23 of 270 rows');
    expect(screen.getByTestId('focus')).toHaveTextContent('1');
  });

  it('renders nothing outside a SelectionActionsProvider, rather than crashing the surface', () => {
    render(<DataReferenceThisButton buildReference={() => ({ markdown: 'x', title: 'x' })} />);
    expect(screen.queryByRole('button', { name: 'Reference this' })).not.toBeInTheDocument();
  });
});
