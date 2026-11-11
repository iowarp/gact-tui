/**
 * Test-only conversation family for Activity.
 *
 * `POST /__test/conversation-family` gives the base conversation three
 * delegated child runs (completed, running, failed) and one fork, and turns on
 * a queryable native provenance provider with their recorded turns. Reset
 * removes the family; the execution route then answers with an
 * empty, complete snapshot so the route stays served.
 */
export function createConversationFamilyFixture({ session, workspaceId, sendJson }) {
  let enabled = false;
  const at = (time) => `2026-09-01T${time}:00Z`;
  const seconds = (time) => Date.parse(at(time)) / 1000;
  const child = (id, overrides) => ({
    ...session,
    id,
    workspace_id: workspaceId,
    parent_session_id: session.id,
    session_kind: 'agent',
    message_count: 4,
    ...overrides,
  });
  const delegated = (turn, time) => ({
    delegation_origin: { session_id: session.id, turn_id: turn, created_at: at(time) },
  });
  const rows = () => [
    child('sess_family_explorer', {
      title: 'NDP explorer: SMAP granules since 2020',
      agent_id: 'ndp-explorer',
      state: 'completed',
      created_at: at('14:22'),
      updated_at: at('14:29'),
      metadata: delegated('turn_family_1', '14:22'),
    }),
    child('sess_family_qc', {
      title: 'Opal site QC against field probes',
      agent_id: 'site-qc',
      state: 'failed',
      created_at: at('14:24'),
      updated_at: at('14:31'),
      metadata: delegated('turn_family_1', '14:24'),
    }),
    child('sess_family_branch', {
      title: `${session.title} (2015 baseline)`,
      session_kind: 'branch',
      state: 'completed',
      created_at: at('14:34'),
      updated_at: at('14:39'),
      metadata: {
        fork_origin: {
          session_id: session.id,
          message_id: 'msg_family_fork',
          message_count: 2,
          created_at: at('14:34'),
          title: session.title,
        },
      },
    }),
    child('sess_family_regrid', {
      title: 'Regrid 2020–2023 to 0.25° on ares',
      agent_id: 'regrid-worker',
      state: 'running',
      created_at: at('14:42'),
      updated_at: at('14:57'),
      metadata: delegated('turn_family_2', '14:42'),
    }),
  ];
  const turn = (id, owner, start, end, status, turnId = id) => ({
    id: `span_${id}`,
    parent_id: '',
    kind: 'turn',
    session_id: owner,
    root_session_id: session.id,
    owner_session_id: owner,
    workflow_id: '',
    campaign_id: '',
    agent_id: '',
    source_agent_id: '',
    task_path: [],
    label: 'Agent response',
    event_type: 'turn.started',
    status,
    start_time: seconds(start),
    end_time: end ? seconds(end) : null,
    duration_ms: end ? (seconds(end) - seconds(start)) * 1000 : null,
    host: 'ares',
    artifact_refs: [],
    attributes: { turn_id: turnId },
    source_event_ids: [],
  });
  const spans = () => [
    turn('turn_family_1', session.id, '14:20', '14:33', 'completed'),
    turn('turn_family_2', session.id, '14:40', null, 'running'),
    turn('explorer_1', 'sess_family_explorer', '14:22', '14:29', 'completed'),
    turn('qc_1', 'sess_family_qc', '14:25', '14:31', 'failed'),
    turn('branch_1', 'sess_family_branch', '14:35', '14:39', 'completed'),
    turn('regrid_1', 'sess_family_regrid', '14:43', null, 'running'),
  ];
  const snapshot = (sessionId, includeChildren) => ({
    schema_version: '1.0',
    provider: 'native',
    session_id: sessionId,
    root_session_id: session.id,
    complete: true,
    truncated: false,
    provider_health: { status: 'ok' },
    campaigns: [],
    workflows: [],
    agents: [],
    spans: enabled
      ? spans().filter((span) => includeChildren || span.owner_session_id === sessionId)
      : [],
    nodes: [],
    edges: [],
  });
  return {
    reset() {
      enabled = false;
    },
    sessions() {
      return enabled ? rows() : [];
    },
    async handle(request, response, url) {
      if (request.method === 'POST' && url.pathname === '/__test/conversation-family') {
        enabled = true;
        sendJson(response, { enabled: true, sessions: rows().map((row) => row.id) });
        return true;
      }
      if (request.method !== 'GET') return false;
      const provenance = /^\/v1\/sessions\/([^/]+)\/provenance\/execution$/u.exec(url.pathname);
      if (provenance) {
        sendJson(
          response,
          snapshot(
            decodeURIComponent(provenance[1]),
            url.searchParams.get('include_children') === 'true',
          ),
        );
        return true;
      }
      if (!enabled) return false;
      if (url.pathname === '/v1/provenance/providers') {
        sendJson(response, {
          schema_version: '1.0',
          default_provider: 'native',
          providers: [
            {
              name: 'native',
              configured: true,
              queryable: true,
              durable: true,
              status: 'available',
              source: 'test-owned fixture',
              health: { status: 'ok' },
            },
          ],
        });
        return true;
      }
      const match = /^\/v1\/sessions\/(sess_family_[a-z]+)(\/.*)?$/u.exec(url.pathname);
      const row = match && rows().find((candidate) => candidate.id === match[1]);
      if (!row) return false;
      const suffix = match[2] ?? '';
      if (!suffix) sendJson(response, row);
      else if (suffix === '/messages')
        sendJson(response, {
          messages: [],
          tools: [],
          tasks: [],
          subagents: [],
          artifacts: [],
          surfaces: [],
          runs: [],
        });
      else {
        // The family's other reads use the base conversation's handlers.
        url.pathname = `/v1/sessions/${session.id}${suffix}`;
        return false;
      }
      return true;
    },
  };
}
