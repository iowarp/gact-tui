// A session export of a subagent tree three levels deep, assembled as the
// service assembles one, with no subagent records: each child is known only from
// the call that started it. Root delegates level 1 on a named model; level 1
// forks itself and spawns an explore child. Synthetic renderer data.

import { archiveExportHtml } from './workflow-export-fixture.mjs';

const at = (second) => `2026-10-27T09:46:${String(second).padStart(2, '0')}Z`;
const empty = { tasks: [], subagents: [], artifacts: [], surfaces: [] };

function session(id, title, extra = {}) {
  return {
    id,
    workspace_id: 'ws_1',
    title,
    state: 'completed',
    created_at: at(0),
    updated_at: at(30),
    provider_id: 'local',
    model_id: 'model-b',
    agent_id: 'standard',
    ...extra,
  };
}

const identity = (type, label, uri = '') => ({
  subject: 'task-0-identity',
  summary: '1 task',
  blocks: [
    { id: 'task-0-identity', type, label, ...(type === 'link' ? { target: 'session', uri } : {}) },
  ],
});

const tools = {
  spawn: {
    id: 'call_spawn',
    session_id: 'sess_root',
    name: 'spawn_agent_task',
    state: 'succeeded',
    input: { agent: '', task: 'You are level 1.', model: 'local/model-b', name: 'level 1' },
    output: {
      accepted: true,
      assignment: 'You are level 1.',
      handle: 'task_l1',
      model: {
        asked: 'local/model-b',
        ran: { provider_id: 'local', model_id: 'model-b' },
        source: 'explicit',
      },
      session_id: 'sess_l1',
    },
    presentation: identity('link', 'Subagent', 'sess_l1'),
    started_at: at(1),
    completed_at: at(2),
  },
  fork: {
    id: 'call_fork',
    session_id: 'sess_l1',
    name: 'fork',
    state: 'succeeded',
    input: { note: 'Reply with the words fork of level 1.' },
    output: {
      forked: true,
      handle: 'task_fork',
      label: 'level 1~1',
      note: 'Reply with the words fork of level 1.',
      session_id: 'sess_fork',
    },
    presentation: identity('text', 'level 1~1'),
    started_at: at(10),
    completed_at: at(11),
  },
  explore: {
    id: 'call_explore',
    session_id: 'sess_l1',
    name: 'spawn_agent_task',
    state: 'succeeded',
    input: { agent: 'explore', task: 'List the workspace root.', name: 'explore root' },
    output: {
      accepted: true,
      assignment: 'List the workspace root.',
      handle: 'task_explore',
      model: { ran: { provider_id: 'local', model_id: 'model-b' }, source: 'inherited' },
      session_id: 'sess_explore',
    },
    presentation: identity('link', 'Subagent', 'sess_explore'),
    started_at: at(11),
    completed_at: at(12),
  },
};

const reply = (sessionId, calls, answer, assignment) => ({
  ...empty,
  tools: calls,
  messages: [
    {
      id: `m_${sessionId}`,
      session_id: sessionId,
      role: 'assistant',
      created_at: at(5),
      blocks: [
        ...(assignment
          ? [{ id: `d_${sessionId}`, type: 'injection', source: 'delegation', text: assignment }]
          : []),
        ...calls.map((call) => ({ id: `b_${call.id}`, type: 'tool', tool_id: call.id })),
        { id: `a_${sessionId}`, type: 'text', text: answer, channel: 'answer' },
      ],
    },
  ],
});

const views = {
  sess_root: {
    ...reply('sess_root', [tools.spawn], 'The chain completed.'),
    messages: [
      {
        id: 'm_ask',
        session_id: 'sess_root',
        role: 'user',
        created_at: at(0),
        blocks: [{ id: 'm_ask_t', type: 'text', text: 'Run the tree.' }],
      },
      ...reply('sess_root', [tools.spawn], 'The chain completed.').messages,
    ],
  },
  sess_l1: reply('sess_l1', [tools.fork, tools.explore], 'Level 1 is done.', 'You are level 1.'),
  sess_fork: reply('sess_fork', [], 'fork of level 1', 'Reply with the words fork of level 1.'),
  sess_explore: reply('sess_explore', [], 'readme.txt', 'List the workspace root.'),
};

// The service files a fork under whoever waits on it, and lists children newest first.
const row = (id, title, parent, created) => ({
  session: { id, title, created_at: created, metadata: {} },
  messages: [],
  tool_records: [],
  loaded_skills: [],
  recording: null,
  ...(parent
    ? { relationship: { session_id: id, parent_session_id: parent, attribution: 'agent_task' } }
    : {}),
});

const json = (value) => ({ json: value });

/** The export page's HTML, as a reader opens it from disk. */
export function subagentTreeExportHtml(webRoot) {
  const data = {
    transcript: {
      ...row('sess_root', 'Subagent tree'),
      exported_at: at(40),
      children: [
        row('sess_explore', 'explore root', 'sess_l1', at(10)),
        row('sess_fork', 'level 1~1', 'sess_root', at(10)),
        row('sess_l1', 'level 1', 'sess_root', at(1)),
      ],
    },
    transcript_views: views,
    manifest: { mode: 'transcript', omissions: [], files: [], artifacts: [] },
    snapshot: {
      responses: {
        'GET /v1/sessions/sess_root': json(session('sess_root', 'Subagent tree')),
        'GET /v1/sessions/sess_l1': json(session('sess_l1', 'level 1')),
        'GET /v1/sessions/sess_fork': json(session('sess_fork', 'level 1~1')),
        'GET /v1/sessions/sess_explore': json(
          session('sess_explore', 'explore root', { agent_id: 'explore' }),
        ),
        'GET /v1/sessions/sess_root/science-log': json({
          session_id: 'sess_root',
          in_study: false,
        }),
      },
      sessions: {},
      tables: {},
      failures: [],
    },
    embedded_tool_outputs: {},
  };
  return archiveExportHtml(webRoot, data, 'Subagent tree');
}
