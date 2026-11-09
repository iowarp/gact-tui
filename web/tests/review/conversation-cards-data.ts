import type { A2UISurface, PendingInteraction } from '@clio/core/v3';
import { CLIO_A2UI_CATALOG_ID } from '../../src/test-fixtures/a2ui/v0_9_1/fixtures';

/** Seeded decision-card data shaped after the conversation-states spec (v24). */
export interface CardScenario {
  interactions: PendingInteraction[];
  /** Spec cell the capture pairs this state with. */
  spec: string;
  /** The spec has no cell for this state; spec is the closest one. */
  closest?: boolean;
  ownerLabels?: Record<string, string>;
  surfaces?: Record<string, A2UISurface>;
  /** Fixed container width, for the narrow-window cells. */
  width?: number;
  /** The first response fails, so the card shows its own error. */
  failFirst?: boolean;
  /** The capture presses this button first (a disclosure such as Technical details). */
  open?: string;
  /** Transcript rows instead of the docked card. */
  view?: 'answered-rows';
}

const ROOT = 'sess_root';
const NDP = 'sess_ndp';
const COMMAND = 'python qc_sites.py --strict --out /scratch/jc/opal/qc';
const EXECUTION = { computer: 'ares Slurm login node', cwd: '~/opal-sites' };
const OWNERS = { [NDP]: 'NDP explorer' };

function base(id: string, overrides: Partial<PendingInteraction>): PendingInteraction {
  return {
    id,
    kind: 'permission',
    owner_session_id: ROOT,
    attended_session_id: ROOT,
    status: 'pending',
    title: 'Response requested',
    requires_human_response: true,
    source: { protocol: 'native' },
    created_at: '2026-11-08T12:00:00Z',
    ...overrides,
  };
}

const runCommand = base('permission:run-command', {
  title: 'Run command',
  owner_session_id: NDP,
  source: { protocol: 'native', tool_name: 'run_command' },
  actions: ['allow', 'allow_session', 'allow_workspace', 'deny'],
  payload: {
    permission_id: 'run-command',
    execution: EXECUTION,
    tool_call: {
      tool_name: 'run_command',
      input: {
        command: COMMAND,
        cwd: '~/opal-sites',
        timeout_s: 600,
        _clio_task_description:
          'Check the 14 Opal sites against the field probes before the regrid',
      },
    },
  },
});

const submitArray = base('permission:sbatch', {
  title: 'Run command',
  source: { protocol: 'native', tool_name: 'run_command' },
  actions: ['allow', 'allow_session', 'deny'],
  payload: {
    permission_id: 'sbatch',
    execution: EXECUTION,
    tool_call: {
      tool_name: 'run_command',
      input: {
        command: 'sbatch --array=1-40 jobs/fit.slurm',
        _clio_task_description: 'Fit the 40 site models on the cluster',
      },
    },
  },
});

const SCRIPT = [
  'import pandas as pd',
  'from pathlib import Path',
  'from ndp import fetch, granules',
  'SITES = Path("data/ndp/soil_sites.csv")',
  'sel = sites[sites.network.isin(["SCAN", "USCRN"]) & sites.lat.between(35.2, 41.9) & sites.lon.between(-104.1, -94.6) & sites.active & ~sites.flagged]',
  'OUT = Path("/scratch/jc/opal/qc")',
  'for site in sel.itertuples():',
  '    g = granules("SMAP_L3_SM_P", site.lat, site.lon)',
  '    df = fetch(g, OUT / site.id)',
  '    df["flag"] = (df.sm < 0.0) | (df.sm > 0.6)',
  '    df.to_csv(OUT / f"{site.id}.csv")',
  '',
  '# summary across sites',
  'summary = pd.concat(frames)',
  ...Array.from({ length: 50 }, (_, index) =>
    index % 5 === 4 ? '' : `summary["probe_${index}"] = summary.sm.rolling(${index + 2}).mean()`,
  ),
].join('\n');

