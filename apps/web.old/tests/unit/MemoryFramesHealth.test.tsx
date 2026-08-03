import { render, screen, cleanup, within } from '@solidjs/testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import type { HealthSnapshot, MemoryStats } from '@clio/core';
import {
  MemoryHealthReadout,
  pressureTone,
  tokenPressureFraction,
} from '../../src/components/MemoryHealthReadout.js';
import { SubsystemHealth } from '../../src/components/SubsystemHealth.js';
import { FramesTab, frameItems } from '../../src/components/InspectorFrames.js';

afterEach(cleanup);

/**
 * v0.2 observability surfaces (SPEC §3.4 + §6.9 + §6.19): the web must surface
 * the memory cache hit-rate + session token-pressure, the per-item context-frame
 * inclusion list, and the integration-health pips — all of which the TUI shows
 * and the web previously dropped.
 */
describe('memory health readout', () => {
  it('derives the budget fraction from token_pressure, then retained/budget', () => {
    expect(tokenPressureFraction({ token_pressure: 0.42 })).toBeCloseTo(0.42);
    expect(tokenPressureFraction({ tokens_retained: 3000, tokens_budget: 4000 })).toBeCloseTo(0.75);
    expect(tokenPressureFraction({ tokens_retained: 3000, tokens_budget: null })).toBeNull();
    expect(tokenPressureFraction(undefined)).toBeNull();
  });

  it('prefers the backend threshold_state, then falls back to the fraction', () => {
    expect(pressureTone({ threshold_state: 'critical' })).toBe('err');
    expect(pressureTone({ threshold_state: 'warning' })).toBe('warn');
    expect(pressureTone(undefined, 0.95)).toBe('err');
    expect(pressureTone(undefined, 0.1)).toBe('ok');
  });

  it('renders the cache hit-rate and the session pressure bar', () => {
    const stats: MemoryStats = {
      cache: { hits: 87, misses: 13, hit_rate: 0.87, capacity: 1000 },
      session: {
        tokens_retained: 3584,
        tokens_budget: 4000,
        threshold_state: 'warning',
        compaction_recommended: true,
      },
    };
    render(() => <MemoryHealthReadout stats={stats} />);
    const root = screen.getByTestId('memory-health');
    expect(within(root).getByTestId('memory-health-cache').textContent).toContain('87%');
    expect(within(root).getByTestId('memory-health-state').textContent).toContain('warning');
    expect(within(root).getByTestId('memory-health-pressure').textContent).toContain('3,584');
    expect(within(root).getByTestId('memory-health-compact')).toBeTruthy();
    const bar = root.querySelector('.mem-health__bar-fill') as HTMLElement;
    expect(bar.style.width).toBe('90%'); // 3584/4000 -> 90%
  });

  it('renders nothing when there are no stats', () => {
    render(() => <MemoryHealthReadout stats={undefined} />);
    expect(screen.queryByTestId('memory-health')).toBeNull();
  });
});

describe('context frame per-item inclusion', () => {
  it('extracts items from a row or a loaded detail payload', () => {
    expect(frameItems({ id: 'f1', items: [{ kind: 'message' }] })).toHaveLength(1);
    expect(frameItems({ items: [{ kind: 'context_file' }] })).toHaveLength(1);
    expect(frameItems('raw string detail')).toHaveLength(0);
    expect(frameItems(undefined)).toHaveLength(0);
  });

  it('renders kind / reason / tokens and an excluded pip per item', async () => {
    render(() => (
      <FramesTab
        frames={[
          {
            id: 'frame-aaaaaaaaaaaa',
            status: 'completed',
            token_count: 512,
            items: [
              {
                kind: 'message',
                included: true,
                reason: 'recent turn',
                tokens_estimated: 120,
                role: 'user',
              },
              {
                kind: 'context_file',
                included: false,
                reason: 'over budget',
                tokens_estimated: 900,
                display_path: 'src/app.ts',
              },
            ],
          },
        ]}
      />
    ));
    // Expand the frame to reveal the item list.
    screen.getByTestId('inspector-frame-toggle-frame-aaaaaaaaaaaa').click();
    const list = await screen.findByTestId('inspector-frame-items-frame-aaaaaaaaaaaa');
    const items = within(list).getAllByTestId('inspector-frame-item');
    expect(items).toHaveLength(2);
    const [first, second] = items as [HTMLElement, HTMLElement];
    expect(first.textContent).toContain('message');
    expect(first.textContent).toContain('recent turn');
    expect(first.textContent).toContain('120t');
    expect(second.textContent).toContain('src/app.ts');
    expect(second.textContent).toContain('over budget');
    expect(second.classList.contains('inspector__frame-item--excluded')).toBe(true);
  });
});

describe('subsystem health indicator', () => {
  it('renders an overall chip plus a pip per integration', () => {
    const health: HealthSnapshot = {
      healthy: true,
      uptime_s: 1234,
      overall_status: 'degraded',
      integrations: [
        { name: 'api', status: 'ready' },
        { name: 'memory', status: 'ready' },
        { name: 'lm', status: 'degraded', detail: 'rate limited' },
      ],
    };
    render(() => <SubsystemHealth health={health} />);
    const root = screen.getByTestId('subsystem-health');
    expect(within(root).getByTestId('subsystem-health-overall').textContent).toContain('degraded');
    expect(within(root).getByTestId('subsystem-health-memory')).toBeTruthy();
    const lm = within(root).getByTestId('subsystem-health-lm');
    expect(lm.querySelector('.subhealth__pip--warn')).toBeTruthy();
  });

  it('renders nothing without a health snapshot', () => {
    render(() => <SubsystemHealth health={undefined} />);
    expect(screen.queryByTestId('subsystem-health')).toBeNull();
  });
});
