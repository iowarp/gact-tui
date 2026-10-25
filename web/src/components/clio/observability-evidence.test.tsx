import type { Artifact, Message, ToolInvocation, WorkspaceResource } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClioEvidenceView } from './observability-evidence';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

it('lets Evidence disclose the formatted tool result and preserves semantic failures without repeated success badges', async () => {
  render(
    <ClioEvidenceView
      artifacts={[]}
      contextFiles={[]}
      diffs={[]}
      messages={[]}
      processes={[]}
      tools={[
        {
          id: 'read',
          session_id: 's',
          name: 'fs_read_file',
          state: 'succeeded',
          presentation: { action: 'Read', summary: '710 bytes', blocks: [] },
        },
        {
          id: 'fetch',
          session_id: 's',
          name: 'fetch',
          state: 'succeeded',
          presentation: {
            action: 'Fetch',
            status: 'failed',
            summary: 'Could not fetch',
            blocks: [
              {
                id: 'failure',
                type: 'text',
                text: 'Resource exceeded its size limit',
                severity: 'error',
              },
            ],
          },
        },
      ]}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Tool calls, 2 recorded' }));
  expect(screen.getByRole('img', { name: 'Tool: succeeded' })).toBeVisible();
  expect(screen.getByRole('img', { name: 'Tool: failed' })).toBeVisible();
  expect(screen.queryByText('Succeeded')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Show result for Fetch' }));
  expect(screen.getByRole('region', { name: 'Fetch: Result' })).toHaveTextContent(
    'Resource exceeded its size limit',
  );
});

it.each([false, true])(
  'keeps task history in Work and out of Data (compact=%s)',
  async (compact) => {
    const props = {
      artifacts: [],
      contextFiles: [],
      diffs: [],
      messages: [],
      processes: [],
      compact,
      workPages: {
        hasMore: false,
        pending: false,
        loadMore: vi.fn(async () => {}),
        history: {
          visible: false,
          toggle: vi.fn(),
          items: [],
          hasMore: false,
          pending: false,
          loadMore: vi.fn(async () => {}),
          error: '',
        },
      },
    };
    const view = render(<ClioEvidenceView {...props} section="data" />);
    expect(screen.queryByRole('button', { name: 'Completed work' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Background (work|tasks),/ })).toBeNull();
    view.rerender(<ClioEvidenceView {...props} section="work" />);
    const group = screen.getByRole('button', { name: /^Background (work|tasks), none running$/ });
    if (group.getAttribute('aria-expanded') === 'false') await userEvent.click(group);
    expect(screen.getByRole('button', { name: 'Completed work' })).toBeVisible();
    expect(screen.queryByText('No session evidence or recorded activity is available.')).toBeNull();
  },
);

describe('ClioEvidenceView operational inventory', () => {
  it('replaces the summary card with collapsible runs, tasks, children, tools, and background work', async () => {
    const user = userEvent.setup();
    const onOpenSubagent = vi.fn();
    render(
      <ClioEvidenceView
        artifacts={[]}
        contextFiles={[]}
        diffs={[]}
        messages={[]}
        onOpenSubagent={onOpenSubagent}
        processes={[
          {
            id: 'process_1',
            kind: 'mcp-task',
            title: 'Remote analysis',
            live_state: 'completed',
            status: 'completed',
            host: 'worker-1',
            metadata: {},
          },
        ]}
        runs={[
          {
            id: 'run_1',
            session_id: 'sess_1',
            state: 'completed',
            summary: 'Investigate the evidence',
            elapsed_ms: 1250,
          },
        ]}
        subagents={[
          {
            id: 'task_child',
            session_id: 'sess_1',
            child_session_id: 'sess_child',
            title: 'research_methodologist #1',
            state: 'completed',
            task: 'Compare all four records.',
          },
        ]}
        tasks={[
          {
            id: 'task_1',
            session_id: 'sess_1',
            title: 'Review findings',
            state: 'completed',
          },
        ]}
        tools={[
          {
            id: 'tool_1',
            session_id: 'sess_1',
            name: 'fs_read_file',
            state: 'succeeded',
            presentation: { action: 'Read evidence', blocks: [], summary: '387 bytes' },
          },
        ]}
      />,
    );

    expect(screen.queryByText('Session evidence')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agent runs, 1 recorded' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Tasks, 1 recorded' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Child agents, 1 recorded' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Tool calls, 1 recorded' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Background tasks, 1 recorded' })).toBeVisible();

    await user.click(
      screen.getByRole('button', { name: 'Open child conversation research_methodologist #1' }),
    );
    expect(onOpenSubagent).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'task_child' }),
      'canvas',
    );

    await user.click(screen.getByRole('button', { name: 'Agent runs, 1 recorded' }));
    expect(screen.getByText('Investigate the evidence')).toBeVisible();
    expect(screen.getByText('1 s')).toBeVisible();
  });
});

