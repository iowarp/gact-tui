import { createRoot } from 'react-dom/client';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Message, SubagentRun, ToolInvocation } from '@clio/core/v3';
import '../../src/index.css';
import { ForcedTheme } from '../../src/theme/forced-theme';
import { APPEARANCE_STORAGE_KEY } from '../../src/theme/preference';
import { ArchiveConnectionProvider } from '../../src/providers/connection-provider';
import { AppearanceProvider } from '../../src/providers/appearance-provider';
import { ConversationDisplayProvider } from '../../src/providers/conversation-display-provider';
import { ClioConversation } from '../../src/components/clio/conversation';
import { ClioMotionProvider } from '../../src/components/clio/motion';
import { TooltipProvider } from '../../src/components/ui/tooltip';
import type { ClioConversationProps } from '../../src/components/clio/conversation-types';

/*
 * Production transcript components rendering the states of
 * docs/design/visual-language/conversation-states.html with the spec's own content.
 * `transcript-spec-compare.mjs` screenshots each `data-spec-state` section next to
 * the matching spec crop. `?state=<id>` renders one state, `?theme=dark|light`.
 *
 * `data-spec-expand` lists the tool rows the capture opens, in order;
 * `data-spec-hover` names what it hovers; `data-spec-dialog` the ⓘ it clicks.
 */

const params = new URLSearchParams(window.location.search);
const scheme = params.get('theme') === 'light' ? 'light' : 'dark';
// Notebook follows the colour scheme the capture emulates; plain palettes are pinned.
const theme = params.get('palette') === 'notebook' ? 'notebook' : scheme;
const only = params.get('state');
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
// AppearanceProvider re-applies the stored choice after ForcedTheme; store the same one.
window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify({ theme }));

const SESSION = 'sess_opal';
const now = Date.now();
const ago = (seconds: number) => new Date(now - seconds * 1000).toISOString();
const at = (hour: number, minute: number, second = 0) =>
  new Date(2026, 9, 8, hour, minute, second).toISOString();
const model = { provider_id: 'openrouter', model_id: 'mercury-3' };

const PROMPT = 'Regrid the 2020–2023 soil moisture to 0.25° and check the Opal sites.';
const PLAN =
  'I’ll fix the grid script, run the regrid on four ranks, and have NDP explorer check the sites.';
const DELEGATE_TASK = 'find SMAP L3 granules since 2020, check the sites';
const REGRID = 'srun -n 4 python regrid.py --grid 0.25';
const QC = 'python qc_sites.py --strict';
const QC_ERROR =
  'PermissionError: [Errno 13] /scratch/jc/opal/qc/AZ-07.csv\n  at qc_sites.py:88 in write_flags';

const ALIGN_DIFF = [
  '--- a/scripts/align_grids.sh',
  '+++ b/scripts/align_grids.sh',
  '@@ -11,4 +11,6 @@',
  ' module load hdf5/1.14',
  ' module load python/3.12',
  '-python regrid.py --all',
  '+SITES=data/ndp/soil_sites.csv',
  '+python scripts/soil_qc.py "$SITES" \\',
  '+  --grid 0.25 --from 2020',
  ' srun -n 4 regrid.py',
].join('\n');

const REGRID_OUTPUT = [
  '[rank 0] reading data/ndp/soil_moisture.h5',
  '[rank 0] 2020/sm 365×720×1440',
  '[rank 1] 2021/sm 365×720×1440',
  '[rank 2] regridding 0.25° … 41%',
  '[rank 3] regridding 0.25° … 38%',
].join('\n');

const BOUNDARY = {
  kind: 'write_denied',
  confidence: 'confirmed',
  mechanism: 'landlock',
  paths: ['/scratch/jc/opal'],
  request_roots: ['/scratch/jc/opal'],
  message: 'Blocked by the sandbox: /scratch/jc/opal',
};

function editTool(): ToolInvocation {
  return {
    id: 'edit',
    session_id: SESSION,
    name: 'fs_edit_file',
    title: 'Edit file',
    state: 'succeeded',
    input: {
      path: 'scripts/align_grids.sh',
      old_string: 'python regrid.py --all',
      new_string:
        'SITES=data/ndp/soil_sites.csv\npython scripts/soil_qc.py "$SITES" \\\n  --grid 0.25 --from 2020',
    },
    output: { path: 'scripts/align_grids.sh', added: 3, removed: 1 },
    started_at: at(10, 0, 8),
    completed_at: at(10, 0, 8),
    duration_ms: 400,
    presentation: {
      action: 'Edit file',
      subject: 'target',
      summary: '+3 −1',
      blocks: [
        {
          id: 'target',
          type: 'link',
          target: 'file',
          uri: 'scripts/align_grids.sh',
          label: 'scripts/align_grids.sh',
        },
        { id: 'diff', type: 'diff', path: 'scripts/align_grids.sh', text: ALIGN_DIFF },
      ],
    },
  };
}

