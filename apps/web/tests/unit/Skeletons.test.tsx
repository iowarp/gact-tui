/**
 * W3 Tier-1 — skeleton loaders + motion.
 *
 * Loading states render content-shaped skeletons instead of spinners or
 * blank panes:
 *  - DiscoveryPage: skeleton card grid while the fetch is in flight
 *  - SessionsColumn: skeleton rows while /v1/sessions loads (no
 *    "No sessions yet" flash on first paint)
 *  - Transcript: skeleton conversation bubbles on session switch
 */
import { render, screen, cleanup } from '@solidjs/testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import { DiscoveryPage } from '../../src/components/DiscoveryPage.js';
import { SessionsColumn } from '../../src/components/SessionsColumn.js';
import { Transcript } from '../../src/components/Transcript.js';

afterEach(cleanup);

describe('DiscoveryPage skeleton', () => {
  it('renders skeleton cards while loading', () => {
    render(() => <DiscoveryPage icon="agents" title="Agents" loading={true} />);
    const loading = screen.getByTestId('dp-loading');
    expect(loading).toBeTruthy();
    expect(loading.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
  });

  it('renders content, not skeletons, when loaded', () => {
    render(() => (
      <DiscoveryPage icon="agents" title="Agents" loading={false}>
        <p>real content</p>
      </DiscoveryPage>
    ));
    expect(screen.queryByTestId('dp-loading')).toBeNull();
    expect(screen.getByText('real content')).toBeTruthy();
  });
});

describe('SessionsColumn skeleton', () => {
  it('renders skeleton rows while loading with no rows yet', () => {
    render(() => (
      <SessionsColumn rows={[]} loading={true} activeId="" onSelect={() => undefined} />
    ));
    expect(screen.getByTestId('sessions-skeleton')).toBeTruthy();
    // The empty state must NOT flash while we are still loading.
    expect(screen.queryByTestId('sidebar-empty')).toBeNull();
  });

  it('falls back to the empty state when loaded with zero rows', () => {
    render(() => (
      <SessionsColumn rows={[]} loading={false} activeId="" onSelect={() => undefined} />
    ));
    expect(screen.queryByTestId('sessions-skeleton')).toBeNull();
    expect(screen.getByTestId('sidebar-empty')).toBeTruthy();
  });
});

describe('Transcript skeleton', () => {
  it('renders skeleton bubbles while messages load', () => {
    render(() => <Transcript messages={[]} loading={true} density="normal" />);
    expect(screen.getByTestId('transcript-skeleton')).toBeTruthy();
  });

  it('renders no skeleton once messages are present', () => {
    render(() => (
      <Transcript
        messages={[
          { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hello' }] },
        ]}
        loading={false}
        density="normal"
      />
    ));
    expect(screen.queryByTestId('transcript-skeleton')).toBeNull();
    expect(screen.getByText('hello')).toBeTruthy();
  });
});
