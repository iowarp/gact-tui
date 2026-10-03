import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { A2uiRegionCaptureProvider } from './a2ui-region-capture';
import { SurfaceToolbar } from './surface-toolbar';

afterEach(cleanup);

describe('region capture mode', () => {
  it('toggles with the camera and exits when another surface tool is used', async () => {
    const user = userEvent.setup();
    render(<A2uiRegionCaptureProvider allowDemoCapture surface={{ id: 'surface', revision: 1, messages: [] }}>
      <section className="group" data-slot="a2ui-raster-viewport">
        <button type="button">Box select</button>
        <SurfaceToolbar capabilities={{ captureComponentId: 'raster', onCopy: () => true }} floating={false} />
        <div data-slot="a2ui-raster-surface" />
      </section>
    </A2uiRegionCaptureProvider>);

    const camera = screen.getByRole('button', { name: 'Capture labelled regions' });
    await user.click(camera);
    expect(camera).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(camera);
    expect(camera).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'false');

    await user.click(camera);
    await user.click(screen.getByRole('button', { name: 'Box select' }));
    expect(camera).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'false');
  });
});
