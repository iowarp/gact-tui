// Opt-in decision-card data for the screens harness: one pending set per card,
// so a capture shows the data-dependent parts of each card (the plan outline,
// "Rest of this script", the Runs on / Asked by / Folders facts, a question
// that can be dismissed). POST /__test/decision-cards {card} turns one on.

export const DECISION_CARDS = ['script', 'facts', 'plan', 'question'];

const COMMAND = 'python qc_stations.py --strict --out results/qc';
const EXECUTION = { computer: 'ares Slurm login node', cwd: '~/flat-NDP' };

const SCRIPT = [
  'import pandas as pd',
  'from pathlib import Path',
  'from ndp import fetch, granules',
  'STATIONS = Path("data/earthscope/stations.csv")',
  'sel = stations[stations.network.isin(["PBO", "NOTA"]) & stations.lat.between(35.2, 41.9) & stations.lon.between(-124.1, -114.6) & stations.active & ~stations.flagged]',
  'OUT = Path("results/qc")',
  'for station in sel.itertuples():',
  '    g = granules("GNSS_DAILY", station.lat, station.lon)',
  '    df = fetch(g, OUT / station.id)',
  '    df["flag"] = df.up.abs() > 0.05',
  '    df.to_csv(OUT / f"{station.id}.csv")',
  '',
  '# summary across stations',
  'summary = pd.concat(frames)',
  ...Array.from({ length: 50 }, (_, index) =>
    index % 5 === 4 ? '' : `summary["window_${index}"] = summary.up.rolling(${index + 2}).mean()`,
  ),
].join('\n');

const PLAN = `# Vertical displacement review

Compare the 14 flat-NDP stations against the derived displacement series for 2020–2023.

## Steps

1. Fix the station bounds in \`select_stations.py\`
2. Rebuild the daily series on four ranks
3. Check the 14 stations against the quality flags
4. Write \`results/qc.csv\` and a summary plot

## Execution recommendation

Interactive. Step 2 holds four ranks for about 40 minutes.

## Risks

- Two stations sit on a network edge and may need a manual check.
- 2020 series use the older quality flags.
`;

const PLAN_ARTIFACT_ID = 'artifact_plan_review';

/** The saved plan the plan card opens as a tab ("Open plan"). */
export function decisionCardArtifacts(card, { sessionId, observedAt }) {
  if (card !== 'plan') return [];
  return [
    {
      id: PLAN_ARTIFACT_ID,
      session_id: sessionId,
      name: 'displacement-review.md',
      media_type: 'text/markdown',
      uri: 'artifact://flat-ndp/plans/displacement-review.md@v1',
      size: PLAN.length,
      created_at: observedAt,
    },
  ];
}

/** The specialist that asks, so the card names it under Asked by. */
export function decisionChildSession(session, childSessionId) {
  return {
    ...session,
    id: childSessionId,
    parent_session_id: session.id,
    title: 'Station evidence specialist',
    state: 'waiting_permission',
  };
}

function base(id, overrides, { sessionId, observedAt }) {
  return {
    id,
    kind: 'permission',
    status: 'pending',
    requires_human_response: true,
    audience: 'human',
    owner_session_id: sessionId,
    attended_session_id: sessionId,
    title: 'Response requested',
    created_at: observedAt,
    source: { protocol: 'native' },
    ...overrides,
  };
}

export function decisionCardInteractions(card, context) {
  const { childSessionId, workspaceId } = context;
  const make = (id, overrides) => base(id, overrides, context);
  const script = make('permission:decision-script', {
    title: 'Run script',
    owner_session_id: childSessionId,
    source: { protocol: 'native', tool_name: 'run_code' },
    actions: ['allow', 'allow_session', 'allow_workspace', 'allow_script', 'deny'],
    payload: {
      permission_id: 'decision-script',
      execution: EXECUTION,
      script: { call_id: 'call_station_qc', code: SCRIPT },
      tool_call: {
        tool_name: 'run_command',
        input: {
          command: COMMAND,
          _clio_task_description:
            'Match every PBO and NOTA station to its daily series, then flag outliers',
        },
      },
    },
  });
  const facts = make('permission:decision-facts', {
    title: 'Allow writing to /scratch/jc/flat-ndp?',
    owner_session_id: childSessionId,
    source: { protocol: 'native', tool_name: 'run_command' },
    actions: ['allow', 'allow_session', 'allow_workspace', 'deny'],
    payload: {
      permission_id: 'decision-facts',
      execution: EXECUTION,
      tool_call: {
        tool_name: 'run_command',
        input: {
          command: COMMAND,
          cwd: '~/flat-NDP',
          _clio_task_description: 'Write the station flags next to the displacement series',
        },
      },
      access: {
        folders: ['/scratch/jc/flat-ndp', '/scratch/jc/flat-ndp/qc'],
        computer: EXECUTION.computer,
        workspace_id: workspaceId,
        operation: 'run_command',
        command: COMMAND,
        paths: ['/scratch/jc/flat-ndp/qc/flags.csv', '/scratch/jc/flat-ndp/qc/summary.png'],
        cwd: EXECUTION.cwd,
        reason: 'Write the station flags and the summary plot next to the series.',
        access: 'read_write',
        scope: 'workspace',
      },
    },
  });
  const plan = make('question:decision-plan', {
    kind: 'question',
    title: 'Review execution plan',
    prompt: 'Approve the saved plan?',
    source: { protocol: 'native', tool_name: 'plan_exit' },
    actions: ['answer', 'cancel'],
    payload: {
      question_id: 'decision-plan',
      question_kind: 'choice',
      plan_exit: {
        summary: 'Compare the 14 flat-NDP stations against the displacement series.',
        recommended_mode: 'interactive',
        risk_notes: 'Two stations sit on a network edge. 2020 series use older flags.',
        plan_file: 'plans/displacement-review.md',
        plan_content: PLAN,
        plan_content_status: 'complete',
        artifact_ref: { artifact_id: PLAN_ARTIFACT_ID },
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
  const question = make('question:decision-years', {
    kind: 'question',
    title: 'Which years should the review cover?',
    prompt: 'Which years should the review cover?',
    source: { protocol: 'native', tool_name: 'ask_user' },
    actions: ['answer', 'cancel'],
    payload: {
      question_id: 'decision-years',
      question_kind: 'choice',
      allow_freeform: true,
      options: [
        { label: '2020–2023', value: '2020-2023', description: 'the series you fetched' },
        { label: '2015–2023', value: '2015-2023', description: 'adds the older campaign data' },
        { label: 'Only 2023', value: '2023' },
      ],
    },
  });
  // The script ask pages with a second request, so the ‹ 1/2 › pager shows.
  return (
    { script: [script, facts], facts: [facts], plan: [plan], question: [question] }[card] ?? []
  );
}