function resourceMessage(input: {
  messageId: string;
  resourceId: string;
  revision: string;
  name: string;
  mediaType: string;
}): Message {
  return {
    id: input.messageId,
    session_id: 'sess_1',
    role: 'user',
    created_at: '2026-08-31T00:00:00Z',
    blocks: [
      {
        id: `${input.messageId}_block`,
        type: 'resource',
        resource_id: input.resourceId,
        resource_revision: input.revision,
        workspace_id: 'ws_1',
        name: input.name,
        media_type: input.mediaType,
      },
    ],
  };
}

function workspaceResource(
  overrides: Partial<WorkspaceResource> & { id: string },
): WorkspaceResource {
  return {
    workspace_id: 'ws_1',
    client_upload_id: `${overrides.id}_upload`,
    revision: 1,
    name: overrides.id,
    claimed_mime: 'text/csv',
    detected_mime: 'text/csv',
    detection_source: 'signature',
    declared_size: 100,
    received_size: 100,
    sha256: '',
    state: 'ready',
    failure: '',
    created_at: '2026-08-30T00:00:00Z',
    updated_at: '2026-08-31T00:00:00Z',
    completed_at: '2026-08-31T00:00:00Z',
    mime_mismatch: false,
    ...overrides,
  };
}

describe('ClioEvidenceView resource sources', () => {
  it('shows the delivered revision as authoritative and labels a newer live revision distinctly', () => {
    render(
      <ClioEvidenceView
        artifacts={[]}
        contextFiles={[]}
        diffs={[]}
        messages={[
          resourceMessage({
            messageId: 'message_1',
            resourceId: 'resource_pdf',
            revision: '1',
            name: 'paper.pdf',
            mediaType: 'application/pdf',
          }),
        ]}
        processes={[]}
        resources={[
          workspaceResource({
            id: 'resource_pdf',
            revision: 2,
            name: 'paper.pdf',
            claimed_mime: 'application/pdf',
            detected_mime: 'application/pdf',
            sha256: 'abcdef0123456789abcdef0123456789',
            received_size: 4096,
          }),
        ]}
      />,
    );

    // The revision DELIVERED to the model (from the message block) is authoritative history —
    // it must not be silently replaced by the live resource's newer revision.
    expect(screen.getByText('Revision 1')).toBeVisible();
    expect(screen.getByText(/Current revision 2/u)).toBeVisible();
  });

  it('does not silently substitute the live revision when the block and resource agree', () => {
    render(
      <ClioEvidenceView
        artifacts={[]}
        contextFiles={[]}
        diffs={[]}
        messages={[
          resourceMessage({
            messageId: 'message_1',
            resourceId: 'resource_pdf',
            revision: '1',
            name: 'paper.pdf',
            mediaType: 'application/pdf',
          }),
        ]}
        processes={[]}
        resources={[workspaceResource({ id: 'resource_pdf', revision: 1, name: 'paper.pdf' })]}
      />,
    );

    expect(screen.getByText('Revision 1')).toBeVisible();
    expect(screen.queryByText(/Current revision/u)).not.toBeInTheDocument();
  });

  it('renders resource detail as sibling elements, never a middot-joined string', () => {
    render(
      <ClioEvidenceView
        artifacts={[]}
        contextFiles={[]}
        diffs={[]}
        messages={[
          resourceMessage({
            messageId: 'message_1',
            resourceId: 'resource_pdf',
            revision: '1',
            name: 'paper.pdf',
            mediaType: 'application/pdf',
          }),
        ]}
        processes={[]}
        resources={[
          workspaceResource({
            id: 'resource_pdf',
            revision: 1,
            name: 'paper.pdf',
            claimed_mime: 'application/pdf',
            detected_mime: 'application/pdf',
            sha256: 'abcdef0123456789abcdef0123456789',
            received_size: 4096,
          }),
        ]}
      />,
    );

    expect(screen.getByText('Revision 1')).toBeVisible();
    expect(screen.getByText('application/pdf')).toBeVisible();
    expect(screen.getByText('4.1 KB')).toBeVisible();
    expect(screen.getByText(/SHA-256 abcdef012345/u)).toBeVisible();
    expect(screen.queryByText(/·/u)).not.toBeInTheDocument();
  });

  it('dedups resource sources by (resource id, revision), not by the rendered detail string', () => {
    render(
      <ClioEvidenceView
        artifacts={[]}
        contextFiles={[]}
        diffs={[]}
        messages={[
          resourceMessage({
            messageId: 'message_alpha',
            resourceId: 'resource_alpha',
            revision: '1',
            name: 'alpha.csv',
            mediaType: 'text/csv',
          }),
          resourceMessage({
            messageId: 'message_beta',
            resourceId: 'resource_beta',
            revision: '1',
            name: 'beta.csv',
            mediaType: 'text/csv',
          }),
        ]}
        processes={[]}
        resources={[
          workspaceResource({ id: 'resource_alpha', revision: 1, name: 'alpha.csv' }),
          workspaceResource({ id: 'resource_beta', revision: 1, name: 'beta.csv' }),
        ]}
      />,
    );

    // Two distinct resources whose rendered detail (type/revision/size, no sha on either)
    // is identical text must still both appear — dedup must key on resource identity, not
    // on the formatted string, or one of these two distinct sources would be dropped.
    expect(screen.getByText('alpha.csv')).toBeVisible();
    expect(screen.getByText('beta.csv')).toBeVisible();
  });

  it('still collapses the same resource and revision referenced from two message blocks', () => {
    render(
      <ClioEvidenceView
        artifacts={[]}
        contextFiles={[]}
        diffs={[]}
        messages={[
          resourceMessage({
            messageId: 'message_1',
            resourceId: 'resource_pdf',
            revision: '1',
            name: 'paper.pdf',
            mediaType: 'application/pdf',
          }),
          resourceMessage({
            messageId: 'message_2',
            resourceId: 'resource_pdf',
            revision: '1',
            name: 'paper.pdf',
            mediaType: 'application/pdf',
          }),
        ]}
        processes={[]}
        resources={[workspaceResource({ id: 'resource_pdf', revision: 1, name: 'paper.pdf' })]}
      />,
    );

    expect(screen.getAllByText('paper.pdf')).toHaveLength(1);
  });
});

