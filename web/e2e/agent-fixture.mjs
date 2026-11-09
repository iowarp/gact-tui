/**
 * A composable agent for the e2e fixture: installed setups, the plugin catalog,
 * each session's pinned resolution and the routes that change it. Resolution
 * follows the service's rules closely enough for the Agent tab: packs bring
 * their members, requirements come along, and a removal takes its dependents
 * (and an emptied pack) with it.
 */

const tool = (name, description, defer = false) => ({ name, description, defer });

const PLUGINS = {
  core: {
    marketplace: 'clio-builtin',
    version: '3.2.0',
    description: 'Workspace files, commands and web reading every setup has.',
    removable: false,
    tools: [
      tool('read_file', 'Read a workspace file.'),
      tool('write_file', 'Create or replace a workspace file.'),
      tool('edit_file', 'Apply an exact edit to a workspace file.'),
      tool('list_directory', 'List a workspace folder.'),
      tool('search_files', 'Search workspace files by name or text.'),
      tool('run_command', 'Run a command in the workspace sandbox.'),
      tool('web_fetch', 'Read a public web page.'),
    ],
    fragments: [
      [
        'core-guidelines',
        'guidelines',
        'Work in small, verifiable steps and cite the files you read.',
      ],
      ['core-rendering', 'rendering', 'Show plots, tables and maps as rendered surfaces.'],
    ],
  },
  science: {
    kind: 'pack',
    marketplace: 'clio-science',
    version: '1.4.0',
    description: 'Scientific data formats, batch jobs and the National Data Platform.',
    members: ['hdf5', 'slurm', 'ndp'],
  },
  hdf5: {
    marketplace: 'clio-science',
    version: '1.4.0',
    description: 'Inspect and plot HDF5 files without loading them whole.',
    tools: [
      tool('h5_list', 'List the groups and datasets of an HDF5 file.'),
      tool('h5_read', 'Read a slice of an HDF5 dataset.'),
      tool('h5_plot', 'Plot an HDF5 dataset.'),
    ],
    skills: [['hdf5', 'Navigate HDF5 layouts and chunking.']],
    fragments: [
      ['hdf5-domain', 'domain', 'Read HDF5 datasets in slices; never load a file whole.'],
    ],
  },
  slurm: {
    marketplace: 'clio-science',
    version: '1.2.1',
    description: 'Submit and follow batch jobs on Slurm clusters.',
    tools: [
      tool('slurm_submit', 'Submit a batch script.'),
      tool('slurm_status', 'Read the state of submitted jobs.'),
      tool('slurm_cancel', 'Cancel a submitted job.'),
    ],
    skills: [['slurm', 'Write batch scripts and read job accounting.']],
    fragments: [
      ['slurm-domain', 'domain', 'Ask before submitting a job that requests more than one node.'],
    ],
  },
  ndp: {
    marketplace: 'clio-science',
    version: '0.9.0',
    description: 'Search and fetch National Data Platform datasets.',
    tools: [
      tool('ndp_search', 'Search the National Data Platform catalog.'),
      tool('ndp_fetch', 'Fetch an NDP dataset into the workspace.', true),
    ],
    subagents: [['ndp-explorer', 'Explores NDP catalogs and reports matching datasets.']],
  },
  darshan: {
    marketplace: 'clio-science',
    version: '0.6.2',
    description: 'Read Darshan I/O logs and summarize application behaviour.',
    requires: ['hdf5'],
    tools: [
      tool('darshan_parse', 'Parse a Darshan log.'),
      tool('darshan_summary', 'Summarize I/O by module and file.'),
      tool('darshan_timeline', 'Draw the I/O timeline of a run.'),
    ],
    subagents: [['darshan', 'Investigates I/O performance from Darshan logs.']],
  },
  netcdf: {
    marketplace: 'clio-science',
    version: '1.0.3',
    description: 'Inspect NetCDF files and their CF metadata.',
    tools: [
      tool('nc_list', 'List NetCDF variables and attributes.'),
      tool('nc_read', 'Read a slice of a NetCDF variable.'),
    ],
    skills: [['netcdf', 'Read CF conventions and coordinate variables.']],
  },
  xlsx: {
    marketplace: 'clio-builtin',
    version: '2.0.0',
    description: 'Read and write spreadsheets.',
    tools: [
      tool('xlsx_read', 'Read spreadsheet sheets as tables.'),
      tool('xlsx_write', 'Write a table to a spreadsheet.'),
    ],
    skills: [['xlsx', 'Keep formulas and formatting intact.']],
  },
};

