import type { Message, PermissionRequest } from '@clio/core';
import type { SidebarSession } from '../components/Sidebar.js';

export interface DemoFixtures {
  sessions: SidebarSession[];
  byName: Record<string, Message[]>;
  permission: PermissionRequest;
}

const DEMO_DIFF = `--- a/src/handlers.go
+++ b/src/handlers.go
@@ -3,4 +3,5 @@
-func handle(r *Request) {
-    println("got request")
+func handle(r *Request) error {
+    log.Info("request received", "id", r.ID)
+    return nil
 }
`;

export function fixturesForDemo(): DemoFixtures {
  const sessions: SidebarSession[] = [
    { id: 's1', title: 'refactor logger', status: 'running', project: 'gact-tui', updatedAt: '2m' },
    { id: 's2', title: 'investigate flaky test', status: 'idle', project: 'gact-tui', updatedAt: '14m' },
    { id: 's3', title: 'awaiting policy review', status: 'waiting_permission', project: 'clio-agent', updatedAt: '1m' },
    { id: 's4', title: 'finished migration', status: 'finished', project: 'clio-agent', updatedAt: '1h' },
    { id: 's5', title: 'failed compose run', status: 'error', project: 'apps', updatedAt: '6h' },
  ];

  const normal: Message[] = [
    {
      id: 'm-user-1',
      role: 'user',
      parts: [{ type: 'text', text: 'Read src/handlers.go and rewrite the println calls to use log.Info.' }],
    },
    {
      id: 'm-asst-1',
      role: 'assistant',
      parts: [
        {
          type: 'tool_call',
          id: 'tc-read-1',
          tool_name: 'ReadFile',
          input: { path: 'src/handlers.go' },
        },
        { type: 'tool_result', tool_call_id: 'tc-read-1', output: 'func handle(r *Request) {\n    println("got request")\n}\n' },
        { type: 'text', text: "Here's the patch — switched to structured logging and surfaced an error return." },
        {
          type: 'file_diff',
          path: 'src/handlers.go',
          unified_diff: DEMO_DIFF,
          applied: false,
        },
      ],
    },
  ];

  const streaming: Message[] = [
    ...normal.slice(0, 1),
    {
      id: 'm-asst-streaming',
      role: 'assistant',
      parts: [
        { type: 'thinking', text: 'I should read the file first, then patch the println calls.' },
        {
          type: 'tool_call',
          id: 'tc-stream-read',
          tool_name: 'ReadFile',
          input: { path: 'src/handlers.go' },
        },
        { type: 'text', text: 'Reading handlers.go… found 3 println calls. Drafting a structured-log rewrite' },
      ],
    },
  ];

  const verbose: Message[] = [
    ...normal,
    {
      id: 'm-asst-2',
      role: 'assistant',
      parts: [
        { type: 'thinking', text: 'Should double-check the test file uses the same logger.' },
        {
          type: 'tool_call',
          id: 'tc-grep',
          tool_name: 'Grep',
          input: { pattern: 'println', glob: '**/*.go' },
        },
        { type: 'tool_result', tool_call_id: 'tc-grep', output: 'src/handlers_test.go:18:    println("calling")\n' },
      ],
    },
  ];

  const permission: PermissionRequest = {
    id: 'p-1',
    session_id: 's3',
    tool_name: 'WriteFile',
    risk: 'medium',
    reason: 'WriteFile touches the workspace; review the path before approving.',
    created_at: new Date().toISOString(),
    tool_call: {
      input: { path: 'src/handlers.go', mode: 'overwrite' },
    },
  };

  return {
    sessions,
    byName: {
      normal,
      streaming,
      verbose,
      summary: verbose,
      permission: normal,
    },
    permission,
  };
}