function regridTool(): ToolInvocation {
  return {
    id: 'regrid',
    session_id: SESSION,
    name: 'shell_bash',
    title: 'Run command',
    state: 'running',
    input: { command: REGRID, cwd: '~/opal-sites', host: 'ares' },
    started_at: ago(41),
    output_stream: `${REGRID_OUTPUT}\n`,
    presentation: {
      action: 'Run command',
      summary: '',
      blocks: [{ id: 'terminal', type: 'terminal', command: REGRID, text: `${REGRID_OUTPUT}\n` }],
    },
  };
}

function delegateTool(finished = false): ToolInvocation {
  return {
    id: 'delegate',
    session_id: SESSION,
    name: 'spawn_agent_task',
    title: 'Delegate',
    state: finished ? 'succeeded' : 'running',
    input: { name: 'NDP explorer', task: DELEGATE_TASK },
    output: { task_id: 'task_ndp', child_session_id: 'sess_ndp' },
    started_at: finished ? at(10, 1, 0) : ago(12),
    completed_at: finished ? at(10, 13, 4) : undefined,
    duration_ms: finished ? 724_000 : undefined,
  };
}

function subagent(finished = false): SubagentRun {
  return {
    id: 'task_ndp',
    session_id: SESSION,
    child_session_id: 'sess_ndp',
    agent_id: 'ndp-explorer',
    title: 'NDP explorer',
    state: finished ? 'completed' : 'running',
    task: DELEGATE_TASK,
    duration_ms: finished ? 724_000 : undefined,
  };
}

function searchTool(parent: string): ToolInvocation {
  return {
    id: 'ndp-search',
    session_id: SESSION,
    parent_call_id: parent,
    name: 'ndp_search',
    state: 'succeeded',
    input: { query: 'SMAP_L3_SM_P', since: '2020-01-01' },
    output: { hits: 12 },
    started_at: ago(11),
    completed_at: ago(9),
    duration_ms: 2100,
    presentation: {
      action: 'ndp_search',
      subject: 'query',
      summary: '12 hits',
      blocks: [{ id: 'query', type: 'text', text: 'SMAP_L3_SM_P' }],
    },
  };
}

function scriptTool(parent: string, summary: string): ToolInvocation {
  return {
    id: 'soil-qc',
    session_id: SESSION,
    parent_call_id: parent,
    name: 'run_code',
    state: 'running',
    input: { path: 'scripts/soil_qc.py', language: 'python' },
    started_at: ago(8.2),
    presentation: {
      action: 'Run script',
      subject: 'script',
      summary,
      blocks: [
        {
          id: 'script',
          type: 'link',
          target: 'file',
          uri: 'scripts/soil_qc.py',
          label: 'soil_qc.py',
        },
        {
          id: 'source',
          type: 'code',
          language: 'python',
          start_line: 1,
          text: [
            'import pandas as pd',
            'from pathlib import Path',
            'from ndp import fetch, granules',
            'SITES = Path("data/ndp/soil_sites.csv")',
          ].join('\n'),
        },
      ],
    },
  };
}

function readTool(parent: string): ToolInvocation {
  return {
    id: 'read-sites',
    session_id: SESSION,
    parent_call_id: parent,
    name: 'fs_read_file',
    state: 'succeeded',
    input: { path: 'data/ndp/soil_sites.csv' },
    output: 'site,network,lat,lon\nAZ-07,SCAN,35.6,-101.2\n',
    started_at: ago(7),
    completed_at: ago(6.9),
    duration_ms: 100,
    presentation: { action: 'Read file', summary: '', blocks: [] },
  };
}

function blockedTool(parent?: string): ToolInvocation {
  return {
    id: 'qc-sites',
    session_id: SESSION,
    parent_call_id: parent,
    name: 'shell_bash',
    title: 'Run command',
    state: 'failed',
    input: { command: QC, cwd: '~/opal-sites' },
    output: { exit_code: 1, stderr: QC_ERROR, boundary: BOUNDARY },
    error: QC_ERROR,
    // Nested under the live script it must follow the earlier Read file child.
    started_at: parent ? ago(5) : at(10, 42, 7),
    completed_at: parent ? ago(1.6) : at(10, 42, 10),
    duration_ms: 3400,
    submission: {
      state: 'succeeded',
      output: { accepted: true, handle: 'exec_7f3k', sandbox: 'on' },
      completed_at: at(10, 42, 7),
      duration_ms: 40,
    },
    presentation: {
      action: 'Run command',
      status: 'failed',
      summary: 'exit 1',
      blocks: [{ id: 'terminal', type: 'terminal', command: QC, text: QC_ERROR, exit_code: 1 }],
    },
  };
}