const AGENTS = [
  {
    ref: 'clio/default',
    id: 'default',
    name: 'CLIO default',
    role: 'Research assistant',
    description: 'Scientific assistant with workspace files, HDF5, Slurm, NDP and Darshan.',
    version: '3.2.0',
    marketplace: 'clio-builtin',
    plugins: ['science', 'darshan'],
  },
  {
    ref: 'clio/reviewer',
    id: 'reviewer',
    name: 'Evidence reviewer',
    role: 'Reviewer',
    description: 'Reads evidence and checks claims; runs no jobs.',
    version: '3.2.0',
    marketplace: 'clio-builtin',
    plugins: ['ndp'],
  },
];

const DEFAULT_REF = 'clio/default';
const WORKSPACE_LABEL = 'flat-NDP';

const pluginId = (reference) => String(reference).split('@', 1)[0].split('/').at(-1);
const normalizeDelta = (delta) => ({
  add: [...new Set((delta?.add ?? []).map(pluginId))],
  remove: [...new Set((delta?.remove ?? []).map(pluginId))],
});

function pluginEntry(id) {
  const plugin = PLUGINS[id];
  return {
    id,
    ref: `${plugin.marketplace}/${id}`,
    version: plugin.version,
    description: plugin.description,
    kind: plugin.kind ?? 'plugin',
    format: 'clio',
    marketplace: plugin.marketplace,
    requires: plugin.requires ?? [],
    members: plugin.members ?? [],
    tools: (plugin.tools ?? []).map((row) => row.name),
    skills: (plugin.skills ?? []).map(([skill]) => skill),
    mcp_servers: [],
    subagents: (plugin.subagents ?? []).map(([subagent]) => subagent),
    flows: [],
    hooks: [],
    commands: [],
    catalogs: [],
    fragments: (plugin.fragments ?? []).map(([fragment]) => fragment),
    trusted: true,
    pending_trust: false,
    diagnostics: [],
  };
}

function agentEntry(agent) {
  return {
    ref: agent.ref,
    id: agent.id,
    name: agent.name,
    description: agent.description,
    role: agent.role ?? '',
    version: agent.version ?? '',
    marketplace: agent.marketplace ?? '',
    plugins: (agent.plugins ?? []).map((ref) => ({ ref, layer: agent.id })),
    kind: agent.kind ?? 'agent',
    ...(agent.extends ? { extends: agent.extends, delta: agent.delta } : {}),
  };
}

