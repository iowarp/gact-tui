import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { A2uiRegionCaptureContext } from './a2ui-region-capture';
import type { CaptureTarget } from './a2ui-region-evidence';
import { DashboardCaptureTargetContext } from './dashboard-presentation';
import { SurfaceToolbar } from './surface-toolbar';

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => ({}) }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8790' } }),
}));

afterEach(cleanup);

function chart(whole: CaptureTarget | undefined, start: (target: CaptureTarget) => void) {
  return render(
    <A2uiRegionCaptureContext.Provider value={{ allowed: true, start }}>
      <DashboardCaptureTargetContext.Provider value={whole}>
        <div className="group" data-slot="a2ui-chart">
          <h3>Temperature over time</h3>
          <div data-slot="a2ui-chart-view" />
          <SurfaceToolbar capabilities={{ captureComponentId: 'chart_1', onCopy: () => true }} />
        </div>
      </DashboardCaptureTargetContext.Provider>
    </A2uiRegionCaptureContext.Provider>,
  );
}

describe('a chart inside a dashboard (FP-D6)', () => {
  it('says its capture marks this chart, and carries the whole dashboard as the wider choice', async () => {
    const start = vi.fn();
    const whole: CaptureTarget = {
      element: document.createElement('article'),
      title: 'Run summary',
      componentId: 'root',
    };
    chart(whole, start);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Mark regions in this chart' }));
    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({ componentId: 'chart_1', wider: whole }),
    );
  });

  it('keeps the plain capture outside a dashboard', async () => {
    const start = vi.fn();
    chart(undefined, start);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Capture labelled regions' }));
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ wider: undefined }));
  });
});