const runScript = base('permission:run-script', {
  title: 'Run script',
  owner_session_id: NDP,
  source: { protocol: 'native', tool_name: 'run_code' },
  actions: ['allow', 'allow_session', 'allow_workspace', 'allow_script', 'deny'],
  payload: {
    permission_id: 'run-script',
    execution: EXECUTION,
    script: { call_id: 'call_soil_qc', code: SCRIPT },
    tool_call: {
      tool_name: 'run_command',
      input: {
        command: COMMAND,
        _clio_task_description:
          'Match every SCAN and USCRN site to its SMAP granules, then flag outliers',
      },
    },
  },
});

const folderAccess = base('permission:folder-access', {
  title: 'Allow writing to /scratch/jc/opal?',
  source: { protocol: 'native', tool_name: 'shell_bash' },
  actions: ['deny', 'allow_workspace'],
  payload: {
    permission_id: 'folder-access',
    tool_call: { tool_name: 'shell_bash', input: { command: COMMAND } },
    access: {
      folders: ['/scratch/jc/opal', '/scratch/jc/opal/qc'],
      computer: 'ares Slurm login node',
      workspace_id: 'opal-sites',
      operation: 'shell_bash',
      command: COMMAND,
      paths: ['/scratch/jc/opal/qc/flags.csv', '/scratch/jc/opal/qc/summary.png'],
      cwd: '~/opal-sites',
      reason: 'Write the site flags and the summary plot next to the regridded data.',
      access: 'read_write',
      scope: 'workspace',
    },
  },
});

/** Every fact at once: Runs on, Asked by and Folders. */
const allFacts = base('permission:facts', {
  ...folderAccess,
  title: 'Run command',
  owner_session_id: NDP,
  source: { protocol: 'native', tool_name: 'run_command' },
  actions: ['allow', 'allow_session', 'allow_workspace', 'deny'],
  payload: {
    ...folderAccess.payload,
    permission_id: 'facts',
    execution: EXECUTION,
    tool_call: runCommand.payload?.tool_call,
  },
});

const webFetch = base('permission:web-fetch', {
  title: 'external MCP tool call: web_fetch',
  owner_session_id: NDP,
  source: { protocol: 'native', tool_name: 'web_fetch' },
  actions: ['allow', 'allow_session', 'deny'],
  payload: {
    tool_call: {
      tool_name: 'web_fetch',
      input: {
        target: 'https://nsidc.org/data/spl3smp/versions/9',
        to_file: false,
        _clio_task_description: 'Read the SMAP L3 version 9 quality flag documentation',
      },
    },
  },
});

const flowTrust = base('permission:flow-trust', {
  title: 'Run the debate flow, written by Clio, which is not trusted yet',
  source: { protocol: 'native', tool_name: 'run_flow' },
  actions: ['allow', 'allow_session', 'allow_workspace', 'deny'],
  payload: {
    permission_id: 'flow-trust',
    tool_call: {
      tool_name: 'run_flow',
      input: {
        flow: 'debate',
        plugin: 'debate',
        version: '0.2.0',
        author: 'Clio',
        authored_by_clio: true,
        file: 'ai.iowarp.clio/flows/debate.py',
        review_url: '/v1/plugins/debate/review',
        input: { question: 'Regrid to 0.25° or keep the native 36 km grid?' },
        options: { sides: 2 },
      },
    },
  },
});

const regridYears = base('question:regrid-years', {
  kind: 'question',
  title: 'Which years should the regrid cover?',
  prompt: 'Which years should the regrid cover?',
  actions: ['answer', 'cancel'],
  payload: {
    question_id: 'regrid-years',
    question_kind: 'choice',
    allow_freeform: true,
    options: [
      { label: '2020–2023', value: '2020-2023', description: 'the SMAP years you fetched' },
      { label: '2015–2023', value: '2015-2023', description: 'adds the older AMSR-E data' },
      { label: 'Only 2023', value: '2023' },
    ],
  },
});

