import type { PendingInteraction } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { ClioPendingInteractions } from './pending-interactions';
import { PermissionOperationDetails } from './permission-operation-details';

afterEach(cleanup);

it('shows a child researcher source and intent before expanding technical details', () => {
  const interaction: PendingInteraction = {
    id: 'read-parquet-docs',
    kind: 'permission',
    status: 'pending',
    title: 'external MCP tool call: web_fetch',
    owner_session_id: 'researcher-child',
    attended_session_id: 'research-parent',
    source: { protocol: 'native', tool_name: 'web_fetch' },
    created_at: '2026-10-25T05:25:00Z',
    payload: {
      tool_call: {
        tool_name: 'web_fetch',
        input: {
          target: 'https://arrow.apache.org/docs/python/parquet.html',
          to_file: false,
          _clio_task_description: 'Read observation table filtering and partition documentation',
        },
      },
    },
  };
  render(
    <ClioPendingInteractions
      interactions={[interaction]}
      viewedSessionId="research-parent"
      onResponse={vi.fn(async () => undefined)}
    />,
  );
  expect(screen.getByText('Source')).toBeVisible();
  expect(screen.getByText('https://arrow.apache.org/docs/python/parquet.html')).toBeVisible();
  expect(
    screen.getByText('Read observation table filtering and partition documentation'),
  ).toBeVisible();
  expect(screen.queryByText('external MCP tool call: web_fetch')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Allow once' })).toBeVisible();
});

const request: PendingInteraction = {
  id: 'permission:folder-review',
  kind: 'permission',
  owner_session_id: 'session1',
  attended_session_id: 'session1',
  status: 'pending',
  title: 'Allow access to these folders?',
  requires_human_response: true,
  source: { protocol: 'native', tool_name: 'shell_bash' },
  created_at: '2026-10-15T12:00:00Z',
  actions: ['deny', 'allow_workspace'],
  payload: {
    permission_id: 'folder-review',
    tool_call: { tool_name: 'shell_bash', input: { command: 'Move-Item source destination' } },
    access: {
      folders: ['C:\\Users\\Alice\\Downloads', 'D:\\Research\\Results'],
      computer: 'Research PC',
      workspace_id: 'workspace1',
      operation: 'shell_bash',
      command: 'Move-Item source destination',
      paths: [
        'C:\\Users\\Alice\\Downloads\\measurements.csv',
        'D:\\Research\\Results\\measurements.csv',
      ],
      cwd: 'D:\\Research',
      reason: 'Move the measurements you selected into the results folder.',
      access: 'read_write',
      scope: 'workspace',
    },
  },
};

it('describes a web fetch that writes a file as saving the source', () => {
  render(
    <PermissionOperationDetails
      interaction={{
        ...request,
        payload: {
          tool_call: {
            tool_name: 'web_fetch',
            input: {
              target: 'https://example.org/report.pdf',
              to_file: true,
              output_dir: 'D:\\Research\\Reports',
            },
          },
        },
      }}
    />,
  );
  expect(screen.getByText('Save web source')).toBeVisible();
  expect(screen.getByText('Output folder')).toBeVisible();
  expect(screen.getByText('D:\\Research\\Reports')).toBeVisible();
});

it('shows command, computer, folders, reason and real duration before technical details', async () => {
  const respond = vi.fn();
  render(
    <ClioPendingInteractions
      interactions={[request]}
      viewedSessionId="session1"
      onResponse={respond}
    />,
  );
  expect(screen.getByText('Move-Item source destination')).toBeVisible();
  // Wide and narrow values are both mounted; the container query picks one.
  const [wideComputer, narrowComputer] = screen.getAllByText('Research PC');
  expect(wideComputer).toBeVisible();
  expect(wideComputer?.closest('[data-slot=key-value-narrow]')).toBeNull();
  expect(narrowComputer?.closest('[data-slot=key-value-narrow]')).not.toBeNull();
  expect(screen.getByText('C:\\Users\\Alice\\Downloads')).toBeVisible();
  expect(screen.getByText('D:\\Research\\Results')).toBeVisible();
  expect(
    screen.getByText('Move the measurements you selected into the results folder.'),
  ).toBeVisible();
  expect(screen.getByText(/including after restart/)).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Allow once' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Allow for this session' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Allow for this workspace' }));
  expect(respond).toHaveBeenCalledWith(request, { action: 'allow_workspace' });
});

it('at a fifth of the window keeps why, where and folders short and moves who asked into details', async () => {
  const delegated = { ...request, owner_session_id: 'child', attended_session_id: 'session1' };
  render(
    <ClioPendingInteractions
      interactions={[delegated]}
      ownerLabels={{ child: 'Station evidence specialist' }}
      viewedSessionId="session1"
      onResponse={vi.fn(async () => undefined)}
    />,
  );
  const narrow = Array.from(document.querySelectorAll('[data-slot=key-value-narrow]'));
  // Runs on: the label is the server icon, so the value starts with the computer itself.
  expect(narrow.some((node) => node.textContent === 'Research PCD:\\Research')).toBe(true);
  expect(narrow.some((node) => node.textContent === 'writes to 2 folders')).toBe(true);
  const askedBy = screen.getByText('Asked by');
  expect(askedBy.closest('[data-narrow=drop]')).not.toBeNull();
  expect(screen.getByText(/including after restart/)).toHaveClass('@max-[420px]/ask:truncate');
  await userEvent.click(screen.getByRole('button', { name: /Technical details/ }));
  expect(document.querySelector('[data-slot=ask-details-owner]')).toHaveTextContent(
    'Asked by Station evidence specialist',
  );
});

it('declines the original operation and retains an actionable response error', async () => {
  const respond = vi.fn().mockRejectedValueOnce(new Error('Could not save permission. Try again.'));
  render(
    <ClioPendingInteractions
      interactions={[request]}
      viewedSessionId="session1"
      onResponse={respond}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Deny' }));
  expect(await screen.findByText('Could not save permission. Try again.')).toBeVisible();
  expect(respond).toHaveBeenCalledWith(request, { action: 'deny' });
});

const permission = (mode: string): PendingInteraction => ({
  id: 'connect-observations',
  kind: 'permission',
  status: 'pending',
  title: 'Connect Alta observations',
  owner_session_id: 's',
  attended_session_id: 's',
  source: { protocol: 'native', tool_name: 'connected_data_connect' },
  created_at: '2026-10-18T12:00:00Z',
  payload: {
    tool_call: {
      tool_name: 'connected_data_connect',
      input: {
        provider: 'ndp',
        label: 'Alta observations',
        endpoint: 'Research catalog',
        mode,
        resources: ['observations.csv', 'README.txt'],
      },
    },
  },
});

it('explains the source, access mode and selected resources without a protocol action name', () => {
  render(<PermissionOperationDetails interaction={permission('read_only')} />);
  expect(screen.getByText('Connect source')).toBeVisible();
  expect(screen.getByText('Alta observations')).toBeVisible();
  expect(screen.getByText('National Data Platform')).toBeVisible();
  expect(screen.getByText('Research catalog')).toBeVisible();
  expect(screen.getByText('Read only')).toBeVisible();
  expect(screen.getByText('observations.csv, README.txt')).toBeVisible();
  expect(screen.queryByText('connected_data_connect')).not.toBeInTheDocument();
});

it.each([
  ['working_copy', 'Editable copy, publish changes after review'],
  ['write_enabled', 'Read and write originals'],
])('describes %s access without implying read-only access', (mode, description) => {
  render(<PermissionOperationDetails interaction={permission(mode)} />);
  expect(screen.getByText(description)).toBeVisible();
  expect(screen.queryByText('Read only')).not.toBeInTheDocument();
});

/** Every page keeps its own header pager mounted; only the shown page's is visible. */
const visiblePager = (text: string) =>
  screen.getAllByText(text).find((element) => !element.closest('[hidden]'));

it('pages multiple source approvals and removes the pager for the last request', async () => {
  const user = userEvent.setup();
  const first = permission('read_only');
  const second = { ...permission('read_only'), id: 'second', title: 'Connect second dataset' };
  const props = { viewedSessionId: 's', onResponse: vi.fn(async () => undefined) };
  const { rerender } = render(
    <ClioPendingInteractions {...props} interactions={[first, second]} />,
  );
  expect(visiblePager('1/2')).toBeVisible();
  expect(screen.getByText('Connect Alta observations')).toBeVisible();
  // Other pages stay mounted to preserve each request's draft and selected duration.
  expect(screen.getByText('Connect second dataset')).not.toBeVisible();
  expect(screen.getAllByRole('button', { name: 'Allow once' })).toHaveLength(1);
  await user.click(screen.getByRole('button', { name: 'Next request' }));
  expect(visiblePager('2/2')).toBeVisible();
  expect(screen.getByText('Connect second dataset')).toBeVisible();
  expect(screen.getByText('Connect Alta observations')).not.toBeVisible();
  rerender(<ClioPendingInteractions {...props} interactions={[second]} />);
  expect(screen.queryByRole('navigation', { name: 'Pending requests' })).not.toBeInTheDocument();
  expect(screen.getByText('Connect second dataset')).toBeVisible();
});

it('shows a script instead of its command and opens technical details in a dialog', async () => {
  const user = userEvent.setup();
  const script: PendingInteraction = {
    ...request,
    id: 'permission:qc-script',
    title: 'Run the QC script',
    actions: ['deny', 'allow'],
    payload: {
      tool_call: {
        tool_name: 'shell_bash',
        input: {
          command: 'python qc_stations.py --strict --out results/qc',
          _clio_task_description: 'Flag stations that fail QC',
        },
      },
      script: { call_id: 'call_qc', code: 'import pandas as pd\nprint(pd.__version__)\n' },
    },
  };
  render(
    <ClioPendingInteractions
      interactions={[script]}
      viewedSessionId="session1"
      onResponse={vi.fn(async () => undefined)}
    />,
  );
  expect(screen.getByText('Flag stations that fail QC')).toBeVisible();
  expect(screen.getByText('Python, 2 lines')).toBeVisible();
  expect(screen.queryByText('Command to run')).not.toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

  document.querySelector<HTMLElement>('[data-slot="ask-card"]')!.focus();
  await user.keyboard('d');
  const dialog = await screen.findByRole('dialog', {
    name: 'Run the QC script: Technical details',
  });
  expect(dialog).toHaveTextContent('python qc_stations.py --strict --out results/qc');
  expect(dialog).not.toHaveTextContent('_clio_');
  // The facts stay in the card; details never expand inline under them.
  expect(document.querySelector('[data-slot="ask-card"]')).not.toContainElement(dialog);
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  // Focus goes back to the card D was pressed on, so its keys keep working.
  expect(document.querySelector('[data-slot="ask-card"]')).toHaveFocus();
});

it('shows a readable title for retained requests with the old generic summary', () => {
  render(
    <ClioPendingInteractions
      viewedSessionId="s"
      onResponse={vi.fn(async () => undefined)}
      interactions={[
        {
          ...permission('read_only'),
          title: 'destructive tool call: connected_data_connect',
        },
      ]}
    />,
  );
  expect(screen.getByText('Connect Alta observations')).toBeVisible();
  expect(
    screen.queryByText('destructive tool call: connected_data_connect'),
  ).not.toBeInTheDocument();
});
