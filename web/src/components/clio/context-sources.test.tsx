import type { ContextFile, ToolInvocation, WorkspaceResource } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { ContextSources } from './context-sources';

afterEach(cleanup);

it('distinguishes a capture using its recorded operation and count', async () => {
  const tool: ToolInvocation = {
    id: 't',
    session_id: 's',
    name: 'connected_data_ndp_endpoint_request',
    state: 'succeeded',
    presentation: {
      summary: '1 stream records captured',
      blocks: [
        {
          id: 'request-action',
          type: 'text',
          label: 'Capture observations',
          text: 'Capture observations',
        },
        {
          id: 'saved-response',
          type: 'link',
          target: 'resource',
          uri: 'r1',
          label: 'capture.json',
        },
      ],
    },
  };
  render(<ContextSources files={[]} resources={[resource(1)]} tools={[tool]} />);
  await userEvent.click(screen.getByRole('button', { name: 'Sources 1' }));
  expect(screen.getByText(/Capture observations · 1 record · 20 B/)).toBeVisible();
});
function resource(index: number): WorkspaceResource {
  return {
    id: `r${index}`,
    workspace_id: 'w',
    client_upload_id: `u${index}`,
    revision: 1,
    name: `Source ${index}.csv`,
    claimed_mime: 'text/csv',
    detected_mime: 'text/csv',
    detection_source: 'content',
    declared_size: 20,
    received_size: 20,
    sha256: 'a'.repeat(64),
    state: 'ready',
    failure: '',
    created_at: '',
    updated_at: '',
    completed_at: '',
    mime_mismatch: false,
  };
}
it('bounds the source list and opens real resources without claiming their whole contents are loaded', async () => {
  const open = vi.fn();
  const resources = Array.from({ length: 8 }, (_, index) => resource(index));
  render(<ContextSources files={[]} resources={resources} onOpenResource={open} />);
  await userEvent.click(screen.getByRole('button', { name: 'Sources 8' }));
  expect(screen.getAllByText(/Available in workspace/)).toHaveLength(6);
  expect(screen.queryByText('Source 7.csv')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Show more sources (2)' }));
  await userEvent.click(screen.getByRole('button', { name: 'Source 7.csv' }));
  expect(open).toHaveBeenCalledWith(resources[7]);
  expect(screen.getByText(/Availability does not mean the full file/)).toBeVisible();
});

it('deduplicates a source already attached as a context file', async () => {
  const file: ContextFile = { path: '/source.csv', display_path: 'source.csv', mode: 'read' };
  render(
    <ContextSources files={[file]} resources={[{ ...resource(1), workspace_path: file.path }]} />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Sources 1' }));
  expect(screen.getByText('source.csv')).toBeVisible();
  expect(screen.queryByText('Source 1.csv')).not.toBeInTheDocument();
});
