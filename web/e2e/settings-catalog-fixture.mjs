// Settings catalog fixture: plugins, marketplaces, agents, MCP servers and the
// per-tool settings the Extensions, Agents and Tools and MCP servers pages read.
//
// Off by default so the rest of the suite keeps its plain CLIO catalog. Turn it
// on with `POST /__test/settings-catalog {"state":"full"|"empty"|"error"|"off"}`
// (or CLIO_FIXTURE_SETTINGS_CATALOG=full for screenshot stacks). `/__test/reset`
// returns it to the environment default.

const ALL_MODES = ['ask', 'auto-edits', 'ai-review', 'spotter-ai', 'bypass'];
const COVERING = ['auto-edits', 'bypass'];

function outcomes(direct, script = direct) {
  return Object.fromEntries(ALL_MODES.map((mode) => [mode, { direct, script }]));
}

function tool(fields) {
  return {
    kind: 'mcp',
    server: '',
    description: '',
    read_only: false,
    destructive: false,
    flags_known: true,
    group: fields.read_only ? 'read' : 'write',
    plugin_permission: '',
    plugin_permission_source: 'annotations',
    configured_permission: '',
    rules: [],
    permission: '',
    plugin_callers: 'both',
    plugin_callers_known: true,
    configured_callers: '',
    callers: fields.configured_callers || fields.plugin_callers || 'both',
    outcomes: outcomes('runs'),
    ...fields,
  };
}

function initialToolSettings() {
  return {
    'clio-community/dev-tools': {
      plugin: 'dev-tools',
      approval_modes: ALL_MODES,
      covering_modes: COVERING,
      servers_not_loaded: [],
      tools: [
        tool({
          name: 'get_file_contents',
          server: 'github',
          description: 'Read a file from a GitHub repository.',
          read_only: true,
        }),
        tool({
          name: 'search_code',
          server: 'github',
          description: 'Search code across GitHub repositories.',
          read_only: true,
          plugin_callers: 'code',
          callers: 'code',
          outcomes: outcomes('unavailable', 'runs'),
        }),
        tool({
          name: 'create_issue',
          server: 'github',
          description: 'Open an issue in a repository.',
          outcomes: outcomes('asks', 'covered'),
        }),
        tool({
          name: 'delete_branch',
          server: 'github',
          description: 'Delete a branch from a repository.',
          destructive: true,
          permission: 'deny',
          plugin_callers: 'direct',
          callers: 'direct',
          outcomes: outcomes('blocked'),
        }),
      ],
    },
    'private-local/regrid-checks': {
      plugin: 'regrid-checks',
      approval_modes: ALL_MODES,
      covering_modes: COVERING,
      servers_not_loaded: [],
      tools: [
        tool({
          name: 'check_grid_bounds',
          kind: 'script',
          description: 'Check that a regridded field stays inside the source bounds.',
          read_only: true,
          plugin_permission: 'allow',
          plugin_permission_source: 'plugin',
        }),
        tool({
          name: 'write_regrid_report',
          kind: 'script',
          description: 'Write the regrid comparison report into the workspace.',
          plugin_permission: 'ask',
          plugin_permission_source: 'plugin',
          plugin_callers: 'direct',
          callers: 'direct',
          outcomes: outcomes('asks', 'unavailable'),
        }),
      ],
    },
    'clio-community/postgres-tools': {
      plugin: 'postgres-tools',
      approval_modes: ALL_MODES,
      covering_modes: COVERING,
      servers_not_loaded: ['postgres'],
      tools: [],
    },
    'ha-marketplace/home-assistant': {
      plugin: 'home-assistant',
      approval_modes: ALL_MODES,
      covering_modes: COVERING,
      servers_not_loaded: [],
      tools: [
        tool({
          name: 'get_states',
          server: 'ha-mcp',
          description: 'Read the state of every Home Assistant entity.',
          read_only: true,
          plugin_permission: 'allow',
          plugin_permission_source: 'plugin',
        }),
        tool({
          name: 'call_service',
          server: 'ha-mcp',
          description: 'Call a Home Assistant service such as light.turn_on.',
          plugin_permission: 'ask',
          plugin_permission_source: 'plugin',
          rules: [
            {
              scope: 'workspace',
              scope_id: 'ws_genesis',
              where: 'workspace',
              action: 'allow',
              path_pattern: '',
            },
          ],
          outcomes: outcomes('runs', 'covered'),
        }),
        tool({
          name: 'create_automation',
          server: 'ha-mcp',
          description: 'Draft and save a Home Assistant automation.',
          plugin_permission: 'ask',
          plugin_permission_source: 'plugin',
          plugin_callers: 'direct',
          callers: 'direct',
          outcomes: outcomes('asks', 'unavailable'),
        }),
      ],
    },
  };
}