const gridSize = base('question:grid', {
  kind: 'question',
  title: 'Which grid should the output use?',
  prompt: 'Which grid should the output use?',
  actions: ['answer', 'cancel'],
  payload: {
    question_id: 'grid',
    question_kind: 'choice',
    options: [
      { label: '0.25°', value: '0.25' },
      { label: '36 km', value: '36km' },
    ],
  },
});

const networks = base('question:networks', {
  kind: 'question',
  title: 'Which site networks should the check include?',
  prompt: 'Which site networks should the check include?',
  actions: ['answer', 'cancel'],
  payload: {
    question_id: 'networks',
    question_kind: 'multi_choice',
    allow_freeform: true,
    options: [
      { label: 'SCAN', value: 'scan', description: '214 sites, hourly soil moisture' },
      { label: 'USCRN', value: 'uscrn', description: '114 sites, five depths' },
      { label: 'SNOTEL', value: 'snotel', description: 'mountain sites, snow years only' },
    ],
  },
});

const summaryText = base('question:summary', {
  kind: 'question',
  title: 'What should the summary plot show?',
  prompt: 'What should the summary plot show?',
  actions: ['answer', 'cancel'],
  payload: { question_id: 'summary', question_kind: 'freeform', allow_freeform: true },
});

const bundle = base('question:bundle', {
  kind: 'question',
  title: 'Plan the analysis',
  actions: ['answer', 'cancel'],
  payload: {
    mode: 'form',
    metadata: {
      question_bundle: {
        questions: [
          {
            id: 'view',
            question: 'Which view should the report lead with?',
            allow_freeform: false,
            options: [
              { value: 'table', label: 'Table', description: 'Sortable rows per site' },
              { value: 'plot', label: 'Plot', description: 'Soil moisture over time' },
            ],
          },
          {
            id: 'scope',
            question: 'Which region?',
            allow_freeform: true,
            options: [
              { value: 'opal', label: 'The 14 Opal sites' },
              { value: 'plains', label: 'All of the southern plains' },
            ],
          },
        ],
      },
    },
  },
});

const SURFACE_ID = 'surface_years';
const surface: A2UISurface = {
  id: SURFACE_ID,
  session_id: NDP,
  run_id: 'run_1',
  message_id: 'message_1',
  part_id: 'part_1',
  catalog_id: CLIO_A2UI_CATALOG_ID,
  protocol_version: '0.9.1',
  revision: 1,
  state: 'ready',
  messages: [
    {
      version: 'v0.9.1',
      createSurface: { surfaceId: SURFACE_ID, catalogId: CLIO_A2UI_CATALOG_ID },
    },
    {
      version: 'v0.9.1',
      updateComponents: {
        surfaceId: SURFACE_ID,
        components: [
          { id: 'root', component: 'Column', children: ['prompt', 'action'] },
          { id: 'prompt', component: 'Text', text: 'Pick the years to regrid, then submit.' },
          { id: 'label', component: 'Text', text: 'Submit 2020–2023' },
          {
            id: 'action',
            component: 'Button',
            child: 'label',
            action: { event: { name: 'form.submit', context: { years: '2020-2023' } } },
          },
        ],
      },
    },
  ],
};

function surfaceQuestion(inline: boolean) {
  return base(`a2ui:${NDP}:${SURFACE_ID}`, {
    kind: 'a2ui',
    title: 'Choose the regrid years',
    owner_session_id: NDP,
    source: { protocol: 'native', surface_id: SURFACE_ID },
    actions: ['form.submit', 'cancel'],
    ...(inline ? { payload: { metadata: { a2ui_presentation: 'inline' } } } : {}),
  });
}

const PLAN = `# Soil moisture regrid

Regrid SMAP L3 for 2020–2023 to 0.25° and check the 14 Opal sites against the field probes.

## Steps

1. Fix the grid bounds in \`align_grids.sh\`
2. Regrid 2020–2023 on four ranks
3. Check the 14 Opal sites against the probes
4. Write \`out/qc.csv\` and a summary plot

## Execution recommendation

Interactive. Step 2 holds four ranks for about 40 minutes.

## Risks

- Two sites sit on a grid edge and may need a manual check.
- 2020 granules use the older QC flags.
`;

