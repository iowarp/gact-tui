// A session export of a workflow run, assembled as the service assembles one:
// the production offline renderer (dist/offline-review.js, built by `pnpm build`)
// with the archive data gzip-packed into the page, under the export's
// Content-Security-Policy. Synthetic renderer data; no scientific observations.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const at = (minute) => `2026-10-27T10:${String(minute).padStart(2, '0')}:00Z`;

function session(id, title, extra = {}) {
  return {
    id,
    workspace_id: 'ws_1',
    title,
    state: 'completed',
    created_at: at(0),
    updated_at: at(9),
    provider_id: 'local',
    model_id: 'model-a',
    ...extra,
  };
}

function agentTask(handle, child) {
  return {
    task_id: handle,
    parent_session_id: 'sess_wf',
    child_session_id: child,
    status: 'completed',
    created_at: at(1),
    updated_at: at(3),
  };
}

const workflowRun = {
  run_id: 'flowrun_e2e',
  flow: 'workflow',
  status: 'completed',
  root_handle: 'task_wf',
  view: {
    kind: 'workflow',
    steps: [
      {
        id: 'draft',
        target: 'self',
        input: 'Draft the summary.',
        status: 'completed',
        handle: 'task_draft',
      },
      {
        id: 'draft~1',
        target: 'self',
        status: 'completed',
        handle: 'task_fork',
        fork_of: 'draft',
        note: 'try a shorter draft',
      },
      {
        id: 'review',
        target: 'self',
        after: ['draft'],
        status: 'completed',
        handle: 'task_review',
      },
    ],
    editors: [],
    approve_edits: true,
  },
  calls: [
    { invocation: 'i1', kind: 'agent', handle: 'task_draft', status: 'completed' },
    { invocation: 'i3', kind: 'agent', handle: 'task_review', status: 'completed' },
  ],
  events: [
    { event: 'step_completed', step: 'draft', handle: 'task_draft' },
    { event: 'fork_completed', step: 'draft~1', fork_of: 'draft' },
    { event: 'step_completed', step: 'review', handle: 'task_review' },
  ],
  timings: {
    task_draft: { created_at: at(1), updated_at: at(3), terminal_at: at(3) },
    task_fork: { created_at: at(2), updated_at: at(4), terminal_at: at(4) },
    task_review: { created_at: at(4), updated_at: at(5), terminal_at: at(5) },
  },
};

const text = (id, sessionId, minute, role, value) => ({
  id,
  session_id: sessionId,
  role,
  created_at: at(minute),
  blocks: [{ id: `${id}_t`, type: 'text', text: value }],
});

const empty = { tools: [], tasks: [], subagents: [], artifacts: [], surfaces: [] };
const views = {
  sess_root: {
    ...empty,
    messages: [
      text('m_ask', 'sess_root', 0, 'user', 'Draft and review the summary.'),
      {
        id: 'm_root',
        session_id: 'sess_root',
        role: 'assistant',
        created_at: at(1),
        blocks: [
          { id: 'b_text', type: 'text', text: 'Starting the workflow.' },
          { id: 'b_wf', type: 'tool', tool_id: 'call_wf' },
        ],
      },
    ],
    tools: [
      {
        id: 'call_wf',
        session_id: 'sess_root',
        name: 'run_workflow',
        state: 'succeeded',
        input: { workflow: { steps: [] }, task: 'Draft and review the summary.' },
        output: { accepted: true, handle: 'task_wf' },
      },
    ],
  },
  sess_draft: {
    ...empty,
    messages: [
      text('m_draft_in', 'sess_draft', 1, 'user', 'Draft the summary.'),
      text('m_draft', 'sess_draft', 2, 'assistant', 'The draft summary of the run.'),
    ],
  },
  sess_fork: {
    ...empty,
    messages: [text('m_fork', 'sess_fork', 3, 'assistant', 'A shorter draft.')],
  },
  sess_review: {
    ...empty,
    messages: [text('m_review', 'sess_review', 5, 'assistant', 'The draft reads well.')],
  },
};