const plugin = (fields) => ({
  version: '1.0.0',
  description: '',
  kind: 'plugin',
  format: 'agent-plugins',
  requires: [],
  members: [],
  tools: [],
  skills: [],
  mcp_servers: [],
  subagents: [],
  flows: [],
  hooks: [],
  commands: [],
  catalogs: [],
  fragments: [],
  trusted: true,
  pending_trust: false,
  diagnostics: [],
  ...fields,
});

function initialPlugins() {
  return [
    plugin({
      id: 'core',
      ref: 'clio/core',
      marketplace: 'clio',
      description: 'Files, commands, planning and artifacts every agent starts with.',
      tools: ['fs_read_file', 'fs_write_file', 'shell_bash', 'update_plan'],
      skills: ['workspace-guide'],
    }),
    plugin({
      id: 'ndp',
      ref: 'clio/ndp',
      marketplace: 'clio',
      description: 'Search and read the National Data Platform catalog.',
      tools: ['ndp_search'],
      skills: ['ndp-explorer'],
      mcp_servers: ['ndp'],
    }),
    plugin({
      id: 'hpc-io',
      ref: 'clio/hpc-io',
      marketplace: 'clio',
      description: 'Profile and tune parallel I/O on HPC file systems.',
      skills: ['darshan-report', 'lustre-striping'],
    }),
    plugin({
      id: 'dev-tools',
      ref: 'clio-community/dev-tools',
      marketplace: 'clio-community',
      description: 'GitHub issues, code search and branches.',
      skills: ['triage-issue', 'review-pr'],
      mcp_servers: ['github'],
      tools: ['get_file_contents', 'search_code', 'create_issue', 'delete_branch'],
    }),
    plugin({
      id: 'postgres-tools',
      ref: 'clio-community/postgres-tools',
      marketplace: 'clio-community',
      description: 'Query a Postgres database through its MCP server.',
      mcp_servers: ['postgres'],
    }),
    plugin({
      id: 'home-assistant',
      ref: 'ha-marketplace/home-assistant',
      marketplace: 'ha-marketplace',
      format: 'claude-code',
      version: '2.4.0',
      description: 'Lights, scenes, energy and automations from Home Assistant.',
      skills: ['ha-lights', 'ha-energy-report', 'ha-automations', 'ha-scenes'],
      mcp_servers: ['home-assistant'],
      commands: ['ha-status'],
      tools: ['get_states', 'call_service', 'create_automation'],
      trusted: false,
      pending_trust: true,
    }),
    plugin({
      id: 'regrid-checks',
      ref: 'private-local/regrid-checks',
      marketplace: 'private-local',
      description: 'Sanity checks for regridded soil-moisture fields.',
      skills: ['regrid-checks'],
      tools: ['check_grid_bounds', 'write_regrid_report'],
    }),
  ];
}

function initialMarketplaces() {
  return [
    {
      name: 'clio',
      source: 'https://github.com/iowarp/clio-agent-marketplace.git',
      commit: '4f1c2e9',
      format: 'agent-plugins',
      trusted: true,
      trust_reason: 'shipped',
      default: true,
      parent: '',
      installed_at: '2026-10-01T12:00:00Z',
      diagnostics: [],
    },
    {
      name: 'clio-community',
      source: 'https://github.com/iowarp/clio-community.git',
      commit: '9b0a7d1',
      format: 'agent-plugins',
      trusted: true,
      trust_reason: 'shipped',
      default: false,
      parent: '',
      installed_at: '2026-10-01T12:00:00Z',
      diagnostics: [],
    },
    {
      name: 'ha-marketplace',
      source: 'https://github.com/ha/plugins.git',
      commit: '1d2e3f4',
      format: 'claude-code',
      trusted: false,
      trust_reason: '',
      default: false,
      parent: '',
      installed_at: '2026-11-02T09:30:00Z',
      diagnostics: [],
    },
    {
      name: 'private-local',
      source: 'D:/CLIO/config/plugins/local/private-local',
      commit: '',
      format: 'agent-plugins',
      trusted: true,
      trust_reason: 'local',
      default: false,
      parent: '',
      installed_at: '2026-10-01T12:00:00Z',
      diagnostics: [],
    },
  ];
}

const userAgentDefinition = {
  id: 'opal-analyst',
  name: 'Opal analyst',
  description: 'Soil-moisture analysis with HPC I/O tuning.',
  extends: 'clio/standard',
  add: ['hpc-io', 'regrid-checks'],
  remove: [],
};