function record(...tools: ToolInvocation[]): Record<string, ToolInvocation> {
  return Object.fromEntries(tools.map((tool) => [tool.id, tool]));
}

function userMessage(id: string, text: string, created = at(10, 0)): Message {
  return {
    id,
    session_id: SESSION,
    role: 'user',
    created_at: created,
    model,
    blocks: [{ id: `${id}-text`, type: 'text', text }],
  };
}

function reasoning(id: string, streaming = false) {
  return {
    id,
    type: 'reasoning' as const,
    provider_source: 'openrouter',
    text: 'The grid script still points at the full run. Fix it first, then regrid on four ranks while the delegate checks the sites.',
    started_at: at(10, 0, 1),
    completed_at: streaming ? undefined : at(10, 0, 7),
    duration_ms: streaming ? undefined : 6000,
    streaming,
  };
}

function liveTurn(blocks: Message['blocks']): Message {
  return {
    id: 'turn',
    run_id: 'run_opal',
    turn_id: 'turn_opal',
    session_id: SESSION,
    role: 'assistant',
    created_at: at(10, 0, 1),
    model,
    blocks,
  };
}

const toolBlock = (id: string) => ({ id: `tool-${id}`, type: 'tool' as const, tool_id: id });

const handlers: Partial<ClioConversationProps> = {
  onRetryMessage: () => undefined,
  onForkFromMessage: () => undefined,
  onRewindToMessage: () => undefined,
  onMarkMessage: async () => undefined,
};

interface State {
  id: string;
  title: string;
  height: number;
  expand?: string[];
  hover?: string;
  dialog?: string;
  props: () => ClioConversationProps;
}

const conversationTurn = (): ClioConversationProps => ({
  messages: [
    userMessage('prompt', PROMPT),
    liveTurn([
      reasoning('thought'),
      { id: 'plan', type: 'text', channel: 'next_thought', text: PLAN },
      toolBlock('edit'),
      toolBlock('regrid'),
      toolBlock('delegate'),
    ]),
  ],
  tools: record(
    editTool(),
    regridTool(),
    delegateTool(),
    searchTool('delegate'),
    scriptTool('delegate', 'waiting for you'),
  ),
  subagents: { task_ndp: subagent() },
  tasks: {},
  artifacts: {},
  surfaces: {},
  sessionId: SESSION,
  agentName: 'CLIO',
  preparation: { sessionState: 'running', activeTurnId: 'run_opal' },
});

