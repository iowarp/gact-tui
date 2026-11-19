import type { A2UIActionLifecycle, A2UISurface } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { actionControlLabel } from '@/lib/a2ui/surface-components';
import { ClioA2UIActionLifecycle } from './a2ui-action-lifecycle';

afterEach(cleanup);

function lifecycle(overrides: Partial<A2UIActionLifecycle> = {}): A2UIActionLifecycle {
  return {
    surface_id: 'surface_1',
    action_name: 'earthscope.stations.selected',
    status: 'received',
    occurred_at: '2026-09-17T00:00:00Z',
    ...overrides,
  };
}

describe('ClioA2UIActionLifecycle', () => {
  it('renders nothing when no lifecycle is known yet', () => {
    const { container } = render(<ClioA2UIActionLifecycle />);
    expect(container).toBeEmptyDOMElement();
  });

  // The action name is the producer's identifier: it is never shown (it was, as
  // "earthscope.stations.selected recorded", live 2026-11-18).
  it.each([
    ['received', 'Your choice received by the agent'],
    ['delivered', "Your choice delivered to the agent's turn"],
    ['consumed', 'Your choice recorded'],
    ['duplicate', 'Your choice ignored as a duplicate'],
  ] as const)('renders words for the %s state', (status, expectedText) => {
    render(<ClioA2UIActionLifecycle lifecycle={lifecycle({ status })} />);
    expect(screen.getByText(expectedText)).toBeVisible();
    expect(screen.queryByText(/earthscope\.stations/u)).toBeNull();
  });

  it('names the control the person pressed', () => {
    render(
      <ClioA2UIActionLifecycle
        lifecycle={lifecycle({ status: 'consumed', source_component_id: 'analyse' })}
        surface={surface}
      />,
    );
    expect(screen.getByText('“Analyse selected station” recorded')).toBeVisible();
  });

  it('includes the reason on a failed action', () => {
    render(
      <ClioA2UIActionLifecycle
        lifecycle={lifecycle({ status: 'failed', reason: 'busy turn' })}
      />,
    );
    expect(screen.getByText('Your choice failed: busy turn')).toBeVisible();
  });

  it('never encodes status as a dot or colour alone', () => {
    render(<ClioA2UIActionLifecycle lifecycle={lifecycle({ status: 'failed' })} />);
    expect(screen.getByText(/Your choice failed/u)).toBeVisible();
  });

  it('names approval and selection actions for a human reader', () => {
    render(<ClioA2UIActionLifecycle lifecycle={lifecycle({ action_name: 'approval.respond', status: 'consumed' })} />);
    render(<ClioA2UIActionLifecycle lifecycle={lifecycle({ action_name: 'agent.submit', status: 'consumed' })} />);
    expect(screen.getByText('Decision recorded')).toBeVisible();
    expect(screen.getByText('Selection recorded')).toBeVisible();
  });
});

const surface = {
  id: 'surface_1',
  session_id: 's',
  catalog_id: 'c',
  protocol_version: 'v0.9',
  revision: 1,
  state: 'active',
  messages: [
    {
      updateComponents: {
        surfaceId: 'surface_1',
        components: [
          { id: 'analyse', component: 'Button', child: 'analyse_text' },
          { id: 'analyse_text', component: 'Text', text: 'Analyse selected station' },
          { id: 'bound', component: 'Button', child: 'bound_text' },
          { id: 'bound_text', component: 'Text', text: { path: '/label' } },
          { id: 'own', component: 'Button', label: { literalString: 'Go' } },
        ],
      },
    },
  ],
} as unknown as A2UISurface;

describe('actionControlLabel', () => {
  it('reads a literal label on the control or its child, never a bound one', () => {
    expect(actionControlLabel(surface, 'analyse')).toBe('Analyse selected station');
    expect(actionControlLabel(surface, 'own')).toBe('Go');
    expect(actionControlLabel(surface, 'bound')).toBe('');
    expect(actionControlLabel(surface, 'missing')).toBe('');
    expect(actionControlLabel(surface, undefined)).toBe('');
  });
});