function initialAgents() {
  return [
    {
      ref: 'clio/standard',
      id: 'standard',
      name: 'CLIO',
      description: 'The default. Science, data and files.',
      marketplace: 'clio',
      plugins: [{ ref: 'clio/core' }, { ref: 'clio/ndp' }],
      kind: 'agent',
    },
    {
      ref: 'clio/ndp-explorer',
      id: 'ndp-explorer',
      name: 'NDP explorer',
      description: 'From the NDP plugin',
      marketplace: 'clio',
      plugins: [{ ref: 'clio/core' }, { ref: 'clio/ndp' }],
      kind: 'agent',
    },
    {
      ref: 'user/opal-analyst',
      ...userAgentDefinition,
      plugins: [{ ref: 'clio/hpc-io' }, { ref: 'private-local/regrid-checks' }],
      kind: 'user',
      delta: { add: userAgentDefinition.add, remove: [] },
    },
  ];
}

function initialServers() {
  return [
    {
      id: 'mcp_fs',
      name: 'fs',
      status: 'ready',
      transport: 'in_process',
      source: 'builtin',
      tools_count: 9,
      tools: [],
      spec: { title: 'Workspace files' },
    },
    {
      id: 'mcp_shell',
      name: 'shell',
      status: 'ready',
      transport: 'in_process',
      source: 'builtin',
      tools_count: 2,
      tools: [],
      spec: { title: 'Local commands' },
    },
    {
      id: 'mcp_github',
      name: 'github',
      status: 'available',
      transport: 'stdio',
      source: 'plugin',
      plugin: 'dev-tools',
      tools_count: 41,
      tools: ['get_file_contents', 'search_code', 'create_issue', 'delete_branch'],
      spec: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] },
    },
    {
      id: 'mcp_home_assistant',
      name: 'home-assistant',
      status: 'failed',
      reason: 'No answer from mcp.home.lan',
      error: 'connect ECONNREFUSED mcp.home.lan:443',
      transport: 'http',
      source: 'user',
      tools_count: 0,
      tools: [],
      spec: { url: 'https://mcp.home.lan/sse', authentication: 'detect' },
    },
    {
      id: 'mcp_postgres',
      name: 'postgres',
      status: 'stopped',
      transport: 'stdio',
      source: 'user',
      tools_count: 0,
      tools: [],
      spec: { command: 'uvx', args: ['mcp-postgres'] },
    },
  ];
}

function initialSaved() {
  return [
    {
      name: 'home-assistant',
      label: 'home-assistant',
      transport: 'http',
      always_load: true,
      spec: { url: 'https://mcp.home.lan/sse', authentication: 'detect' },
    },
    {
      name: 'postgres',
      label: 'postgres',
      transport: 'stdio',
      always_load: false,
      spec: { command: 'uvx', args: ['mcp-postgres'] },
    },
  ];
}

const githubTools = [
  ['get_file_contents', 'Read a file from a GitHub repository.'],
  ['search_code', 'Search code across GitHub repositories.'],
  ['create_issue', 'Open an issue in a repository.'],
  ['delete_branch', 'Delete a branch from a repository.'],
];

const registryPage = {
  servers: [
    {
      server: {
        name: 'io.github.home-assistant/ha-mcp',
        title: 'Home Assistant',
        description: 'Control lights, scenes and automations in Home Assistant.',
        version: '1.2.0',
        repository: { url: 'https://github.com/home-assistant/ha-mcp' },
        remotes: [{ type: 'sse', url: 'https://mcp.home.lan/sse' }],
        packages: [],
      },
    },
    {
      server: {
        name: 'io.github.crystaldba/postgres-mcp',
        title: 'Postgres',
        description: 'Query and explain a Postgres database.',
        version: '0.3.0',
        packages: [{ registryType: 'pypi', identifier: 'postgres-mcp', version: '0.3.0' }],
        remotes: [],
      },
    },
  ],
  next_cursor: '',
};

const pluginFiles = {
  'ha-marketplace/home-assistant': [
    ['plugin.json', '{\n  "name": "home-assistant",\n  "version": "2.4.0"\n}\n'],
    ['skills/ha-lights/SKILL.md', '# ha-lights\n\nTurn lights and scenes on or off.\n'],
    ['commands/ha-status.md', '# /ha-status\n\nShow what Home Assistant reports.\n'],
  ],
};

