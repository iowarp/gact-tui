import type { InfrastructureDependency } from '@clio/core/v3';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ClioInfrastructurePreparation } from './infrastructure-preparation';
import { MotionConfig } from 'motion/react';
import { infrastructurePreparationLabel } from './infrastructure-preparation-label';

function dependency(
  state: InfrastructureDependency['state'],
  overrides: Partial<InfrastructureDependency> = {},
): InfrastructureDependency {
  return {
    id: 'sess_1:mcp:geo',
    session_id: 'sess_1',
    category: 'mcp',
    namespace: 'geo',
    title: 'Geo MCP',
    phase: state === 'ready' ? 'connect' : 'launch',
    state,
    attempt: 1,
    max_attempts: 3,
    observed_active: state === 'running' || state === 'retrying',
    ...overrides,
  };
}

describe('ClioInfrastructurePreparation', () => {
  it('keeps preparation readable without shimmer when motion is reduced', () => {
    render(
      <MotionConfig reducedMotion="always">
        <ClioInfrastructurePreparation dependencies={[]} />
      </MotionConfig>,
    );
    expect(screen.getByText('Setting up session')).toBeVisible();
    expect(document.querySelector('[style*="background-image"]')).toBeNull();
  });
  it('uses one AI Elements shimmer line for a cold MCP launch', () => {
    render(<ClioInfrastructurePreparation dependencies={[dependency('running')]} />);

    expect(screen.getByText('Setting up environment (loading MCP Geo)')).toBeVisible();
    expect(document.querySelector('[style*="background-image"]')).not.toBeNull();
  });

  it('evolves the same sentence with authoritative connection and retry phases', () => {
    expect(
      infrastructurePreparationLabel([
        dependency('running', { phase: 'connect', title: 'NDP MCP' }),
      ]),
    ).toBe('Setting up environment (connecting MCP NDP)');
    expect(
      infrastructurePreparationLabel([
        dependency('retrying', { phase: 'retry', title: 'Pandas MCP' }),
      ]),
    ).toBe('Setting up environment (retrying MCP Pandas)');
  });

  it('distinguishes first-session preparation from a follow-up request', () => {
    expect(infrastructurePreparationLabel([])).toBe('Setting up session');
    expect(infrastructurePreparationLabel([], true)).toBe('Preparing next response');
    expect(
      infrastructurePreparationLabel([
        dependency('ready', { observed_active: true, tool_count: 4 }),
      ]),
    ).toBe('Starting agent');
  });
});