const row = (id, title, parent) => ({
  session: { id, title, metadata: {} },
  messages: [],
  tool_records: [],
  loaded_skills: [],
  recording: null,
  ...(parent
    ? {
        relationship: {
          session_id: id,
          parent_session_id: parent,
          attribution: 'agent_task',
        },
      }
    : {}),
});

const json = (value) => ({ json: value });
const responses = {
  'GET /v1/sessions/sess_root': json(session('sess_root', 'Workflow review')),
  'GET /v1/sessions/sess_draft': json(session('sess_draft', 'draft')),
  'GET /v1/sessions/sess_fork': json(session('sess_fork', 'draft~1')),
  'GET /v1/sessions/sess_review': json(session('sess_review', 'review')),
  'GET /v1/sessions/sess_root/science-log': json({ session_id: 'sess_root', in_study: false }),
  'GET /v1/sessions/sess_root/tasks/task_wf/flow': json(workflowRun),
  'GET /v1/agent-tasks/task_wf': json(agentTask('task_wf', 'sess_wf')),
  'GET /v1/agent-tasks/task_draft': json(agentTask('task_draft', 'sess_draft')),
  'GET /v1/agent-tasks/task_fork': json(agentTask('task_fork', 'sess_fork')),
  'GET /v1/agent-tasks/task_review': json(agentTask('task_review', 'sess_review')),
  'GET /v1/sessions/sess_root/interactions?include_children=true&include_recent_resolved=true&resolved_limit=100':
    json({ interactions: [] }),
};

/** The export page's HTML, as a reader opens it from disk. */
export function workflowExportHtml(webRoot) {
  const transcript = {
    ...row('sess_root', 'Workflow review'),
    exported_at: at(9),
    children: [
      row('sess_draft', 'draft', 'sess_root'),
      row('sess_fork', 'draft~1', 'sess_root'),
      row('sess_review', 'review', 'sess_root'),
    ],
  };
  const data = {
    transcript,
    transcript_views: views,
    manifest: { mode: 'transcript', omissions: [], files: [], artifacts: [] },
    snapshot: { responses, sessions: {}, tables: {}, failures: [] },
    embedded_tool_outputs: {},
  };
  return archiveExportHtml(webRoot, data, 'Workflow review');
}

/**
 * An export page as the service assembles one: the production offline renderer
 * with `data` gzip-packed into the page, under the export's Content-Security-Policy.
 */
export function archiveExportHtml(webRoot, data, title) {
  const javascript = readFileSync(resolve(webRoot, 'dist/offline-review.js'), 'utf8');
  const stylesheet = readFileSync(resolve(webRoot, 'dist/offline-review.css'), 'utf8');
  const packed = gzipSync(Buffer.from(JSON.stringify(data))).toString('base64');
  const scripts = [
    `window.CLIO_EXPORT_DATA=${JSON.stringify(packed)};`,
    javascript.replace(/<\/script/giu, '<\\/script'),
  ];
  const hashes = scripts
    .map((script) => `'sha256-${createHash('sha256').update(script).digest('base64')}'`)
    .join(' ');
  const policy =
    `default-src 'none'; script-src ${hashes} 'unsafe-eval'; style-src 'unsafe-inline'; ` +
    "img-src 'self' blob: data:; media-src 'self' blob: data:; font-src data:; " +
    'worker-src blob:; connect-src blob: data:';
  return (
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    `<meta http-equiv="Content-Security-Policy" content="${policy}">` +
    `<title>${title} · archive</title><style>${stylesheet}</style></head><body>` +
    '<div id="archive-status" role="status"></div>' +
    '<div id="archive-document"><p>Saved document.</p></div><div id="root" hidden></div>' +
    scripts.map((script) => `<script>${script}</script>`).join('') +
    '</body></html>'
  );
}
