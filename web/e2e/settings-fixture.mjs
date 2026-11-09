/**
 * Test-only Settings content for a hydrology researcher: memory, access rules,
 * scheduled instructions, hooks, activity, data source accounts and prompts.
 * Off by default so every other spec keeps the fixture server's empty settings;
 * `POST /__test/settings-rich` turns it on and `/__test/reset` turns it off.
 */
export function createSettingsFixture({
  sendJson,
  readJson,
  commonHeaders,
  sessionId,
  workspaceId,
}) {
  const accountScope = 'user';
  const workspaceScope = `project/${workspaceId}`;
  const timezone = 'America/Chicago';
  let rich = false;
  let documents = [];
  let proposals = [];
  let policies = [];
  let schedules = [];
  let nextScheduleId = 1;
  let useAccountMemory = true;
  let folderWorkspace;

  const factLine = (fact) =>
    `- ${fact.text} {id=${fact.id}, source=${fact.source}, session=${fact.session}, at=${fact.at}}`;
  const documentText = (document, facts = document.facts) =>
    [
      '---',
      `name: ${document.slug}`,
      `description: ${document.description}`,
      `updated: ${document.updated}`,
      '---',
      ...facts.filter((fact) => fact.live).map(factLine),
      '',
    ].join('\n');
  const sha = (seed) => {
    let hash = 2166136261;
    for (const character of seed) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash.toString(16).padStart(8, '0').repeat(8);
  };
  const refresh = (document) => {
    document.text = documentText(document);
    document.sha = sha(document.text);
    return document;
  };

  function memoryDocument(scope, category, slug, description, prefix, facts, usage) {
    const document = {
      name: `${scope}/${category}/${slug}`,
      scope,
      category,
      slug,
      description,
      aliases: [],
      updated: '2026-08-21',
      sha: '',
      text: '',
      forgotten: [],
      facts: facts.map(([text, source, day], index) => ({
        id: `${prefix}${index + 1}`,
        text,
        source,
        session: sessionId,
        message: `msg_memory_${prefix}${index + 1}`,
        at: `2026-08-${String(day).padStart(2, '0')}T15:00:00Z`,
        superseded_by: '',
        live: true,
      })),
      usage,
    };
    return refresh(document);
  }

  function seedDocuments() {
    return [
      memoryDocument(
        accountScope,
        'profile',
        'profile',
        'Profile',
        'mf_profile_',
        [
          ['Hydrologist at the Illinois State Water Survey.', 'user', 2],
          ['Leads the regional soil moisture monitoring campaign.', 'user', 2],
          ['Holds a PhD in civil and environmental engineering.', 'imported', 3],
          ['Works in the America/Chicago time zone.', 'inferred', 4],
          ['Reports to the Water Resources program director.', 'user', 6],
          ['Publishes mainly in Water Resources Research.', 'imported', 9],
        ],
        { read: 42, loaded: 31, last_read: '2026-08-22T18:40:00Z' },
      ),
      memoryDocument(
        accountScope,
        'preferences',
        'preferences',
        'Preferences',
        'mf_pref_',
        [
          ['Wants plots exported as both SVG and PNG.', 'user', 3],
          ['Wants figure captions to state the data source and date range.', 'user', 3],
          ['Prefers concise summaries with the key number first.', 'inferred', 5],
          ['Uses viridis color maps for continuous fields.', 'user', 7],
          ['Wants code examples in Python.', 'user', 8],
          ['Prefers ISO 8601 dates in tables.', 'inferred', 10],
          ['Asks for uncertainty bands on time series.', 'user', 12],
          ['Likes notebooks saved alongside generated figures.', 'inferred', 15],
          ['Labels soil depth in centimetres.', 'user', 18],
        ],
        { read: 57, loaded: 44, last_read: '2026-08-22T19:05:00Z' },
      ),
      memoryDocument(
        accountScope,
        'areas',
        'areas-of-work',
        'Areas of work',
        'mf_area_',
        [
          ['Soil moisture remote sensing and in-situ validation.', 'user', 2],
          ['Drought early warning for agricultural regions.', 'imported', 4],
          ['Land surface model evaluation.', 'inferred', 11],
          ['Groundwater recharge estimation.', 'imported', 16],
        ],
        { read: 18, loaded: 12, last_read: '2026-08-21T14:20:00Z' },
      ),
      memoryDocument(
        workspaceScope,
        'topics',
        'topics',
        'Topics',
        'mf_topic_',
        [
          ['The flat-NDP campaign compares SMAP retrievals with in-situ probes.', 'user', 4],
          ['Site metadata lives in sites/stations.csv.', 'tool', 4],
          ['Probe readings are volumetric water content at 5, 10 and 50 cm.', 'user', 5],
          ['Nightly regridding targets a 9 km EASE-Grid 2.0.', 'inferred', 6],
          ['Quality flags follow the ISMN convention.', 'imported', 6],
          ['Gaps longer than six hours are reported, not interpolated.', 'user', 8],
          ['Seasonal anomalies use a 2015-2024 climatology.', 'user', 9],
          ['Comparison metrics are unbiased RMSE and Pearson correlation.', 'inferred', 12],
          ['The campaign area spans 40 stations across central Illinois.', 'tool', 13],
          ['Precipitation forcing comes from Stage IV radar.', 'imported', 14],
          ['Weekly summaries go to the field team on Fridays.', 'user', 17],
          ['Outliers above 0.6 m3/m3 are flagged for manual review.', 'user', 20],
        ],
        { read: 73, loaded: 58, last_read: '2026-08-22T19:30:00Z' },
      ),
      memoryDocument(
        workspaceScope,
        'environments',
        'environments',
        'Environments',
        'mf_env_',
        [
          ['Uses Python 3.9.', 'inferred', 3],
          ['Analysis runs on the campus HPC cluster with Slurm.', 'user', 5],
          ['Raw probe data syncs from the NDP catalog each night.', 'tool', 7],
        ],
        { read: 9, loaded: 6, last_read: '2026-08-20T09:10:00Z' },
      ),
    ];
  }

  const findDocument = (name) => documents.find((document) => document.name === name);

  function proposal(id, input) {
    const target = findDocument(input.target);
    const base = target ? target.text : '';
    let proposed = base;
    if (target) {
      const retired = new Set(input.replaces);
      const kept = target.facts.map((fact) => ({
        ...fact,
        live: fact.live && !retired.has(fact.id),
      }));
      const added = input.facts.map((text, index) => ({
        id: `${id}_f${index + 1}`,
        text,
        source: input.evidence[0]?.source ?? 'inferred',
        session: sessionId,
        message: '',
        at: input.created_at,
        superseded_by: '',
        live: true,
      }));
      proposed = documentText(
        { ...target, updated: input.created_at.slice(0, 10) },
        input.change === 'retire' ? kept : [...kept, ...added],
      );
    }
    return {
      id,
      description: '',
      sources: input.evidence.map((item) => item.source),
      origin: `session:${sessionId}`,
      handle: `memory_curator_${id}`,
      status: 'pending',
      decided_by: '',
      decided_at: '',
      base_text: base,
      proposed_text: proposed,
      needs_review: true,
      target_label: target?.description,
      ...input,
    };
  }

  function seedProposals() {
    return [
      proposal('mp_metric_units', {
        target: `${accountScope}/preferences/preferences`,
        change: 'add',
        facts: ['Prefers metric units in plots.'],
        replaces: [],
        merge_from: [],
        evidence: [
          {
            id: 'ev_metric_units',
            session: sessionId,
            messages: ['msg_units_request'],
            source: 'user',
            fact: 'Please keep everything metric in the plots.',
          },
        ],
        rationale: 'You asked for metric units when reviewing the campaign plots.',
        created_at: '2026-08-22T18:12:00Z',
        changes: [
          {
            id: 'mp_metric_units_f1',
            kind: 'added',
            before: '',
            after: 'Prefers metric units in plots.',
          },
        ],
      }),
      proposal('mp_sahel_focus', {
        target: `${workspaceScope}/topics/topics`,
        change: 'supersede',
        facts: ['Works on soil moisture in the Sahel.'],
        replaces: ['mf_topic_9'],
        merge_from: [],
        evidence: [
          {
            id: 'ev_sahel_notes',
            session: sessionId,
            messages: [],
            source: 'imported',
            fact: 'Field notes: next season moves the campaign to Sahel sites.',
          },
        ],
        rationale: 'Imported notes say the campaign area is moving to the Sahel.',
        created_at: '2026-08-22T17:48:00Z',
        changes: [
          {
            id: 'mf_topic_9',
            kind: 'updated',
            before: 'The campaign area spans 40 stations across central Illinois.',
            after: 'Works on soil moisture in the Sahel.',
          },
        ],
      }),
      proposal('mp_xarray_merge', {
        target: `${accountScope}/preferences/preferences`,
        change: 'merge',
        facts: ['Uses xarray and netCDF for gridded data.'],
        replaces: [],
        merge_from: [`${workspaceScope}/environments/environments`],
        evidence: [
          {
            id: 'ev_xarray_tool',
            session: sessionId,
            messages: ['msg_regrid_script'],
            source: 'tool',
            fact: 'regrid.py opens every input with xarray.open_dataset.',
          },
          {
            id: 'ev_xarray_user',
            session: sessionId,
            messages: ['msg_netcdf_note'],
            source: 'user',
            fact: 'I keep all gridded outputs as netCDF.',
          },
        ],
        rationale: 'Two separate notes describe the same gridded-data workflow.',
        created_at: '2026-08-22T16:30:00Z',
        changes: [
          {
            id: 'mp_xarray_merge_f1',
            kind: 'added',
            before: '',
            after: 'Uses xarray and netCDF for gridded data.',
          },
        ],
      }),
      proposal('mp_python_retire', {
        target: `${workspaceScope}/environments/environments`,
        change: 'retire',
        facts: [],
        replaces: ['mf_env_1'],
        merge_from: [],
        evidence: [
          {
            id: 'ev_python_version',
            session: sessionId,
            messages: ['msg_env_check'],
            source: 'tool',
            fact: 'python --version reported Python 3.12.4.',
          },
        ],
        rationale: 'The environment now runs Python 3.12, so the old version is out of date.',
        created_at: '2026-08-22T15:05:00Z',
        changes: [{ id: 'mf_env_1', kind: 'removed', before: 'Uses Python 3.9.', after: '' }],
      }),
    ];
  }

  const creationRuns = [
    {
      id: 'mcr_20260822_1810',
      origin: 'background',
      source_session: sessionId,
      workspace_id: workspaceId,
      curator_session: 'sess_memory_curator_1',
      handle: 'memory_curator_1810',
      state: 'completed',
      reason: 'Conversation went idle after new preferences.',
      started_at: '2026-08-22T18:10:00Z',
      completed_at: '2026-08-22T18:12:41Z',
      models: {
        extract: { provider_id: 'codex', model_id: 'gpt-5.6-luna', source: 'fleet' },
        curator: { provider_id: 'codex', model_id: 'gpt-5.6-luna', source: 'fleet' },
      },
      usage: { input_tokens: 18_420, output_tokens: 1_312, cost_usd: 0.041, cost_known: true },
      extract: { returned: 7, kept: 3, dropped: { duplicate: 3, low_confidence: 1 } },
      proposal_counts: { accepted: 1, pending: 3, rejected: 0 },
      targets: [`${accountScope}/preferences/preferences`, `${workspaceScope}/topics/topics`],
    },
    {
      id: 'mcr_20260821_0930',
      origin: 'import',
      source_session: sessionId,
      workspace_id: workspaceId,
      curator_session: 'sess_memory_curator_0',
      handle: 'memory_curator_0930',
      state: 'completed',
      reason: 'Imported field notes.',
      started_at: '2026-08-21T09:30:00Z',
      completed_at: '2026-08-21T09:31:55Z',
      models: {
        extract: { provider_id: 'codex', model_id: 'gpt-5.6-luna', source: 'fleet' },
        curator: null,
      },
      usage: { input_tokens: 9_870, output_tokens: 640, cost_usd: null, cost_known: false },
      extract: { returned: 4, kept: 2, dropped: { duplicate: 2 } },
      proposal_counts: { accepted: 1, pending: 1, rejected: 0 },
      targets: [`${workspaceScope}/topics/topics`],
    },
  ];

  function seedPolicies() {
    return [
      {
        kind: 'tool',
        scope: 'workspace',
        action: 'ask',
        priority: 1,
        tool_name_pattern: 'shell.run',
      },
      {
        kind: 'domain',
        scope: 'workspace',
        action: 'allow',
        priority: 2,
        host_pattern: '*.github.com',
      },
      {
        kind: 'fs_root',
        scope: 'workspace',
        action: 'deny',
        priority: 3,
        path_pattern: '~/.ssh/**',
      },
      {
        kind: 'plan_acl',
        scope: 'workspace',
        action: 'deny',
        priority: 4,
        tool_name_pattern: 'write_file',
        modes: ['plan', 'architect'],
      },
    ];
  }

  function schedule(input) {
    return {
      session_id: sessionId,
      enabled: true,
      created_at: '2026-08-18T16:00:00Z',
      cron: '',
      timezone,
      recurring: true,
      run_at: '',
      next_fire_at: '',
      last_fired_at: '',
      fire_count: 0,
      max_fires: 0,
      until: '',
      overlap_policy: 'queue',
      retry_count: 0,
      last_error: '',
      disabled_reason: '',
      ...input,
    };
  }

  function seedSchedules() {
    return [
      schedule({
        id: 'sched_review_results',
        question: 'Review new campaign results and summarize material changes.',
        cron: '0 9 * * 1-5',
        next_fire_at: '2026-08-24T14:00:00Z',
        last_fired_at: '2026-08-21T14:00:00Z',
        fire_count: 4,
      }),
      schedule({
        id: 'sched_regrid_soil',
        question: 'Regrid the nightly soil sites.',
        cron: '0 2 * * *',
        enabled: false,
        last_fired_at: '2026-08-20T07:00:00Z',
        fire_count: 12,
        disabled_reason: 'Paused while the probe calibration is updated.',
      }),
      schedule({
        id: 'sched_weekly_summary',
        question: 'Draft the weekly summary for the team.',
        recurring: false,
        run_at: '2026-08-28T20:00:00Z',
        next_fire_at: '2026-08-28T20:00:00Z',
        max_fires: 1,
      }),
      schedule({
        id: 'sched_sensor_gaps',
        question: 'Check the sensor feed for gaps.',
        cron: '0 */6 * * *',
        next_fire_at: '2026-08-23T00:00:00Z',
        last_fired_at: '2026-08-22T18:00:00Z',
        fire_count: 21,
        overlap_policy: 'skip',
      }),
    ];
  }

  const hooks = {
    backend: 'clio',
    enabled: true,
    hooks: [
      {
        id: 'hook_format_notebooks',
        title: 'Format notebooks after edits',
        scope: 'workspace',
        on: ['post_tool'],
      },
      {
        id: 'hook_audit_shell',
        title: 'Record shell commands',
        scope: 'account',
        on: ['pre_tool'],
      },
    ],
    recent_invocations: [
      {
        hook_id: 'hook_audit_shell',
        event: 'pre_tool',
        tool: 'shell.run',
        at: '2026-08-22T19:41:00Z',
        outcome: 'ok',
      },
      {
        hook_id: 'hook_format_notebooks',
        event: 'post_tool',
        tool: 'write_file',
        at: '2026-08-22T19:42:10Z',
        outcome: 'ok',
      },
    ],
  };

  const metrics = {
    uptime_s: 273_600,
    sessions: {
      total: 38,
      active: 3,
      by_status: { running: 1, idle: 2, completed: 33, failed: 2 },
    },
    messages: { total: 2_416, by_role: { user: 612, assistant: 1_204, tool: 600 } },
    tokens: {
      input_total: 18_204_331,
      output_total: 1_402_118,
      cache_read_total: 9_880_412,
      cache_write_total: 1_204_550,
    },
    cost: { total_usd: 48.37, by_provider: { codex: 41.12, anthropic: 7.25 } },
    latencies: {
      first_token: { count: 1_204, p50_ms: 820, p95_ms: 2_450, max_ms: 7_310 },
      tool_call: { count: 600, p50_ms: 340, p95_ms: 4_100, max_ms: 61_000 },
    },
  };

  const memoryStats = (session) => ({
    cache: { hits: 1_842, misses: 211, hit_rate: 0.897, capacity: 4_096 },
    session: session
      ? {
          session_id: session,
          messages_retained: 146,
          tokens_retained: 61_400,
          tokens_budget: 200_000,
          profiles_attached: 2,
          context_files_attached: 5,
          context_files_by_mode: { edit: 3, plan: 2 },
          compact_summaries: 1,
          token_pressure: 0.31,
          threshold_state: 'normal',
          compaction_recommended: false,
        }
      : null,
    global: { conversations_total: 38, invocations_total: 4_512 },
    metadata: { backend: 'clio' },
  });

  const storageProviders = {
    clio_id: 'clio_fixture',
    host_id: 'host_fixture',
    providers: [
      {
        id: 'local',
        name: 'Local folder',
        logo: 'local',
        authentication: 'none',
        configured: true,
        capabilities: {
          supported_modes: ['read_only', 'working_copy', 'write_enabled'],
          unavailable_reasons: {},
        },
        setup_requirement: null,
      },
      {
        id: 'github',
        name: 'GitHub',
        logo: 'github',
        authentication: 'browser',
        configured: true,
        authenticated: true,
        account_url: 'https://github.com/settings/connections/applications',
        account_name: 'hydro-lab',
        capabilities: { supported_modes: ['read_only', 'working_copy'], unavailable_reasons: {} },
        setup_requirement: null,
      },
      {
        id: 'globus',
        name: 'Globus',
        logo: 'globus',
        authentication: 'browser',
        configured: true,
        authenticated: false,
        capabilities: {
          supported_modes: ['read_only', 'working_copy'],
          unavailable_reasons: { write_enabled: 'Globus transfers are read-only here.' },
        },
        setup_requirement: null,
      },
      {
        id: 'google_drive',
        name: 'Google Drive',
        logo: 'google_drive',
        authentication: 'browser',
        configured: false,
        authenticated: false,
        capabilities: { supported_modes: ['read_only'], unavailable_reasons: {} },
        setup_requirement: 'Configure the Google Drive application on this CLIO.',
      },
    ],
  };

  const prompts = [
    {
      id: 'system',
      title: 'System instructions',
      description: 'How the agent introduces itself and approaches scientific work.',
      default_profile: 'default',
      profiles: {
        default: {
          name: 'default',
          text: 'You are a careful research assistant for hydrology and soil science. State units and data sources.',
          scope: 'global',
          checksum: 'sha256:5d1f0c',
          metadata: {},
        },
        concise: {
          name: 'concise',
          text: 'Answer in at most three sentences, leading with the key number.',
          scope: 'workspace',
          metadata: {},
        },
      },
      scope: 'global',
      enabled: true,
      validation_errors: [],
      metadata: {},
    },
    {
      id: 'weekly_summary',
      title: 'Weekly summary',
      description: 'Template for the Friday campaign summary sent to the field team.',
      default_profile: 'default',
      profiles: {
        default: {
          name: 'default',
          text: 'Summarize this week: stations reporting, gaps over six hours, anomalies against climatology, next steps.',
          scope: 'workspace',
          metadata: {},
        },
      },
      scope: 'workspace',
      enabled: true,
      validation_errors: [],
      metadata: {},
    },
    {
      id: 'figure_review',
      title: 'Figure review',
      description: 'Checks a figure for units, captions and colour accessibility.',
      default_profile: 'default',
      profiles: {
        default: {
          name: 'default',
          text: 'Review the figure for metric units, a sourced caption, labelled axes and a colour-blind safe palette.',
          scope: 'global',
          metadata: {},
        },
      },
      scope: 'global',
      enabled: false,
      validation_errors: [],
      metadata: {},
    },
  ];

  function seed() {
    documents = seedDocuments();
    proposals = seedProposals();
    policies = seedPolicies();
    schedules = seedSchedules();
    nextScheduleId = 1;
    useAccountMemory = true;
    folderWorkspace = {
      id: workspaceId,
      name: 'flat-NDP',
      display_name: 'flat-NDP',
      path: 'D:\\science\\campaigns\\flat-NDP',
      connection_id: 'fixture',
      grants: [
        'D:\\data\\earthscope-raw',
        'D:\\science\\shared\\ndp-scripts',
        'D:\\data\\sentinel-raw',
      ],
    };
  }
  seed();

  const folderName = (path) =>
    path
      .split(/[\\/]+/u)
      .filter(Boolean)
      .at(-1) ?? path;
  const workspaceRecord = () => {
    const { grants, ...rest } = folderWorkspace;
    return {
      ...rest,
      source_folders: [
        { path: rest.path, name: folderName(rest.path), primary: true },
        ...grants.map((path) => ({ path, name: folderName(path), primary: false })),
      ],
    };
  };

  function decide(id, status, facts) {
    const index = proposals.findIndex((item) => item.id === id);
    if (index < 0) return undefined;
    const [decided] = proposals.splice(index, 1);
    decided.status = status;
    decided.decided_by = 'user';
    decided.decided_at = new Date().toISOString();
    if (status !== 'accepted') return decided;
    const target = findDocument(decided.target);
    if (target) {
      const retired = new Set(decided.replaces);
      for (const fact of target.facts) if (retired.has(fact.id)) fact.live = false;
      if (decided.change !== 'retire') {
        (facts ?? decided.facts).forEach((text, offset) =>
          target.facts.push({
            id: `${decided.id}_f${offset + 1}`,
            text,
            source: decided.sources[0] ?? 'inferred',
            session: sessionId,
            message: '',
            at: decided.decided_at,
            superseded_by: '',
            live: true,
          }),
        );
      }
      target.updated = decided.decided_at.slice(0, 10);
      decided.applied_before_text = decided.base_text;
      decided.applied_text = refresh(target).text;
    }
    return decided;
  }

  const sendEmpty = (response) => {
    response.writeHead(204, commonHeaders());
    response.end();
  };
  const notFound = (response, message) =>
    sendJson(response, { error: { code: 'not_found', message } }, 404);

  return {
    reset() {
      rich = false;
      seed();
    },
    async handle(request, response, url) {
      const { method } = request;
      const path = url.pathname;
      if (method === 'POST' && path === '/__test/settings-rich') {
        rich = true;
        sendJson(response, { ok: true });
        return true;
      }
      if (!rich) return false;

      if (method === 'GET' && path === '/v1/memory/summary') {
        sendJson(response, { enabled: true, inbox: proposals.length, documents: documents.length });
        return true;
      }
      if (method === 'GET' && path === '/v1/memory/documents') {
        const scope = url.searchParams.get('scope') ?? 'all';
        sendJson(response, {
          documents: documents.filter((document) => scope === 'all' || document.scope === scope),
        });
        return true;
      }
      const documentMatch = /^\/v1\/memory\/documents\/(.+?)(\/versions)?$/u.exec(path);
      if (method === 'GET' && documentMatch) {
        const name = documentMatch[1].split('/').map(decodeURIComponent).join('/');
        const document = findDocument(name);
        if (!document) notFound(response, `No memory named ${name}.`);
        else if (documentMatch[2]) {
          sendJson(response, {
            versions: [
              {
                n: 1,
                text: document.text,
                author: { kind: 'user' },
                at: `${document.updated}T15:00:00Z`,
              },
            ],
          });
        } else sendJson(response, document);
        return true;
      }
      if (method === 'GET' && path === '/v1/memory/proposals') {
        const status = url.searchParams.get('status') ?? 'pending';
        sendJson(response, { proposals: status === 'pending' ? proposals : [] });
        return true;
      }
      const proposalMatch = /^\/v1\/memory\/proposals\/([^/]+)\/(accept|reject)$/u.exec(path);
      if (method === 'POST' && proposalMatch) {
        const body = await readJson(request);
        const decided = decide(
          decodeURIComponent(proposalMatch[1]),
          proposalMatch[2] === 'accept' ? 'accepted' : 'rejected',
          Array.isArray(body.facts) ? body.facts : undefined,
        );
        if (decided) sendJson(response, decided);
        else notFound(response, 'That proposed change was already decided.');
        return true;
      }
      if (method === 'GET' && path === '/v1/memory/creation-runs') {
        sendJson(response, {
          runs: creationRuns,
          next_cursor: null,
          background: { last_tick: '2026-08-22T19:55:00Z', in_flight: 0, started: 2 },
        });
        return true;
      }
      if (method === 'GET' && path === '/v1/workspaces') {
        sendJson(response, { workspaces: [workspaceRecord()] });
        return true;
      }
      if (method === 'PATCH' && path === `/v1/workspaces/${workspaceId}`) {
        const body = await readJson(request);
        if (typeof body.name === 'string' && body.name.trim()) {
          folderWorkspace.name = body.name.trim();
          folderWorkspace.display_name = body.name.trim();
        }
        if (typeof body.root_path === 'string' && body.root_path.trim()) {
          folderWorkspace.path = body.root_path.trim();
        }
        sendJson(response, workspaceRecord());
        return true;
      }
      if (path === `/v1/workspaces/${workspaceId}/grants`) {
        if (method === 'POST') {
          const body = await readJson(request);
          if (typeof body.pattern === 'string' && !folderWorkspace.grants.includes(body.pattern)) {
            folderWorkspace.grants.push(body.pattern);
          }
          sendJson(response, { kind: 'fs_root', pattern: body.pattern });
          return true;
        }
        if (method === 'DELETE') {
          const pattern = url.searchParams.get('pattern');
          folderWorkspace.grants = folderWorkspace.grants.filter((item) => item !== pattern);
          sendEmpty(response);
          return true;
        }
      }
      if (path === `/v1/workspaces/${workspaceId}/memory`) {
        if (method === 'PUT') {
          const body = await readJson(request);
          if (typeof body.use_account_memory === 'boolean')
            useAccountMemory = body.use_account_memory;
        }
        if (method === 'GET' || method === 'PUT') {
          sendJson(response, { use_account_memory: useAccountMemory });
          return true;
        }
      }
      if (method === 'GET' && path === '/v1/memory/stats') {
        sendJson(response, memoryStats(url.searchParams.get('session_id') ?? ''));
        return true;
      }

      if (method === 'GET' && path === '/v1/policies') {
        sendJson(response, { policies });
        return true;
      }
      if (method === 'PUT' && path === '/v1/policies') {
        const body = await readJson(request);
        policies = Array.isArray(body.policies) ? body.policies : [];
        sendJson(response, { policies });
        return true;
      }

      const sessionSchedules = `/v1/sessions/${sessionId}/schedules`;
      if (method === 'GET' && path === sessionSchedules) {
        sendJson(response, { schedules, cron_timezone: timezone });
        return true;
      }
      if (method === 'POST' && path === sessionSchedules) {
        const body = await readJson(request);
        const created = schedule({
          ...body,
          id: `sched_created_${nextScheduleId++}`,
          created_at: new Date().toISOString(),
          next_fire_at: body.recurring === false ? (body.run_at ?? '') : '',
        });
        schedules.push(created);
        sendJson(response, created, 201);
        return true;
      }
      const patchMatch = new RegExp(`^${sessionSchedules}/([^/]+)$`, 'u').exec(path);
      if (method === 'PATCH' && patchMatch) {
        const body = await readJson(request);
        const target = schedules.find((item) => item.id === decodeURIComponent(patchMatch[1]));
        if (!target) notFound(response, 'No such scheduled instruction.');
        else {
          if (typeof body.enabled === 'boolean') {
            target.enabled = body.enabled;
            if (body.enabled) target.disabled_reason = '';
          }
          sendJson(response, target);
        }
        return true;
      }
      const deleteMatch = /^\/v1\/schedules\/([^/]+)$/u.exec(path);
      if (method === 'DELETE' && deleteMatch) {
        const id = decodeURIComponent(deleteMatch[1]);
        const before = schedules.length;
        schedules = schedules.filter((item) => item.id !== id);
        if (schedules.length === before) notFound(response, 'No such scheduled instruction.');
        else sendEmpty(response);
        return true;
      }

      if (method === 'GET' && path === '/v1/hooks') {
        sendJson(response, hooks);
        return true;
      }
      if (method === 'GET' && path === '/v1/metrics') {
        sendJson(response, metrics);
        return true;
      }
      if (method === 'GET' && path === '/v1/storage/providers') {
        sendJson(response, storageProviders);
        return true;
      }
      if (method === 'GET' && path === '/v1/prompts') {
        sendJson(response, { prompts });
        return true;
      }
      const promptMatch = /^\/v1\/prompts\/([^/]+)$/u.exec(path);
      if (method === 'GET' && promptMatch) {
        const prompt = prompts.find((item) => item.id === decodeURIComponent(promptMatch[1]));
        if (!prompt) {
          notFound(response, 'No such prompt.');
          return true;
        }
        const profileName = url.searchParams.get('profile') || prompt.default_profile;
        const profile = prompt.profiles[profileName] ?? prompt.profiles[prompt.default_profile];
        sendJson(response, {
          prompt: {
            id: prompt.id,
            profile: profile.name,
            text: profile.text,
            title: prompt.title,
            description: prompt.description,
            scope: profile.scope,
            validation_errors: [],
            metadata: {},
          },
        });
        return true;
      }
      return false;
    },
  };
}