describe('ClioEvidenceView session_lineage fallback', () => {
  it('names used artifacts from their metadata, keeps the source ID inspectable, and opens the artifact', async () => {
    const user = userEvent.setup();
    const onOpenArtifact = vi.fn();
    const artifact: Artifact = {
      id: 'artifact_long_identity_1234567890',
      session_id: 'session_root',
      name: 'Research report.docx',
      media_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      uri: 'artifact://report',
      size: 1024,
    };
    render(
      <ClioEvidenceView
        artifacts={[artifact]}
        contextFiles={[]}
        diffs={[]}
        messages={[]}
        processes={[]}
        onOpenArtifact={onOpenArtifact}
        executionProvenance={{
          schema_version: 'clio.execution_provenance.v1',
          provider: 'native',
          session_id: 'session_root',
          root_session_id: 'session_root',
          complete: true,
          truncated: false,
          provider_health: {},
          campaigns: [],
          workflows: [],
          agents: [],
          session_lineage: [
            {
              session_id: 'session_root',
              parent_session_id: '',
              task_id: '',
              agent_id: 'main',
              label: 'Main agent',
              depth: 0,
              task_path: [],
            },
          ],
          spans: [],
          nodes: [
            {
              id: 'node_source',
              kind: 'artifact',
              label: artifact.id,
              status: 'completed',
              session_id: 'session_root',
              agent_id: 'main',
              start_time: 1,
              end_time: 2,
              attributes: { artifact_id: artifact.id },
            },
          ],
          edges: [
            {
              id: 'used_source',
              source: 'session_root',
              target: 'node_source',
              kind: 'used',
              attributes: {},
            },
          ],
        }}
      />,
    );
    expect(screen.getByText(artifact.name)).toBeVisible();
    expect(screen.queryByText(artifact.id)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: `Details for source ${artifact.name}` }));
    expect(screen.getByText(artifact.id)).toBeVisible();
    expect(onOpenArtifact).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: `Open source ${artifact.name}` }));
    expect(onOpenArtifact).toHaveBeenCalledWith(artifact);
  });

  it('includes files read by attached child agents from execution provenance', () => {
    render(
      <ClioEvidenceView
        artifacts={[]}
        contextFiles={[]}
        diffs={[]}
        executionProvenance={{
          schema_version: 'clio.execution_provenance.v1',
          provider: 'native',
          session_id: 'session_root',
          root_session_id: 'session_root',
          complete: true,
          truncated: false,
          provider_health: {},
          campaigns: [],
          workflows: [],
          agents: [],
          session_lineage: [
            {
              session_id: 'session_root',
              parent_session_id: '',
              task_id: '',
              agent_id: 'main',
              label: 'Main agent',
              depth: 0,
              task_path: [],
            },
            {
              session_id: 'session_gateway',
              parent_session_id: 'session_root',
              task_id: 'task_gateway',
              agent_id: 'gateway',
              label: 'gateway #1',
              depth: 1,
              task_path: ['task_gateway'],
            },
          ],
          spans: [],
          nodes: [
            {
              id: 'tool_read_gateway_log',
              kind: 'tool',
              label: 'Read gateway log',
              status: 'completed',
              session_id: 'session_gateway',
              agent_id: 'gateway',
              start_time: 1,
              end_time: 2,
              attributes: {
                tool_name: 'fs_read_file',
                owner_session_id: 'session_gateway',
                tool_input: { filepath: 'D:/workspace/triage/api_gateway.log' },
              },
            },
          ],
          edges: [],
        }}
        messages={[]}
        processes={[]}
        resources={[]}
      />,
    );

    expect(screen.getByText('api_gateway.log')).toBeVisible();
    expect(screen.getByText('Read by gateway #1')).toBeVisible();
  });

  it('still shows workflow-state sources when session_lineage is legally empty', () => {
    // An empty array is CLIO's legal "this session delegated to nothing" answer,
    // not a missing read — it must not suppress the plain workflow-state sources
    // every process already carries.
    render(
      <ClioEvidenceView
        artifacts={[]}
        contextFiles={[]}
        diffs={[]}
        executionProvenance={{
          schema_version: 'clio.execution_provenance.v1',
          provider: 'native',
          session_id: 'session_root',
          root_session_id: 'session_root',
          complete: true,
          truncated: false,
          provider_health: {},
          campaigns: [],
          workflows: [],
          agents: [],
          session_lineage: [],
          spans: [],
          nodes: [],
          edges: [],
        }}
        messages={[]}
        processes={[
          {
            kind: 'agent',
            id: 'task_1',
            title: 'ndp #1',
            live_state: 'completed',
            status: 'completed',
            result: {
              workflow_state: {
                acquisition: {
                  metadata_source_url: 'https://example.test/data.csv',
                },
              },
            },
            metadata: {},
          },
        ]}
        resources={[]}
      />,
    );

    expect(screen.getByText('ndp #1, Metadata source URL')).toBeVisible();
  });
});