const STATES: State[] = [
  {
    id: 'conversation',
    title: 'In a conversation',
    height: 760,
    expand: ['delegate'],
    props: conversationTurn,
  },
  {
    id: 'activity-row',
    title: 'Activity row, in the transcript',
    height: 1500,
    expand: ['edit', 'regrid', 'delegate', 'soil-qc'],
    props: () => ({
      messages: [
        userMessage('prompt', PROMPT),
        liveTurn([
          toolBlock('edit'),
          toolBlock('regrid'),
          toolBlock('delegate'),
          reasoning('thinking', true),
        ]),
      ],
      tools: record(
        editTool(),
        regridTool(),
        delegateTool(),
        searchTool('delegate'),
        scriptTool('delegate', '2 of 5 calls'),
        readTool('soil-qc'),
        blockedTool('soil-qc'),
      ),
      subagents: { task_ndp: subagent() },
      tasks: {},
      artifacts: {},
      surfaces: {},
      sessionId: SESSION,
      preparation: { sessionState: 'running', activeTurnId: 'run_opal' },
    }),
  },
  {
    id: 'info-dialog',
    title: 'ⓘ opened',
    height: 520,
    dialog: 'qc-sites',
    props: () => ({
      messages: [
        userMessage('prompt', 'Check the Opal sites against the field probes.'),
        liveTurn([toolBlock('qc-sites')]),
      ],
      tools: record(blockedTool()),
      subagents: {},
      tasks: {},
      artifacts: {},
      surfaces: {},
      sessionId: SESSION,
      preparation: { sessionState: 'running', activeTurnId: 'run_opal' },
    }),
  },
  {
    id: 'right-edge',
    title: 'The right edge',
    height: 520,
    props: () => ({
      messages: [
        userMessage('prompt', PROMPT),
        liveTurn([
          toolBlock('edit'),
          toolBlock('regrid'),
          toolBlock('delegate'),
          reasoning('thought'),
        ]),
      ],
      tools: record(editTool(), regridTool(), delegateTool(true)),
      subagents: { task_ndp: subagent(true) },
      tasks: {},
      artifacts: {},
      surfaces: {},
      sessionId: SESSION,
      preparation: { sessionState: 'running', activeTurnId: 'run_opal' },
    }),
  },
  {
    id: 'message',
    title: 'A message',
    height: 440,
    hover: 'answer',
    props: () => ({
      messages: [
        userMessage('prompt', 'Regrid the 2020–2023 soil moisture to 0.25°.', at(10, 0)),
        {
          id: 'answer',
          run_id: 'run_done',
          turn_id: 'turn_done',
          session_id: SESSION,
          role: 'assistant',
          created_at: at(10, 1, 54),
          completed_at: at(10, 2),
          stop_reason: 'end_turn',
          model,
          usage: { input: 18400, output: 212, cache_read: 15100, cache_write: 0 },
          metadata: { duration_ms: 6000, first_token_ms: 600 },
          blocks: [
            {
              id: 'answer-text',
              type: 'text',
              channel: 'answer',
              text: 'Done. The regrid is in `out/sm_025.h5`; two sites need a manual look.',
            },
          ],
        },
      ],
      tools: {},
      subagents: {},
      tasks: {},
      artifacts: {},
      surfaces: {},
      sessionId: SESSION,
      agentName: 'CLIO',
      preparation: { sessionState: 'completed', activeTurnId: 'run_done' },
      ...handlers,
    }),
  },
  {
    id: 'inline-states',
    title: 'Inline, in the transcript',
    height: 760,
    props: () => ({
      messages: [
        userMessage('forked-prompt', 'Regrid the 2020–2023 soil moisture to 0.25°.', at(9, 40)),
        {
          id: 'failed-reply',
          session_id: SESSION,
          role: 'assistant',
          created_at: at(9, 40, 3),
          completed_at: at(9, 40, 9),
          stop_reason: 'error',
          error_info: { code: 'stream_interrupted', message: 'The reply did not load.' },
          blocks: [
            {
              id: 'failed-reply-error',
              type: 'error',
              code: 'stream_interrupted',
              message: 'The reply did not load.',
              recoverable: true,
            },
          ],
        },
        {
          id: 'summary',
          session_id: SESSION,
          role: 'assistant',
          created_at: at(9, 58),
          blocks: [
            {
              id: 'summary-injection',
              type: 'injection',
              source: 'summarization',
              trigger: 'auto',
              compaction_id: 'cmp_opal',
              text: '61 messages summarized: the SMAP L3 search, the 0.25° grid choice, and the 14 Opal sites to check.',
            },
          ],
        },
        userMessage('prompt', PROMPT),
      ],
      tools: {},
      subagents: {},
      tasks: {},
      artifacts: {},
      surfaces: {},
      sessionId: SESSION,
      earlier: { hasEarlier: true, loading: true, load: () => undefined },
      forkOrigin: {
        session_id: 'sess_soil',
        message_id: 'forked-prompt',
        message_count: 1,
        created_at: at(9, 41),
        title: 'Soil moisture regrid',
      },
      preparation: { sessionState: 'completed', activeTurnId: 'run_done' },
      ...handlers,
    }),
  },
  {
    id: 'narrow',
    title: 'When space is narrow',
    height: 760,
    expand: ['delegate'],
    props: conversationTurn,
  },
];

function Section({ state, children }: { state: State; children: ReactNode }) {
  return (
    <section
      aria-label={state.title}
      className="mx-auto flex w-full max-w-[1280px] flex-col border-b"
      data-spec-state={state.id}
      data-spec-expand={state.expand?.join(',') || undefined}
      data-spec-hover={state.hover}
      data-spec-dialog={state.dialog}
    >
      <h2 className="px-5 py-2 text-xs font-medium text-muted-foreground" data-spec-caption>
        {state.title}
      </h2>
      <div className="min-h-0 min-w-0" data-spec-body style={{ height: state.height }}>
        {children}
      </div>
    </section>
  );
}

function Review() {
  const states = only ? STATES.filter((state) => state.id === only) : STATES;
  return (
    <main className="min-h-dvh min-w-0 bg-background text-foreground">
      {states.map((state) => (
        <Section key={state.id} state={state}>
          <ClioConversation {...state.props()} />
        </Section>
      ))}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <ArchiveConnectionProvider>
      <ForcedTheme theme={theme}>
        <AppearanceProvider>
          <ClioMotionProvider>
            <TooltipProvider delayDuration={450}>
              <ConversationDisplayProvider>
                <Review />
              </ConversationDisplayProvider>
            </TooltipProvider>
          </ClioMotionProvider>
        </AppearanceProvider>
      </ForcedTheme>
    </ArchiveConnectionProvider>
  </QueryClientProvider>,
);
