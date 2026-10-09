/** Test-only source and work inventory for the compact Session viewer. */
export function createSessionSummaryFixture({ sendJson, sessionId, workspaceId }) {
  let enabled = false;
  const source = {
    id: 'source_summary',
    label: 'Sensor repository',
    provider: 'local',
    root: '/sensors',
    mode: 'read_only',
    owner: { clio_id: 'fixture', host_id: 'local' },
    connected: true,
    authenticated: true,
    materialization: 'ready',
    local_path: '/workspace/connected-data/sensors',
    revision: 'r1',
    configuration: {},
    capabilities: { supported_modes: ['read_only', 'working_copy'], unavailable_reasons: {} },
    can_edit_location: false,
    download_available: true,
    linked: false,
    link_available: true,
  };
  return {
    reset() {
      enabled = false;
    },
    async handle(request, response, url) {
      if (request.method === 'POST' && url.pathname === '/__test/session-summary') {
        enabled = true;
        sendJson(response, { enabled });
        return true;
      }
      if (!enabled) return false;
      const root = `/v1/workspaces/${workspaceId}/sources`;
      if (url.pathname === root && request.method === 'GET') {
        sendJson(response, { sources: [source] });
        return true;
      }
      if (url.pathname === '/v1/storage/providers' && request.method === 'GET') {
        sendJson(response, { clio_id: 'fixture', host_id: 'local', providers: [] });
        return true;
      }
      if (url.pathname === `${root}/${source.id}/browse` && request.method === 'POST') {
        sendJson(response, {
          source_id: source.id,
          entries: [{ path: 'sensor.csv', kind: 'file', size: 128, revision: 'r1' }],
          next_offset: null,
        });
        return true;
      }
      if (url.pathname === `${root}/${source.id}/operations` && request.method === 'GET') {
        sendJson(response, { operations: [] });
        return true;
      }
      if (url.pathname === `${root}/${source.id}/mapping-options` && request.method === 'GET') {
        sendJson(response, {
          link_access: ['read_only'],
          reason: 'Read-only sensor input.',
          write_permission: false,
        });
        return true;
      }
      if (url.pathname === `/v1/sessions/${sessionId}/work` && request.method === 'GET') {
        sendJson(response, {
          cursor: 0,
          goal: null,
          loop: null,
          goals: [],
          loops: [],
          todos: [{ content: 'Check the report', status: 'in_progress' }],
          goal_next_cursor: null,
          loop_next_cursor: null,
        });
        return true;
      }
      return false;
    },
  };
}