describe('ClioEvidenceView change status', () => {
  const path = 'D:\\workspace\\example.py';
  const write: ToolInvocation = {
    id: 'tool_write',
    session_id: 'session_root',
    name: 'fs_edit_file',
    state: 'succeeded',
    presentation: {
      action: 'Edit',
      summary: '',
      blocks: [
        { id: 'file', type: 'link', target: 'file', label: 'example.py', uri: path },
        {
          id: 'diff',
          type: 'diff',
          text: '--- a/example.py\n+++ b/example.py\n@@ -1 +1 @@\n-old\n+new',
        },
      ],
    },
  };

  it('lists the service record of a change with its undone status', () => {
    render(
      <ClioEvidenceView
        artifacts={[]}
        contextFiles={[]}
        diffs={[
          {
            id: 'chg_1',
            call_id: 'tool_write',
            path,
            status: 'reverted',
            created: false,
            undo_available: false,
            unified_diff: '@@ -1 +1 @@\n-old\n+new',
          },
        ]}
        messages={[]}
        processes={[]}
        resources={[]}
        tools={[write]}
      />,
    );

    expect(screen.getByText('Reverted')).toBeVisible();
    expect(screen.queryByText('Applied')).not.toBeInTheDocument();
  });

  it('keeps a transcript-only write as applied when the service no longer records it', () => {
    render(
      <ClioEvidenceView
        artifacts={[]}
        contextFiles={[]}
        diffs={[]}
        messages={[]}
        processes={[]}
        resources={[]}
        tools={[write]}
      />,
    );

    expect(screen.getByText('Applied')).toBeVisible();
  });
});

