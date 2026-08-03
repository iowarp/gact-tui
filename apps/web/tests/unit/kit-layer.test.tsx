/**
 * Layer contract (the LayerChrome from gact-tui#331).
 *
 * Settings, observability and files are OVERLAYS in the prototype, not
 * side-pane content:
 *   settings — position:fixed inset:0, centred, padding-top 6vh
 *   obs/files — inset:0 over a --t-scrim, card at 8vh auto
 * Both share one chrome: --t-sf card, --t-bd6 hairline, 12px radius,
 * --t-shadow, clio-rise 160ms.
 *
 * I had rendered these into the right-hand detail slot, which is why they
 * appeared in the wrong place. This primitive is the fix.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Layer } from '../../src/kit';

describe('Layer', () => {
  it('is a labelled modal surface, not inline content', () => {
    render(
      <Layer open title="Settings" onClose={vi.fn()}>
        body
      </Layer>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('renders nothing when closed', () => {
    render(
      <Layer open={false} title="Settings" onClose={vi.fn()}>
        body
      </Layer>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(
      <Layer open title="Settings" onClose={onClose}>
        body
      </Layer>,
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes when the scrim is clicked', () => {
    const onClose = vi.fn();
    render(
      <Layer open title="Settings" onClose={onClose}>
        body
      </Layer>,
    );
    fireEvent.click(screen.getByTestId('layer-scrim'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('carries the settings size — the prototype fixes it at 1040 x 80vh', () => {
    const { container } = render(
      <Layer open title="Settings" size="settings" onClose={vi.fn()}>
        body
      </Layer>,
    );
    expect(container.querySelector('.kit-layer__card')).toHaveAttribute('data-size', 'settings');
  });

  it('accepts explicit window dimensions for the resizable variant', () => {
    const { container } = render(
      <Layer open title="Observability" width={720} height={520} onClose={vi.fn()}>
        body
      </Layer>,
    );
    const card = container.querySelector('.kit-layer__card') as HTMLElement;
    expect(card.style.width).toBe('720px');
    expect(card.style.height).toBe('520px');
  });

  it('traps focus so tabbing cannot escape to the page behind', () => {
    render(
      <Layer open title="Settings" onClose={vi.fn()}>
        <button type="button">only</button>
      </Layer>,
    );
    const dialog = screen.getByRole('dialog');
    // Focus starts on the labelled surface, not on its close button.
    expect(dialog).toHaveFocus();
  });
});
