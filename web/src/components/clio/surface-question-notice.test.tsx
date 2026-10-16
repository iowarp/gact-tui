import type { A2UISurface, PendingInteraction } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClioPendingInteractions } from './pending-interactions';

afterEach(cleanup);

const surface: A2UISurface = {
  id: 'view',
  session_id: 'child',
  catalog_id: 'catalog',
  protocol_version: '0.9.1',
  revision: 1,
  state: 'ready',
  messages: [],
};
function pending(overrides: Partial<PendingInteraction> = {}): PendingInteraction {
  return {
    id: 'a2ui:child:view',
    kind: 'a2ui',
    owner_session_id: 'child',
    attended_session_id: 'root',
    status: 'pending',
    title: 'Interactive view',
    prompt: 'Review cleanup',
    source: { protocol: 'native', surface_id: 'view' },
    created_at: '2026-10-15T00:00:00Z',
    ...overrides,
  };
}
function mount(interaction: PendingInteraction, rawSurface: A2UISurface | null = surface) {
  const open = vi.fn();
  const respond = vi.fn(async () => undefined);
  const refetch = vi.fn();
  render(
    <ClioPendingInteractions
      interactions={[interaction]}
      onResponse={respond}
      onOpenSurfaceQuestion={open}
      onRefetchSurfaces={refetch}
      surfaces={rawSurface ? { view: rawSurface } : {}}
      ownerLabels={{ child: 'Researcher' }}
      viewedSessionId="root"
    />,
  );
  return { open, respond, refetch };
}

describe('A2UI response notices', () => {
  it('opens the exact owner and surface without submitting or mounting the widget in the tray', async () => {
    const interaction = pending();
    const { open, respond } = mount(interaction);
    expect(screen.getByText('Review cleanup')).toBeVisible();
    expect(screen.getByText('Researcher')).toBeVisible();
    expect(document.querySelector('[data-slot="pending-a2ui"]')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Go to question' }));
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(interaction);
    expect(respond).not.toHaveBeenCalled();
  });
  it('does not count an offered action as requiring a human response', () => {
    mount(pending({ requires_human_response: false }));
    expect(
      screen.queryByRole('region', { name: 'Agent needs your attention' }),
    ).not.toBeInTheDocument();
  });
  it('does not navigate to another owner with the same surface id', () => {
    const { open } = mount(pending(), { ...surface, session_id: 'foreign' });
    expect(screen.getByText('The linked view belongs to another conversation.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Go to question' })).toBeDisabled();
    expect(open).not.toHaveBeenCalled();
  });
  it('offers retry while the real linked view has not loaded', async () => {
    const { refetch } = mount(pending(), null);
    expect(screen.getByText('Loading the linked view…')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Go to question' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledOnce();
  });
  it('names a missing identity and a deleted view rather than claiming loading', () => {
    const { unmount } = render(
      <ClioPendingInteractions
        interactions={[pending({ source: { protocol: 'native' } })]}
        onResponse={vi.fn()}
        viewedSessionId="root"
      />,
    );
    expect(screen.getByText('This response has no linked view.')).toBeVisible();
    unmount();
    mount(pending(), { ...surface, state: 'deleted' });
    expect(screen.getByText('The linked view is unavailable.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Go to question' })).toBeDisabled();
  });
  it('can dismiss a request even when its linked view is unavailable', async () => {
    const interaction = pending({ actions: ['cancel'] });
    const { respond } = mount(interaction, null);
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss question' }));
    expect(respond).toHaveBeenCalledTimes(1);
    expect(respond).toHaveBeenCalledWith(interaction, { action: 'cancel' });
  });
});
