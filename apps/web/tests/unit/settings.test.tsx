/**
 * Settings contract (gact-tui#337).
 *
 * The rule is "backed pages only; unbacked ship hidden". A settings page with
 * no backing is worse than a missing one: it promises a control that cannot
 * work.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Settings } from '../../src/settings/Settings';
import { SETTINGS_PAGES, backedPages } from '../../src/settings/pages';

describe('settings page inventory', () => {
  it('marks every page with how it is backed', () => {
    for (const page of SETTINGS_PAGES) {
      expect(['backend', 'client', 'unbacked']).toContain(page.backing);
    }
  });

  it('hides exactly the unbacked pages', () => {
    const hidden = SETTINGS_PAGES.filter((p) => p.backing === 'unbacked').map((p) => p.id);
    // Verified against @clio/core's client surface: none of these has a method.
    expect(hidden.sort()).toEqual(['data', 'plugins', 'relays']);
    const visible = backedPages().map((p) => p.id);
    for (const id of hidden) expect(visible).not.toContain(id);
  });

  it('names the client method backing each backend page', () => {
    // A page claiming backend backing must say which call proves it, so the
    // claim is checkable rather than asserted.
    for (const page of SETTINGS_PAGES.filter((p) => p.backing === 'backend')) {
      expect(page.method, `${page.id} claims backend backing with no method`).toBeTruthy();
    }
  });

  it('covers the prototype page set', () => {
    // Every page the prototype's settings nav carries is accounted for —
    // present-and-backed or present-and-hidden, never silently forgotten.
    const ids = SETTINGS_PAGES.map((p) => p.id).sort();
    expect(ids).toEqual(
      [
        'about', 'agents', 'appearance', 'backends', 'blueprints', 'commands',
        'data', 'doctor', 'expert-packs', 'hooks', 'mcp', 'memory', 'metrics',
        'models', 'plugins', 'policies', 'prompts', 'providers', 'relays',
        'session-defaults',
      ].sort(),
    );
  });
});

describe('Settings', () => {
  it('renders only backed pages in the nav', () => {
    render(<Settings onClose={vi.fn()} />);
    const nav = screen.getByRole('navigation', { name: /settings/i });
    expect(within(nav).getByRole('button', { name: /providers/i })).toBeInTheDocument();
    expect(within(nav).queryByRole('button', { name: /^relays$/i })).toBeNull();
    expect(within(nav).queryByRole('button', { name: /^plugins$/i })).toBeNull();
  });

  it('switches pages', () => {
    render(<Settings onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /doctor/i }));
    expect(screen.getByTestId('settings-page')).toHaveTextContent(/doctor/i);
  });

  it('states that a page is not implemented yet rather than showing a blank pane', () => {
    // These pages are BACKED but their UI is not built. Saying so beats an
    // empty pane that looks like a broken load.
    render(<Settings onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /metrics/i }));
    expect(screen.getByTestId('settings-unbuilt')).toBeInTheDocument();
  });

  it('closes', () => {
    const onClose = vi.fn();
    render(<Settings onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /close settings/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