export function createSettingsCatalog(defaultState = 'off') {
  let state = defaultState;
  let plugins = initialPlugins();
  let marketplaces = initialMarketplaces();
  let agents = initialAgents();
  let servers = initialServers();
  let saved = initialSaved();
  let toolSettings = initialToolSettings();

  const reset = () => {
    state = defaultState;
    plugins = initialPlugins();
    marketplaces = initialMarketplaces();
    agents = initialAgents();
    servers = initialServers();
    saved = initialSaved();
    toolSettings = initialToolSettings();
  };

  const active = (request) => {
    const pinned = request?.headers['x-clio-settings-catalog'];
    return (['full', 'empty', 'error', 'off'].includes(pinned) ? pinned : state) !== 'off';
  };
  const fail = (sendJson, response, what) =>
    sendJson(
      response,
      { error: 'unavailable', message: `The agent could not list ${what}: plugin index locked` },
      503,
    );

  /** Capabilities the catalog pages require; merged into `/v1/capabilities`. */
  const capabilities = (request) =>
    active(request) ? { x_clio_agent_plugins: true, x_clio_extension_library: true } : {};

  /** Handle one request; returns true when it answered. */
  const handle = async (request, response, url, { sendJson, readJson }) => {
    const path = url.pathname;
    const method = request.method;
    if (method === 'POST' && path === '/__test/settings-catalog') {
      const body = await readJson(request);
      reset();
      state = ['full', 'empty', 'error', 'off'].includes(body?.state) ? body.state : 'full';
      sendJson(response, { state });
      return true;
    }
    // A screenshot run can pin its own state per request, so parallel runs
    // against one server do not race on the shared toggle.
    const pinned = request.headers['x-clio-settings-catalog'];
    const current = ['full', 'empty', 'error', 'off'].includes(pinned) ? pinned : state;
    if (current === 'off') return false;
    const empty = current === 'empty';
    const error = current === 'error';

    if (method === 'GET' && path === '/v1/plugins') {
      if (error) return fail(sendJson, response, 'plugins'), true;
      sendJson(response, {
        plugins: empty ? [] : plugins,
        default_marketplace_error: null,
      });
      return true;
    }
    if (method === 'GET' && path === '/v1/plugins/marketplaces') {
      if (error) return fail(sendJson, response, 'marketplaces'), true;
      sendJson(response, { marketplaces: empty ? [] : marketplaces });
      return true;
    }
    if (method === 'GET' && path === '/v1/plugins/local') {
      sendJson(response, {
        root: 'D:/CLIO/config/plugins',
        agents_directory: 'D:/CLIO/config/plugins/user-agents',
        plugins_directory: 'D:/CLIO/config/plugins/local/private-local/plugins',
        agents: empty
          ? []
          : [
              {
                ref: 'user/opal-analyst',
                path: 'D:/CLIO/config/plugins/user-agents/opal-analyst.json',
                definition: userAgentDefinition,
              },
            ],
      });
      return true;
    }
    const trust = /^\/v1\/plugins\/marketplaces\/([^/]+)\/(trust|update)$/u.exec(path);
    if (method === 'POST' && trust) {
      const name = decodeURIComponent(trust[1]);
      const market = marketplaces.find((row) => row.name === name);
      if (!market) return sendJson(response, { error: 'not_found' }, 404), true;
      if (trust[2] === 'trust') {
        market.trusted = true;
        for (const row of plugins)
          if (row.marketplace === name) Object.assign(row, { trusted: true, pending_trust: false });
      }
      sendJson(response, {
        marketplace: name,
        format: market.format,
        trusted: market.trusted,
        plugins: plugins.filter((row) => row.marketplace === name).map((row) => row.id),
        pending_trust: plugins
          .filter((row) => row.marketplace === name && row.pending_trust)
          .map((row) => row.id),
        agents: [],
        diagnostics: [],
      });
      return true;
    }
    const removeMarket = /^\/v1\/plugins\/marketplaces\/([^/]+)$/u.exec(path);
    if (method === 'DELETE' && removeMarket) {
      const name = decodeURIComponent(removeMarket[1]);
      marketplaces = marketplaces.filter((row) => row.name !== name);
      plugins = plugins.filter((row) => row.marketplace !== name);
      sendJson(response, { uninstalled: name });
      return true;
    }
    if (method === 'GET' && path === '/v1/plugins/inspect') {
      const ref = url.searchParams.get('ref') ?? '';
      const entry = plugins.find((row) => row.ref === ref || row.id === ref);
      if (!entry) return sendJson(response, { error: 'not_found' }, 404), true;
      const files = (pluginFiles[entry.ref] ?? [['plugin.json', `{"name":"${entry.id}"}\n`]]).map(
        ([file, text]) => ({
          path: file,
          text,
          bytes: text.length,
          truncated: false,
          sha256: 'fixture',
          error: '',
        }),
      );
      sendJson(response, { plugin: entry, skill: '', files, incomplete: false, reason: '' });
      return true;
    }
    if (method === 'GET' && path === '/v1/agents') {
      if (error) return fail(sendJson, response, 'agents'), true;
      sendJson(response, { agents: empty ? agents.slice(0, 1) : agents });
      return true;
    }
    const deleteAgent = /^\/v1\/agents\/user\/([^/]+)$/u.exec(path);
    if (method === 'DELETE' && deleteAgent) {
      const id = decodeURIComponent(deleteAgent[1]);
      agents = agents.filter((row) => !(row.kind === 'user' && row.id === id));
      sendJson(response, { deleted: id });
      return true;
    }
    if (method === 'GET' && path === '/v1/mcp/servers') {
      if (error) return fail(sendJson, response, 'MCP servers'), true;
      sendJson(response, { servers: empty ? [] : servers });
      return true;
    }
    const inventory = /^\/v1\/mcp\/servers\/([^/]+)\/(tools|resources)$/u.exec(path);
    if (method === 'GET' && inventory) {
      const id = decodeURIComponent(inventory[1]);
      const rows =
        inventory[2] === 'tools' && id === 'mcp_github'
          ? githubTools.map(([name, description]) => ({ name, description }))
          : [];
      sendJson(response, { [inventory[2]]: rows });
      return true;
    }
    const reconnect = /^\/v1\/mcp\/servers\/([^/]+)\/reconnect$/u.exec(path);
    if (method === 'POST' && reconnect) {
      const id = decodeURIComponent(reconnect[1]);
      const row = servers.find((server) => server.id === id);
      if (row) Object.assign(row, { status: 'failed' });
      sendJson(response, row ?? { error: 'not_found' }, row ? 200 : 404);
      return true;
    }
    const server = /^\/v1\/mcp\/servers\/([^/]+)$/u.exec(path);
    if (server) {
      const id = decodeURIComponent(server[1]);
      const row = servers.find((entry) => entry.id === id);
      if (method === 'DELETE') {
        servers = servers.filter((entry) => entry.id !== id);
        response.writeHead(204);
        response.end();
        return true;
      }
      if (method === 'GET') {
        sendJson(response, row ?? { error: 'not_found' }, row ? 200 : 404);
        return true;
      }
    }
    if (method === 'GET' && path === '/v1/mcp/configuration') {
      sendJson(response, { servers: empty ? [] : saved });
      return true;
    }
    if (method === 'GET' && path === '/v1/tools') {
      if (empty) return sendJson(response, { tools: [] }), true;
      sendJson(response, {
        tools: githubTools.map(([name, description]) => ({
          id: `mcp_github:${name}`,
          name,
          title: name,
          description,
          server_id: 'mcp_github',
          source: 'mcp',
          status: 'available',
          enabled: true,
          owner: 'github',
          tags: ['github'],
          visible_to: [],
          input_schema: { type: 'object', properties: {} },
          output_schema: {},
        })),
      });
      return true;
    }
    if (method === 'GET' && path === '/v1/settings/tools') {
      if (error) return fail(sendJson, response, 'tool settings'), true;
      const ref = url.searchParams.get('ref') ?? '';
      const settings = toolSettings[ref];
      if (!settings) {
        sendJson(response, {
          plugin: ref.split('/').at(-1) ?? ref,
          approval_modes: ALL_MODES,
          covering_modes: COVERING,
          tools: [],
          servers_not_loaded: [],
        });
        return true;
      }
      sendJson(response, settings);
      return true;
    }
    if (method === 'PUT' && path === '/v1/settings/tools') {
      const body = await readJson(request);
      const names = new Set(body?.tools ?? []);
      for (const settings of Object.values(toolSettings)) {
        for (const row of settings.tools) {
          if (!names.has(row.name)) continue;
          if ('permission' in body) row.permission = body.permission ?? '';
          if ('callers' in body) {
            row.configured_callers = body.callers ?? '';
            row.callers = row.configured_callers || row.plugin_callers;
          }
        }
      }
      sendJson(response, { tools: [...names] });
      return true;
    }
    if (method === 'GET' && path === '/v1/extensions/mcp-registry') {
      const search = (url.searchParams.get('search') ?? '').toLowerCase();
      sendJson(response, {
        ...registryPage,
        servers: registryPage.servers.filter(
          (row) => !search || JSON.stringify(row).toLowerCase().includes(search),
        ),
      });
      return true;
    }
    return false;
  };

  return { capabilities, handle, reset, state: () => state };
}