describe('ClioEvidenceView child agents', () => {
  const watcher = {
    id: 'task_watch',
    session_id: 'sess_1',
    child_session_id: 'sess_watch',
    title: 'SPOTTER watcher',
    state: 'running' as const,
  };

  it('always lists child agents, with an explicit empty state and a disclosure', async () => {
    render(
      <ClioEvidenceView
        artifacts={[]}
        contextFiles={[]}
        diffs={[]}
        messages={[]}
        processes={[]}
        provenanceProvider={{
          name: 'native',
          configured: true,
          queryable: true,
          durable: true,
          status: 'ready',
          source: 'arc+jsonl',
          health: {},
        }}
        subagents={[]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Child agents, 0 recorded' })).toBeVisible();
    expect(screen.getByText('No child agents in this session yet.')).toBeVisible();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Child agents, 0 recorded' }));
    expect(screen.queryByText('No child agents in this session yet.')).not.toBeInTheDocument();
  });

  it('uses one completed-work disclosure without claiming that no child agents ever ran', async () => {
    render(
      <ClioEvidenceView
        artifacts={[]}
        contextFiles={[]}
        diffs={[]}
        messages={[]}
        processes={[]}
        subagents={[]}
        workPages={{
          hasMore: false,
          pending: false,
          loadMore: async () => undefined,
          history: {
            visible: false,
            toggle: () => {},
            items: [],
            hasMore: false,
            pending: false,
            loadMore: async () => undefined,
            error: '',
          },
        }}
      />,
    );
    expect(screen.queryByText('No child agents in this session yet.')).not.toBeInTheDocument();
    // History has one owner; a second child section must not duplicate its toggle.
    expect(screen.queryByRole('button', { name: /^Child agents,/ })).toBeNull();
    const background = screen.getByRole('button', { name: 'Background tasks, none running' });
    if (background.getAttribute('aria-expanded') === 'false') await userEvent.click(background);
    expect(screen.getAllByRole('button', { name: 'Completed work' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Background tasks, none running' })).toBeVisible();
  });

  it('opens a workspace tab on click and the center on Shift-click', async () => {
    const user = userEvent.setup();
    const onOpenSubagent = vi.fn();
    render(
      <ClioEvidenceView
        artifacts={[]}
        contextFiles={[]}
        diffs={[]}
        messages={[]}
        onOpenSubagent={onOpenSubagent}
        processes={[]}
        subagents={[watcher]}
      />,
    );
    const row = screen.getByRole('button', { name: 'Open child conversation SPOTTER watcher' });
    await user.click(row);
    expect(onOpenSubagent).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'task_watch' }),
      'canvas',
    );

    await user.keyboard('{Shift>}');
    await user.click(row);
    await user.keyboard('{/Shift}');
    expect(onOpenSubagent).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'task_watch' }),
      'conversation',
    );

    onOpenSubagent.mockClear();
    await user.click(screen.getByRole('button', { name: 'Open SPOTTER watcher in canvas' }));
    expect(onOpenSubagent).toHaveBeenCalledTimes(1);
    expect(onOpenSubagent).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'task_watch' }),
      'canvas',
    );
  });
});