/** One fixture service's agent state: saved setups and each session's pinned agent. */
export function createAgentFixture({ sendJson, readJson }) {
  let userAgents = new Map();
  let sessions = new Map();

  const findAgent = (ref) =>
    AGENTS.find((agent) => agent.ref === ref || agent.id === ref) ??
    userAgents.get(String(ref).replace(/^user\//u, ''));

  function resolve(ref, requested) {
    const agent = findAgent(ref);
    if (!agent) return undefined;
    const base = agent.extends ? findAgent(agent.extends) : agent;
    const delta = normalizeDelta(requested);
    const own = agent.extends ? normalizeDelta(agent.delta) : { add: [], remove: [] };
    const active = new Map();
    const include = (id, provenance) => {
      if (active.has(id) || !PLUGINS[id]) return;
      active.set(id, provenance);
      for (const member of PLUGINS[id].members ?? []) {
        include(member, { source: 'pack', via: id, label: id });
      }
      for (const required of PLUGINS[id].requires ?? []) {
        include(required, { source: 'required', via: id, label: id });
      }
    };
    include('core', { source: 'core', via: 'core', label: 'core' });
    for (const id of base.plugins) {
      include(id, { source: 'agent', via: base.id, label: base.name });
    }
    for (const id of [...own.add, ...delta.add]) {
      include(id, { source: 'user', via: '', label: 'Added' });
    }
    const removed = [];
    const drop = (id, reason, because) => {
      if (!active.has(id) || PLUGINS[id].removable === false) return;
      active.delete(id);
      removed.push({ id, reason, because });
      for (const member of PLUGINS[id].members ?? []) drop(member, 'removed', id);
      for (const [other] of active) {
        if ((PLUGINS[other].requires ?? []).includes(id)) drop(other, 'requires', id);
      }
    };
    for (const id of [...own.remove, ...delta.remove]) drop(id, 'removed', '');
    for (const [id] of active) {
      const members = PLUGINS[id].members ?? [];
      if (members.length && !members.some((member) => active.has(member))) {
        drop(id, 'pack_empty', '');
      }
    }
    const ids = [...active.keys()];
    const contributions = (key, map) =>
      ids.flatMap((id) => (PLUGINS[id][key] ?? []).map((row) => map(row, id)));
    const fragments = [
      {
        id: `${base.id}-identity`,
        plugin: `agent:${base.id}`,
        section: 'identity',
        text: `You are ${agent.name}, a ${base.role.toLowerCase()} for scientific workspaces.`,
        tokens: 18,
      },
      ...contributions('fragments', ([id, section, text], plugin) => ({
        id,
        plugin,
        section,
        text,
        tokens: Math.ceil(text.length / 4),
      })),
      {
        id: 'workspace-instructions',
        plugin: WORKSPACE_LABEL,
        section: 'domain',
        text: 'Station records live in data/stations; prefer the 2024 GNSS reprocessing.',
        tokens: 20,
      },
    ];
    const sections = ['identity', 'guidelines', 'rendering', 'capabilities', 'domain'].map(
      (section) => ({
        section,
        fragments: fragments.filter((fragment) => fragment.section === section),
      }),
    );
    return {
      agent: {
        ref: agent.ref,
        id: agent.id,
        name: agent.name,
        role: agent.role ?? base.role,
        description: agent.description,
        version: base.version,
        marketplace: base.marketplace,
        parent: agent.extends ?? '',
        kind: agent.kind ?? 'agent',
      },
      plugins: ids.map((id) => ({
        id,
        version: PLUGINS[id].version,
        kind: PLUGINS[id].kind ?? 'plugin',
        marketplace: PLUGINS[id].marketplace,
        description: PLUGINS[id].description,
        provenance: active.get(id),
        requires: PLUGINS[id].requires ?? [],
        members: PLUGINS[id].members ?? [],
        removable: PLUGINS[id].removable !== false,
      })),
      removed,
      tools: contributions('tools', (row, plugin) => ({ ...row, plugin })),
      skills: contributions('skills', ([id, description], plugin) => ({ id, plugin, description })),
      subagents: contributions('subagents', ([id, description], plugin) => ({
        id,
        plugin,
        description,
      })),
      flows: [],
      hooks: [],
      commands: [],
      catalogs: [],
      mcp_servers: {},
      prompt: {
        text: fragments.map((fragment) => fragment.text).join('\n\n'),
        sections,
        digest: `fixture-${agent.id}-${ids.join('-')}`,
        warnings: [],
      },
      delta,
      diagnostics: [],
      digest: `fixture-${agent.id}-${ids.join('-')}`,
    };
  }

  function sessionState(sessionId) {
    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, {
        ref: DEFAULT_REF,
        delta: { add: [], remove: [] },
        basis: undefined,
      });
    }
    return sessions.get(sessionId);
  }

  function sessionAgent(sessionId, extra = {}) {
    const state = sessionState(sessionId);
    return {
      session_id: sessionId,
      delta: state.delta,
      subagent: false,
      resolution: resolve(state.ref, state.delta),
      prompt_basis: state.basis ?? { digest: '', pending: false },
      ...extra,
    };
  }

  const notFound = (response, message) =>
    sendJson(response, { error: { error: 'agent_not_found', message } }, 404);

  /** Serve one agent or plugin route; `false` when the request is not one. */
  async function handle(request, url, response) {
    const { method } = request;
    const path = url.pathname;
    if (method === 'GET' && path === '/v1/agents') {
      sendJson(response, {
        agents: [...AGENTS, ...userAgents.values()].map(agentEntry),
      });
      return true;
    }
    if (method === 'GET' && path === '/v1/plugins') {
      sendJson(response, {
        plugins: Object.keys(PLUGINS).map(pluginEntry),
        default_marketplace_error: null,
      });
      return true;
    }
    if (method === 'GET' && path === '/v1/plugins/marketplaces') {
      sendJson(response, {
        marketplaces: ['clio-builtin', 'clio-science'].map((name) => ({
          name,
          source: `https://plugins.clio.example/${name}`,
          format: 'clio',
          trusted: true,
          default: name === 'clio-builtin',
          installed_at: '2026-08-01T12:00:00Z',
          diagnostics: [],
        })),
      });
      return true;
    }
    if (method === 'GET' && path === '/v1/agents/resolve') {
      const ref = url.searchParams.get('ref');
      if (!ref) {
        sendJson(
          response,
          { error: { error: 'invalid_request', message: 'ref is required' } },
          400,
        );
        return true;
      }
      const resolution = resolve(ref, {
        add: url.searchParams.getAll('add'),
        remove: url.searchParams.getAll('remove'),
      });
      if (!resolution) notFound(response, `No agent ${ref}`);
      else sendJson(response, resolution);
      return true;
    }
    if (method === 'POST' && path === '/v1/agents/preview-removal') {
      const body = await readJson(request);
      const ref = body.ref || DEFAULT_REF;
      const plugin = pluginId(body.plugin ?? '');
      const delta = normalizeDelta(body.delta);
      const before = resolve(ref, delta);
      const after = resolve(ref, { ...delta, remove: [...delta.remove, plugin] });
      if (!before || !after) {
        notFound(response, `No agent ${ref}`);
        return true;
      }
      const left = new Set(before.removed.map((row) => row.id));
      const tools = new Set(after.tools.map((row) => row.name));
      sendJson(response, {
        plugin,
        removes: after.removed
          .filter((row) => row.id !== plugin && !left.has(row.id))
          .map((row) => ({ id: row.id, reason: { reason: row.reason, because: row.because } })),
        tools_removed: before.tools.map((row) => row.name).filter((name) => !tools.has(name)),
      });
      return true;
    }
    if (method === 'POST' && path === '/v1/agents/user') {
      const body = await readJson(request);
      const id = String(body.id ?? '').trim();
      if (!id || !findAgent(body.extends ?? '')) {
        sendJson(
          response,
          {
            error: { error: 'invalid_request', message: 'A saved setup needs an id and a parent.' },
          },
          400,
        );
        return true;
      }
      if (body.create_only && userAgents.has(id)) {
        sendJson(
          response,
          { error: { error: 'agent_exists', message: `A saved agent named ${id} exists.` } },
          409,
        );
        return true;
      }
      const agent = {
        ref: `user/${id}`,
        id,
        name: body.name || id,
        description: body.description ?? '',
        kind: 'user',
        extends: body.extends,
        delta: normalizeDelta(body),
        plugins: [],
      };
      userAgents.set(id, agent);
      sendJson(response, agentEntry(agent));
      return true;
    }
    const userAgent = /^\/v1\/agents\/user\/([^/]+)$/u.exec(path);
    if (method === 'DELETE' && userAgent) {
      const id = decodeURIComponent(userAgent[1]);
      userAgents.delete(id);
      sendJson(response, { deleted: id });
      return true;
    }
    const pinned = /^\/v1\/sessions\/([^/]+)\/agent$/u.exec(path);
    if (pinned && method === 'GET') {
      sendJson(response, sessionAgent(decodeURIComponent(pinned[1])));
      return true;
    }
    if (pinned && method === 'PATCH') {
      const sessionId = decodeURIComponent(pinned[1]);
      const body = await readJson(request);
      const state = sessionState(sessionId);
      const ref = body.ref || state.ref;
      if (!findAgent(ref)) {
        notFound(response, `No agent ${ref}`);
        return true;
      }
      const before = resolve(state.ref, state.delta);
      const delta =
        body.add || body.remove
          ? normalizeDelta(body)
          : ref === state.ref
            ? state.delta
            : { add: [], remove: [] };
      const after = resolve(ref, delta);
      const had = new Set(before.plugins.map((row) => row.id));
      const has = new Set(after.plugins.map((row) => row.id));
      state.ref = ref;
      state.delta = delta;
      state.basis =
        body.apply === 'note'
          ? {
              digest: before.digest,
              pending: true,
              added: [...has].filter((id) => !had.has(id)),
              removed: [...had].filter((id) => !has.has(id)),
            }
          : undefined;
      sendJson(
        response,
        sessionAgent(
          sessionId,
          body.apply === 'compact' ? { compaction: { compacted: true } } : {},
        ),
      );
      return true;
    }
    return false;
  }

  function reset() {
    userAgents = new Map();
    sessions = new Map();
  }

  return { handle, reset };
}
