/**
 * Owner cluster B: the topbar's blueprint crumb opened a window that showed
 * only a raw `<dl>`/`<pre>` metadata dump and a stale "definition body has
 * no wire surface yet" stub — even though `GET /v1/agent-blueprints/{id}`
 * already carries the AGENT.md body as `agent_blueprint.metadata.body`
 * (clio-agent agent_blueprints.py:342). These cases pin: the body renders
 * through the transcript Markdown module when the blueprint is backed, and
 * — since no route exists to list/read the blueprint's OTHER files
 * (experts/*.md, tools/) — a typed, visible gap note names that precisely
 * instead of faking a tree.
 */
import { render, screen, waitFor } from '@testing-library/react';
import type { Client } from '@clio/core';
import { describe, expect, it, vi } from 'vitest';
import { BlueprintWindow } from '../../src/session/BlueprintWindow';

function stubClient(detail: unknown): Client {
  return { get: vi.fn(async () => detail) } as unknown as Client;
}

const BACKED_DETAIL = {
  agent_blueprint: {
    id: 'earthscope-flat',
    version: '0.1.0',
    title: 'EarthScope Flat',
    display_name: 'EarthScope (Flat / Haiku)',
    description: 'Small-model-friendly FLAT variant.',
    scope: 'workspace',
    root: 'D:\\clio\\.clio\\agent-blueprints\\earthscope-flat',
    root_path: 'D:\\clio\\.clio\\agent-blueprints\\earthscope-flat\\AGENT.md',
    root_expert: 'main',
    enabled: true,
    validation_errors: [],
    defaults: { prompt_profile: 'heavy' },
    metadata: {
      layout: 'agent_blueprint',
      body: '# EarthScope GNSS Region Agent\n\nResolves a geography and stages GNSS data.',
    },
  },
  agents: [{ id: 'main', title: 'Main Orchestrator' }],
  mcp_descriptors: [],
};

describe('BlueprintWindow', () => {
  it('renders the AGENT.md body through the Markdown module when the blueprint is backed', async () => {
    const client = stubClient(BACKED_DETAIL);
    render(
      <BlueprintWindow blueprintId="earthscope-flat" client={client} open onClose={() => {}} />,
    );
    await waitFor(() => expect(screen.getByTestId('blueprint-window-markdown')).toBeInTheDocument());
    const markdown = screen.getByTestId('blueprint-window-markdown');
    // Rendered through the shared Markdown module (a role="heading" node),
    // not a JSON/pre dump of the raw "# EarthScope GNSS Region Agent" string.
    expect(markdown.querySelector('[role="heading"][aria-level="1"]')).not.toBeNull();
    expect(markdown).toHaveTextContent('EarthScope GNSS Region Agent');
    expect(markdown).toHaveTextContent('Resolves a geography and stages GNSS data.');
    // The stale stub this replaces must be gone.
    expect(screen.queryByText(/no wire surface yet/i)).toBeNull();
  });

  it('names the missing explorer route precisely instead of faking a file tree', async () => {
    const client = stubClient(BACKED_DETAIL);
    render(
      <BlueprintWindow blueprintId="earthscope-flat" client={client} open onClose={() => {}} />,
    );
    const gap = await screen.findByTestId('blueprint-window-explorer-gap');
    expect(gap).toHaveTextContent('/v1/agent-blueprints/{id}');
    expect(gap).toHaveTextContent('routes/blueprints.py:298');
  });

  it('still lists the real served agents alongside the definition', async () => {
    const client = stubClient(BACKED_DETAIL);
    render(
      <BlueprintWindow blueprintId="earthscope-flat" client={client} open onClose={() => {}} />,
    );
    await waitFor(() => expect(screen.getByText('Main Orchestrator')).toBeInTheDocument());
  });

  it('a blueprint with no body beyond frontmatter shows an honest empty note, not a blank pane', async () => {
    const client = stubClient({
      ...BACKED_DETAIL,
      agent_blueprint: { ...BACKED_DETAIL.agent_blueprint, metadata: { layout: 'agent_blueprint', body: '' } },
    });
    render(
      <BlueprintWindow blueprintId="earthscope-flat" client={client} open onClose={() => {}} />,
    );
    await waitFor(() =>
      expect(screen.getByText(/no body text beyond its frontmatter/i)).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('blueprint-window-markdown')).toBeNull();
  });

  it('with no blueprint attached, says so honestly and fetches nothing', () => {
    const client = stubClient(BACKED_DETAIL);
    render(<BlueprintWindow blueprintId={null} client={client} open onClose={() => {}} />);
    expect(screen.getByTestId('blueprint-window-empty')).toBeInTheDocument();
    expect(client.get).not.toHaveBeenCalled();
  });
});
