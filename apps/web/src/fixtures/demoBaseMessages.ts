/**
 * Demo/fixture data (demo Base Messages) for offline rendering and visual tests; not used against a live backend.
 */
import type { Message } from '@clio/core';

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

export function normalDemoMessages(): Message[] {
  return [
    {
      id: 'm-user-1',
      role: 'user',
      parts: [
        {
          type: 'text',
          text: 'Read src/handlers.go and rewrite the println calls to use log.Info.',
        },
      ],
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
        {
          type: 'tool_result',
          tool_call_id: 'tc-read-1',
          output: 'func handle(r *Request) {\n    println("got request")\n}\n',
        },
        {
          type: 'text',
          text: "Here's the patch — switched to structured logging and surfaced an error return.\n\n```go\nfunc handle(w http.ResponseWriter, r *http.Request) {\n\tif err := process(r); err != nil {\n\t\tlog.Error(\"process failed\", \"err\", err)\n\t\thttp.Error(w, \"internal\", 500)\n\t\treturn\n\t}\n\tlog.Info(\"handled request\", \"path\", r.URL.Path)\n}\n```",
        },
        {
          type: 'file_diff',
          path: 'src/handlers.go',
          unified_diff: DEMO_DIFF,
          applied: false,
        },
      ],
    },
  ];
}

export function streamingDemoMessages(normal: Message[]): Message[] {
  return [
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
        {
          type: 'text',
          text: 'Reading handlers.go… found 3 println calls. Drafting a structured-log rewrite',
        },
      ],
    },
  ];
}

export function verboseDemoMessages(normal: Message[]): Message[] {
  return [
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
        {
          type: 'tool_result',
          tool_call_id: 'tc-grep',
          output: 'src/handlers_test.go:18:    println("calling")\n',
        },
      ],
    },
  ];
}
