import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from 'next-themes';
import type { PendingInteraction } from '@clio/core/v3';
import '../../src/index.css';
import { ClioPendingInteractions } from '../../src/components/clio/pending-interactions';
import { WorkspaceEditorDialog } from '../../src/components/clio/workspace-editor-dialog';

function WorkspaceEditorReview() {
  const [outcome, setOutcome] = useState('');
  return (
    <main className="p-6">
      <p>UI review with simulated workspace folders. No files are changed.</p>
      {outcome ? (
        <p role="status">{outcome}</p>
      ) : (
        <WorkspaceEditorDialog
          workspace={{
            id: 'review',
            name: 'Research',
            display_name: 'Research',
            path: 'C:\\Users\\Alice\\Documents\\Research',
            connection_id: 'local',
            pinned: false,
            source_folders: [
              { name: 'Research', path: 'C:\\Users\\Alice\\Documents\\Research', primary: true },
              { name: 'Sources', path: 'D:\\Sources', primary: false },
            ],
          }}
          actions={{
            updateWorkspace: async (_id, input) => {
              setOutcome(`Saved primary: ${input.root_path}`);
            },
            grantWorkspaceFolder: async (_id, path) => {
              setOutcome((current) => `${current}; permitted: ${path}`);
            },
            revokeWorkspaceFolder: async () => {},
          }}
          onClose={() => {}}
        />
      )}
    </main>
  );
}

const source = 'C:\\Users\\Alice\\Downloads\\measurements.csv';
const destination = 'D:\\Research\\Results\\measurements.csv';
const command = `Move-Item -LiteralPath '${source}' -Destination '${destination}'`;
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
    tool_call: { tool_name: 'shell_bash', input: { command } },
    access: {
      folders: ['C:\\Users\\Alice\\Downloads', 'D:\\Research\\Results'],
      computer: 'Research PC',
      workspace_id: 'workspace1',
      operation: 'shell_bash',
      command,
      paths: [source, destination],
      cwd: 'D:\\Research',
      reason: 'Move the measurements you selected into the results folder.',
      access: 'read_write',
      scope: 'workspace',
    },
  },
};

function Review() {
  const [outcome, setOutcome] = useState('');
  return (
    <main className="mx-auto flex h-dvh max-w-5xl flex-col bg-background px-3 py-6 text-foreground">
      <p className="mb-6 text-xs text-muted-foreground">
        UI review with simulated data and production permission controls. No inference.
      </p>
      <h1 className="text-xl font-semibold">Research workspace</h1>
      <p className="mt-4 max-w-xl text-muted-foreground">
        Move the measurements from Downloads into my results folder.
      </p>
      <div className="min-h-4 flex-1" />
      {outcome ? (
        <p role="status" className="mb-4 rounded-md bg-muted p-3">
          {outcome}
        </p>
      ) : (
        <ClioPendingInteractions
          interactions={[request]}
          viewedSessionId="session1"
          onResponse={async (_request, answer) => {
            setOutcome(
              answer.action === 'deny'
                ? 'Folder access declined. The agent can choose another approach.'
                : 'Folder permission saved. The original operation can continue.',
            );
          }}
        />
      )}
      <div className="mx-auto w-[calc(100%_-_1.5rem)] max-w-[54.5rem] rounded-b-xl border border-composer-border bg-composer p-4 text-sm text-muted-foreground">
        Ask CLIO…
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <ThemeProvider attribute="class" forcedTheme="light" enableSystem={false}>
    {new URLSearchParams(location.search).get('view') === 'workspace' ? (
      <WorkspaceEditorReview />
    ) : (
      <Review />
    )}
  </ThemeProvider>,
);
