import type { InfrastructureDependency } from '@clio/core/v3';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClioInfrastructurePreparation } from './infrastructure-preparation';

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

function dependency(
  state: InfrastructureDependency['state'],
  overrides: Partial<InfrastructureDependency> = {},
): InfrastructureDependency {
  return {
    id: 'sess_1:mcp:geo',
    session_id: 'sess_1',
    category: 'mcp',
    namespace: 'geo',
    title: 'Geospatial tools',
    phase: state === 'ready' ? 'connect' : 'launch',
    state,
    attempt: 1,
    max_attempts: 3,
    observed_active: state === 'running' || state === 'retrying',
    ...overrides,
  };
}

describe('ClioInfrastructurePreparation', () => {
  it('shows selected blueprint infrastructure while it starts', () => {
    render(<ClioInfrastructurePreparation dependencies={[dependency('running')]} />);

    expect(screen.getByText('Initial infrastructure setup')).toBeInTheDocument();
    expect(screen.getByText('Agent tools')).toBeInTheDocument();
    expect(screen.getByText('Geospatial tools')).toBeInTheDocument();
    expect(screen.getByText('Starting')).toBeInTheDocument();
  });

  it('does not replay completed historical setup after remount', () => {
    render(
      <ClioInfrastructurePreparation dependencies={[dependency('ready', { tool_count: 4 })]} />,
    );

    expect(screen.queryByText('Initial infrastructure setup')).not.toBeInTheDocument();
  });

  it('keeps a typed failure visible for recovery', () => {
    render(<ClioInfrastructurePreparation dependencies={[dependency('failed')]} />);

    expect(screen.getByText('Needs attention')).toBeInTheDocument();
    expect(screen.getByText('Could not prepare this tool service')).toBeInTheDocument();
  });

  it('shows a calm completion before fading after live preparation', () => {
    vi.useFakeTimers();
    const view = render(<ClioInfrastructurePreparation dependencies={[dependency('running')]} />);

    view.rerender(
      <ClioInfrastructurePreparation
        dependencies={[
          dependency('ready', {
            observed_active: true,
            tool_count: 4,
          }),
        ]}
      />,
    );

    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('Connected with 4 tools')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1_500));

    expect(screen.queryByText('Initial infrastructure setup')).not.toBeInTheDocument();
  });
});