function plan(status: 'complete' | 'truncated', content = PLAN) {
  return base('question:plan_exit', {
    kind: 'question',
    title: 'Review execution plan',
    prompt: 'Approve the saved plan?',
    source: { protocol: 'native', tool_name: 'plan_exit' },
    actions: ['answer', 'cancel'],
    payload: {
      question_id: 'plan_exit',
      question_kind: 'choice',
      plan_exit: {
        summary: 'Regrid SMAP L3 for 2020–2023 to 0.25° and check the 14 Opal sites.',
        recommended_mode: 'interactive',
        risk_notes: 'Two sites sit on a grid edge. 2020 granules use the older QC flags.',
        plan_file: 'plans/soil-regrid.md',
        plan_content: content,
        plan_content_status: status,
      },
      options: [
        { label: 'Approve — interactive', value: 'interactive' },
        { label: 'Approve — auto-execute', value: 'auto' },
        { label: 'Approve — exit only', value: 'exit_only' },
        { label: 'Request changes — keep planning', value: 'reject' },
        { label: 'Also clear context (modifier)', value: 'clear_context' },
      ],
    },
  });
}

export const SCENARIOS: Record<string, CardScenario> = {
  'permission-command': {
    spec: 'Permission',
    interactions: [runCommand, submitArray],
    ownerLabels: OWNERS,
  },
  'permission-script': {
    spec: 'A whole script',
    interactions: [runScript, runCommand],
    ownerLabels: OWNERS,
  },
  'permission-access': { spec: 'Permission', closest: true, interactions: [folderAccess] },
  'permission-facts': {
    spec: 'Permission',
    closest: true,
    interactions: [allFacts],
    ownerLabels: OWNERS,
  },
  'permission-arguments': {
    spec: 'Permission',
    closest: true,
    interactions: [runCommand],
    ownerLabels: OWNERS,
    open: 'Technical details',
  },
  'permission-web': {
    spec: 'Permission',
    closest: true,
    interactions: [webFetch],
    ownerLabels: OWNERS,
  },
  'permission-flow-trust': { spec: 'Permission', closest: true, interactions: [flowTrust] },
  'permission-error': {
    spec: 'Permission',
    closest: true,
    interactions: [runCommand],
    failFirst: true,
  },
  'question-single': { spec: 'Question', interactions: [regridYears, gridSize] },
  'question-multi': { spec: 'Question', closest: true, interactions: [networks] },
  'question-freeform': { spec: 'Question', closest: true, interactions: [summaryText] },
  'question-bundle': { spec: 'Question', closest: true, interactions: [bundle] },
  'question-surface': {
    spec: 'Question',
    closest: true,
    interactions: [surfaceQuestion(false)],
    ownerLabels: OWNERS,
    surfaces: { [`${NDP}:${SURFACE_ID}`]: surface },
  },
  'question-surface-inline': {
    spec: 'Question',
    closest: true,
    interactions: [surfaceQuestion(true)],
    ownerLabels: OWNERS,
    surfaces: { [`${NDP}:${SURFACE_ID}`]: surface },
  },
  plan: { spec: 'Plan, then the decision', interactions: [plan('complete')] },
  'plan-writing': {
    spec: 'Plan, then the decision',
    closest: true,
    interactions: [plan('truncated', PLAN.split('## Execution')[0]!)],
  },
  answered: { spec: 'Once answered', interactions: [], view: 'answered-rows' },
  'narrow-third': {
    spec: 'A third of the window',
    interactions: [runCommand, submitArray],
    ownerLabels: OWNERS,
    width: 560,
  },
  'narrow-fifth': {
    spec: 'A fifth',
    interactions: [runCommand, submitArray],
    ownerLabels: OWNERS,
    width: 340,
  },
};

export const REVIEW_SESSION = ROOT;
export const ANSWERED_COMMAND = COMMAND;
