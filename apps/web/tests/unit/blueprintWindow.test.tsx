/**
 * Owner cluster B: the topbar's blueprint crumb opened a window that showed
 * only a raw `<dl>`/`<pre>` metadata dump and a stale "definition body has
 * no wire surface yet" stub — even though `GET /v1/agent-blueprints/{id}`
 * already carries the AGENT.md body as `agent_blueprint.metadata.body`
 * (clio-agent agent_blueprints.py:342). These cases pin: the body renders
 * through the transcript Markdown module when the blueprint is backed, and
 * — now that clio-agent#1192 backs a real per-blueprint file listing/read
 * surface (`GET /v1/agent-blueprints/{id}/files[/read]`) — the explorer
 * lists and previews the blueprint's OTHER files (experts/*.md, tools/) for
 * real, falling back to a typed gap note only when an older backend 404s.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Client } from '@clio/core';
import { describe, expect, it, vi } from 'vitest';
import { BlueprintWindow } from '../../src/session/BlueprintWindow';

type MockFn = ReturnType<typeof vi.fn>;

function stubClient(
  detail: unknown,
  overrides: { listBlueprintFiles?: MockFn; readBlueprintFile?: MockFn } = {},
): Client {
  return {
    get: vi.fn(async () => detail),
    listBlueprintFiles: overrides.listBlueprintFiles ?? vi.fn(async () => ({ entries: [] })),
    readBlueprintFile:
      overrides.readBlueprintFile ??
      vi.fn(async () => {
        throw Object.assign(new Error('not mocked'), { status: 404 });
      }),
  } as unknown as Client;
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

  it('renders the honest gap note when the backend has no blueprint-files route (404)', async () => {
    const notFound = Object.assign(new Error('not found'), { status: 404 });
    const listBlueprintFiles = vi.fn(async () => {
      throw notFound;
    });
    const client = stubClient(BACKED_DETAIL, { listBlueprintFiles });
    render(
      <BlueprintWindow blueprintId="earthscope-flat" client={client} open onClose={() => {}} />,
    );
    const gap = await screen.findByTestId('blueprint-window-explorer-gap');
    expect(gap).toHaveTextContent('/v1/agent-blueprints/{id}');
    expect(gap).toHaveTextContent('routes/blueprints.py:298');
    expect(listBlueprintFiles).toHaveBeenCalledWith('earthscope-flat', { sessionId: undefined });
  });

  it('a non-404 failure gets a distinct honest error, never the old-backend gap note', async () => {
    const boom = Object.assign(new Error('boom'), { status: 500 });
    const listBlueprintFiles = vi.fn(async () => {
      throw boom;
    });
    const client = stubClient(BACKED_DETAIL, { listBlueprintFiles });
    render(
      <BlueprintWindow blueprintId="earthscope-flat" client={client} open onClose={() => {}} />,
    );
    const error = await screen.findByTestId('blueprint-window-explorer-error');
    expect(error).toHaveTextContent('boom');
    expect(screen.queryByTestId('blueprint-window-explorer-gap')).toBeNull();
  });

  it('lists the blueprint\'s real files in the explorer tree', async () => {
    const listBlueprintFiles = vi.fn(async () => ({
      entries: [
        { path: 'AGENT.md', type: 'file', size: 128 },
        { path: 'experts', type: 'dir' },
        { path: 'experts/root.md', type: 'file', size: 64 },
      ],
    }));
    const readBlueprintFile = vi.fn(async () => ({
      data: Buffer.from('# EarthScope GNSS Region Agent', 'utf-8').toString('base64'),
      media_type: 'text/markdown',
      size: 30,
    }));
    const client = stubClient(BACKED_DETAIL, { listBlueprintFiles, readBlueprintFile });
    render(
      <BlueprintWindow blueprintId="earthscope-flat" client={client} open onClose={() => {}} />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('blueprint-window-explorer-tree')).toBeInTheDocument(),
    );
    expect(screen.getByText('AGENT.md')).toBeInTheDocument();
    expect(screen.getByText('experts')).toBeInTheDocument();
    // experts/root.md is nested — not shown until the directory is entered.
    expect(screen.queryByText('root.md')).toBeNull();
    // The definition view defaults to AGENT.md and eagerly fetches it.
    await waitFor(() => expect(readBlueprintFile).toHaveBeenCalledWith(
      'earthscope-flat',
      'AGENT.md',
      { sessionId: undefined },
    ));
  });

  it('selecting a markdown file in the explorer renders it through the Markdown module', async () => {
    const listBlueprintFiles = vi.fn(async () => ({
      entries: [
        { path: 'AGENT.md', type: 'file', size: 32 },
        { path: 'experts', type: 'dir' },
        { path: 'experts/root.md', type: 'file', size: 48 },
      ],
    }));
    const readBlueprintFile = vi.fn(async (_id: string, path: string) => {
      if (path === 'experts/root.md') {
        return {
          data: Buffer.from('# Root Expert\n\nDrives sub-agent routing.', 'utf-8').toString(
            'base64',
          ),
          media_type: 'text/markdown',
          size: 40,
        };
      }
      return {
        data: Buffer.from('# EarthScope GNSS Region Agent', 'utf-8').toString('base64'),
        media_type: 'text/markdown',
        size: 30,
      };
    });
    const client = stubClient(BACKED_DETAIL, { listBlueprintFiles, readBlueprintFile });
    render(
      <BlueprintWindow blueprintId="earthscope-flat" client={client} open onClose={() => {}} />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('blueprint-window-explorer-tree')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByText('experts'));
    const fileRow = await screen.findByText('root.md');
    fireEvent.click(fileRow);

    const explorerMarkdown = await screen.findByTestId('blueprint-window-explorer-markdown');
    expect(explorerMarkdown.querySelector('[role="heading"]')).not.toBeNull();
    expect(explorerMarkdown).toHaveTextContent('Root Expert');
    expect(explorerMarkdown).toHaveTextContent('Drives sub-agent routing.');
  });

  it('round-7: experts/main.md-shaped frontmatter renders as a dimmed raw block, headings still parse', async () => {
    // The real defect shape: frontmatter with an internal `# comment` line
    // that collides with the markdown parser's heading token, followed by
    // the actual body headings.
    const mainMd = [
      '---',
      'id: main',
      'title: EarthScope GNSS Region Orchestrator',
      'tier: 1',
      '# Small-model-friendly pack: the four leaves proved solid under Haiku, but final',
      '# synthesis is the one step that needs a stronger model.',
      'default_model: sonnet',
      '---',
      '',
      '# EarthScope GNSS Region Orchestrator',
      '',
      'You are the orchestrator.',
      '',
      '## Writing the final answer',
      '',
      'Prose only.',
    ].join('\n');
    const listBlueprintFiles = vi.fn(async () => ({
      entries: [{ path: 'experts/main.md', type: 'file', size: mainMd.length }],
    }));
    const readBlueprintFile = vi.fn(async () => ({
      data: Buffer.from(mainMd, 'utf-8').toString('base64'),
      media_type: 'text/markdown',
      size: mainMd.length,
    }));
    const client = stubClient(BACKED_DETAIL, { listBlueprintFiles, readBlueprintFile });
    render(
      <BlueprintWindow blueprintId="earthscope-flat" client={client} open onClose={() => {}} />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('blueprint-window-explorer-tree')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByText('experts'));
    fireEvent.click(await screen.findByText('main.md'));

    const explorerMarkdown = await screen.findByTestId('blueprint-window-explorer-markdown');
    // The frontmatter renders as an honest, separate raw block...
    const frontmatter = await screen.findByTestId('blueprint-window-explorer-frontmatter');
    expect(frontmatter).toHaveTextContent('id: main');
    expect(frontmatter).toHaveTextContent(
      'Small-model-friendly pack: the four leaves proved solid under Haiku, but final',
    );
    // ...content preserved, never dropped...
    expect(frontmatter).toHaveTextContent('default_model: sonnet');
    // ...and is NOT parsed as markdown: the YAML comment line must not
    // produce a heading role.
    expect(frontmatter.querySelector('[role="heading"]')).toBeNull();

    // The real body headings DO parse, now that they're not preceded/
    // tangled with the frontmatter's own '# comment' lines.
    const headings = explorerMarkdown.querySelectorAll('[role="heading"]');
    const headingTexts = [...headings].map((h) => h.textContent);
    expect(headingTexts).toContain('EarthScope GNSS Region Orchestrator');
    expect(headingTexts).toContain('Writing the final answer');
    // Exactly the 2 real body headings — none of the frontmatter's internal
    // "# comment" lines leaked through as extra (fake) heading elements.
    expect(headings.length).toBe(2);
    expect(explorerMarkdown).toHaveTextContent('You are the orchestrator.');
  });

  it('a markdown file with no frontmatter renders unchanged — no frontmatter block, headings parse as before', async () => {
    const listBlueprintFiles = vi.fn(async () => ({
      entries: [
        { path: 'AGENT.md', type: 'file', size: 32 },
        { path: 'experts', type: 'dir' },
        { path: 'experts/root.md', type: 'file', size: 48 },
      ],
    }));
    const readBlueprintFile = vi.fn(async (_id: string, path: string) => {
      if (path === 'experts/root.md') {
        return {
          data: Buffer.from('# Root Expert\n\nDrives sub-agent routing.', 'utf-8').toString(
            'base64',
          ),
          media_type: 'text/markdown',
          size: 40,
        };
      }
      return {
        data: Buffer.from('# EarthScope GNSS Region Agent', 'utf-8').toString('base64'),
        media_type: 'text/markdown',
        size: 30,
      };
    });
    const client = stubClient(BACKED_DETAIL, { listBlueprintFiles, readBlueprintFile });
    render(
      <BlueprintWindow blueprintId="earthscope-flat" client={client} open onClose={() => {}} />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('blueprint-window-explorer-tree')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByText('experts'));
    fireEvent.click(await screen.findByText('root.md'));

    const explorerMarkdown = await screen.findByTestId('blueprint-window-explorer-markdown');
    expect(explorerMarkdown.querySelector('[role="heading"]')).not.toBeNull();
    expect(explorerMarkdown).toHaveTextContent('Root Expert');
    expect(explorerMarkdown).toHaveTextContent('Drives sub-agent routing.');
    expect(screen.queryByTestId('blueprint-window-explorer-frontmatter')).toBeNull();
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
    expect(client.listBlueprintFiles).not.toHaveBeenCalled();
  });
});
