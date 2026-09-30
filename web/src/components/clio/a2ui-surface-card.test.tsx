import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ClioA2UISurfaceCard } from './a2ui-surface-card';
import { dataViewFlexStyle } from './data-view-layout';

afterEach(cleanup);

function renderCard() {
  return render(
    <ClioA2UISurfaceCard domId="surface-1" kind="Chart">
      <div data-testid="surface-body">Linked views</div>
    </ClioA2UISurfaceCard>,
  );
}

describe('ClioA2UISurfaceCard', () => {
  it('renders the surface inline, labeled, with a full screen control', () => {
    renderCard();

    const card = screen.getByRole('region', { name: 'Generated UI, Chart' });
    expect(within(card).getByTestId('surface-body')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open generated UI full screen' })).toBeEnabled();
  });

  it('moves the one surface into the dialog and back, never mounting two copies', () => {
    renderCard();

    fireEvent.click(screen.getByRole('button', { name: 'Open generated UI full screen' }));

    const dialog = screen.getByRole('dialog', { name: 'Generated UI, Chart' });
    expect(within(dialog).getByTestId('surface-body')).toBeInTheDocument();
    expect(screen.getAllByTestId('surface-body')).toHaveLength(1);
    expect(screen.getByText('Showing full screen.')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Exit full screen' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const card = screen.getByRole('region', { name: 'Generated UI, Chart' });
    expect(within(card).getByTestId('surface-body')).toBeInTheDocument();
    expect(screen.getAllByTestId('surface-body')).toHaveLength(1);
  });
});

describe('dataViewFlexStyle', () => {
  it('shares a row equally when the producer declares no weight', () => {
    expect(dataViewFlexStyle(undefined)).toEqual({ flex: '1 1 0%', minWidth: 0 });
  });

  it("applies a declared weight the way the kernel layout does", () => {
    expect(dataViewFlexStyle(2)).toEqual({ flex: '2', minWidth: 0, minHeight: 0 });
  });
});
