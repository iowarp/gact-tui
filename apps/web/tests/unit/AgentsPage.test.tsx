import { render, screen, cleanup, fireEvent, waitFor } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentDef, Client } from '@clio/core';
import { AgentsPage } from '../../src/routes/discovery/AgentsPage.js';

afterEach(cleanup);

const AGENTS: AgentDef[] = [
  {
    id: 'main',
    title: 'Data Semantics Orchestrator',
    source: 'builtin',
    tier: 1,
    tools: ['delegate'],
    keywords: ['main'],
  },
];

function makeClient(): { client: Client; getAgent: ReturnType<typeof vi.fn> } {
  const getAgent = vi.fn().mockResolvedValue({
    id: 'main',
    title: 'Data Semantics Orchestrator',
    source: 'builtin',
    tier: 1,
    specialization: 'workflow routing',
    default_model: 'gpt-oss-120b',
    tools: ['delegate', 'summarize_evidence'],
    keywords: ['main', 'routing'],
    routing_rules: {
      data: 'delegate dataset discovery',
      analysis: 'delegate scientific review',
    },
    metadata: {
      owner: 'bench',
      expert_pack: 'ndp-demo',
      nested: { retained: true },
    },
  });
  const client = {
    agents: vi.fn().mockResolvedValue({ agents: AGENTS }),
    getAgent,
  } as unknown as Client;
  return { client, getAgent };
}

async function ready() {
  await waitFor(() => expect(screen.getByTestId('agent-card-main')).toBeTruthy());
}

describe('AgentsPage', () => {
  it('renders expanded agent detail as scannable fields, not raw JSON', async () => {
    const { client, getAgent } = makeClient();
    const { container } = render(() => <AgentsPage client={client} />);
    await ready();

    fireEvent.click(screen.getByTestId('agent-detail-toggle-main'));

    await waitFor(() => expect(getAgent).toHaveBeenCalledWith('main'));
    await waitFor(() => expect(screen.getByTestId('agent-detail-main')).toBeTruthy());

    const detail = screen.getByTestId('agent-detail-main');
    expect(detail.textContent).toContain('Source');
    expect(detail.textContent).toContain('builtin');
    expect(detail.textContent).toContain('Focus');
    expect(detail.textContent).toContain('workflow routing');
    expect(detail.textContent).toContain('Tools');
    expect(detail.textContent).toContain('summarize_evidence');
    expect(detail.textContent).toContain('Routing');
    expect(detail.textContent).toContain('Data');
    expect(detail.textContent).toContain('delegate dataset discovery');
    expect(detail.textContent).toContain('Metadata');
    expect(detail.textContent).toContain('Owner');
    expect(detail.textContent).toContain('bench');

    expect(container.querySelector('.ws-card__repo-tree')).toBeNull();
    expect(detail.textContent).not.toContain('"routing_rules"');
    expect(detail.textContent).not.toContain('{');
  });
});
