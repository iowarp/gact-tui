import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { a2uiSurfaceDomId } from './a2ui-presentation';
import { PresentationLink } from './presentation-link';
import { PresentationNavigation } from './presentation-navigation';

afterEach(cleanup);

describe('presentation navigation', () => {
  it('keeps recorded peer session labels readable without a live router', () => {
    render(
      <PresentationLink
        block={{
          id: 'peer',
          type: 'link',
          target: 'session',
          uri: 'sess_peer',
          label: 'Budget reviewer',
        }}
        compact
      />,
    );
    expect(screen.getByText('Budget reviewer')).toBeVisible();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('opens the memory page on the fact a memory notice names', () => {
    render(
      <MemoryRouter>
        <PresentationLink
          block={{
            id: 'memory',
            type: 'link',
            target: 'memory',
            uri: 'user/preferences/preferences#f42z3al',
            label: 'Edit in memory',
          }}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Edit in memory' })).toHaveAttribute(
      'href',
      '/settings/memory?doc=user%2Fpreferences%2Fpreferences&fact=f42z3al',
    );
  });
  it('preserves normal session navigation when the live router is present', () => {
    render(
      <MemoryRouter initialEntries={['/workspaces/work/sessions/current']}>
        <Routes>
          <Route
            path="/workspaces/:workspaceId/sessions/:sessionId"
            element={
              <PresentationLink
                block={{
                  id: 'peer',
                  type: 'link',
                  target: 'session',
                  uri: 'sess_peer',
                  label: 'Budget reviewer',
                }}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Budget reviewer' })).toHaveAttribute(
      'href',
      '/workspaces/work/sessions/sess_peer',
    );
  });
  it('opens a saved document through the existing workspace file viewer', () => {
    const open = vi.fn();
    render(
      <PresentationNavigation.Provider value={{ artifacts: {}, subagents: {}, onOpenFile: open }}>
        <PresentationLink
          block={{
            id: 'saved',
            type: 'link',
            target: 'resource',
            uri: 'D:/workspace/report.md',
            label: 'Saved Markdown',
          }}
        />
      </PresentationNavigation.Provider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Saved Markdown' }));
    expect(open).toHaveBeenCalledWith('D:/workspace/report.md');
  });
  it('does not turn an untrusted script URI into a clickable link', () => {
    render(
      <PresentationLink
        block={{
          id: 'unsafe',
          type: 'link',
          target: 'url',
          uri: 'javascript:alert(1)',
          label: 'Unsafe',
        }}
      />,
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText(/Unsafe/)).toBeInTheDocument();
  });
  it('navigates a generated UI label to its exact rendered surface', () => {
    render(
      <PresentationNavigation.Provider
        value={{
          artifacts: {},
          subagents: {},
          surfaces: { 'surface-1': {} as never },
        }}
      >
        <PresentationLink
          block={{
            id: 'generated-ui',
            type: 'link',
            target: 'surface',
            uri: 'surface-1',
            label: 'Input',
          }}
        />
        <section
          id={a2uiSurfaceDomId('surface-1')}
          aria-label="Interactive surface, Input"
          tabIndex={-1}
        />
      </PresentationNavigation.Provider>,
    );
    const surface = screen.getByLabelText('Interactive surface, Input');
    const scrollIntoView = vi.fn();
    surface.scrollIntoView = scrollIntoView;

    fireEvent.click(screen.getByRole('button', { name: 'Input' }));

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
    expect(surface).toHaveFocus();
  });
});
