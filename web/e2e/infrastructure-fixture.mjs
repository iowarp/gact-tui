/**
 * Test-only infrastructure: this computer plus three SSH computers, the
 * services on each, recent operations and model downloads, and each
 * computer's storage locations. Read only; nothing here starts or stops.
 */
export function createInfrastructureFixture({
  sendJson,
  readJson,
  localTargetFacts,
  localCatalog,
  localModels,
  catalogFor,
  serviceUrls,
}) {
  // Activity reads relative to now; the screens harness freezes this clock.
  const observedMs = Date.now();
  const ago = (minutes) => new Date(observedMs - minutes * 60_000).toISOString();
  const epochAgo = (minutes) => Math.round(observedMs / 1000 - minutes * 60);
  const created = '2026-08-18T09:00:00.000Z';
  const target = (id, label, kind, transport_state, ssh) => ({
    id,
    label,
    kind,
    install_root: kind === 'local' ? '' : '/lus/ares/clio',
    ...(ssh
      ? {
          ssh: {
            profile: '',
            user: 'researcher',
            port: 22,
            identity_file: '',
            platform: 'linux',
            jump_hosts: [],
            ...ssh,
          },
        }
      : {}),
    transport_state,
    auto_reconnect: true,
    created_at: created,
    updated_at: ago(2),
  });
  const targets = [
    target('local', localTargetFacts.label, 'local', 'connected'),
    target('ares', 'ares', 'ssh', 'connected', { host: 'ares.cluster.example.edu' }),
    target('utah-cluster', 'utah-cluster', 'ssh', 'reconnecting', {
      host: 'login.utah.example.edu',
      jump_hosts: ['ares'],
    }),
    target('polaris', 'polaris', 'ssh', 'reauthentication_required', {
      host: 'polaris.alcf.example.gov',
    }),
  ];
  const observation = (state) => ({
    definition_version: '1',
    configuration_revision: 'r1',
    phase: state === 'starting' ? 'running' : state,
    installed: true,
    running: state !== 'stopped',
    serving: state === 'running',
    worker_alive: state !== 'stopped',
    provenance_ingesting: false,
    attention_verified: false,
    evidence_directory: '',
    observed_at: epochAgo(1),
  });
  const service = (target_id, service_id, state, extra = {}) => ({
    id: `svc_${target_id}_${service_id}`.replaceAll(/[^a-z0-9_]/gu, '_'),
    target_id,
    service_id,
    state: state === 'starting' ? 'running' : state,
    updated_at: ago(4),
    configuration: {},
    observation: observation(state),
    ...extra,
  });
  const services = [
    service('local', 'llama_cpp', 'running', {
      connection_url: serviceUrls.llamaCpp,
      configuration: { port: '8088' },
    }),
    service('local', 'web_search', 'running', { connection_url: serviceUrls.webSearch }),
    service('ares', 'vllm@spotter', 'running', {
      connection_url: 'http://ares.cluster.example.edu:8000',
      configuration: { model: 'Qwen/Qwen3-8B', port: '8000' },
    }),
    service('ares', 'searxng', 'starting', { configuration: { port: '8888' } }),
    service('ares', 'relay', 'running'),
  ];
  const step = (id, label, state) => ({ id, label, state, message: '' });
  const operation = (id, service_id, target_id, action, state, minutes, extra = {}) => ({
    id,
    service_id,
    target_id,
    action,
    state,
    progress: '',
    logs: '',
    created_at: ago(minutes + 3),
    updated_at: ago(minutes),
    steps: [],
    reused: [],
    from_scratch: false,
    log_cursor: 0,
    ...extra,
  });
  const operations = [
    operation('op_start_searxng', 'searxng', 'local', 'start', 'failed', 5, {
      error: 'Port 8888 is already in use on this computer.',
      logs: [
        '$ apptainer run searxng.sif --port 8888',
        'starting SearXNG',
        'error: bind 0.0.0.0:8888: address already in use',
      ].join('\n'),
      steps: [step('launch', 'Start the search engine', 'failed')],
    }),
    operation('op_install_vllm', 'vllm@spotter', 'ares', 'install', 'succeeded', 12, {
      progress: 'Installed',
      steps: [
        step('pull', 'Download the runtime', 'succeeded'),
        step('launch', 'Start the model server', 'succeeded'),
      ],
    }),
    operation('op_install_agent', 'clio_agent', 'ares', 'install', 'succeeded', 60),
    operation('op_stop_ollama', 'ollama', 'ares', 'stop', 'cancelled', 180),
    operation('op_remove_cmf', 'cmf', 'utah-cluster', 'remove', 'succeeded', 1_440),
  ];
  const download = (id, target_id, repository, state, minutes, extra = {}) => {
    const root = target_id === 'local' ? localModels.root : '/lus/ares/clio/models';
    const separator = target_id === 'local' ? '\\' : '/';
    return {
      id,
      target_id,
      storage_root: root,
      repository,
      requested_revision: 'main',
      revision: null,
      destination: `${root}${separator}${repository.replace('/', '--')}`,
      state,
      phase: state === 'running' ? 'Downloading files' : state === 'queued' ? 'Waiting' : 'Stopped',
      bytes_done: 0,
      bytes_total: null,
      created_at: epochAgo(minutes + 2),
      updated_at: epochAgo(minutes),
      observed_at: epochAgo(0),
      error: null,
      origin: 'receipt',
      ...extra,
    };
  };
  const localDownloads = [
    download('dl_llama_31_8b', 'local', 'meta-llama/Llama-3.1-8B-Instruct', 'running', 1, {
      bytes_done: 9_982_000_000,
      bytes_total: 16_100_000_000,
    }),
    download('dl_mistral_7b', 'local', 'mistralai/Mistral-7B-Instruct-v0.3', 'failed', 40, {
      error: `Not enough space in ${localModels.root}`,
    }),
  ];
  const aresModels = [
    download('model_ares_qwen3_8b', 'ares', 'Qwen/Qwen3-8B', 'ready', 2_880, {
      revision: '8c3b9f1a4e2d7c6b5a49382716f0e1d2c3b4a596',
      phase: 'Model available',
      bytes_done: 16_400_000_000,
      bytes_total: 16_400_000_000,
    }),
    download('dl_gemma_3_4b', 'ares', 'google/gemma-3-4b-it', 'queued', 3),
  ];
  const modelInventories = {
    local: {
      ...localModels.inventory,
      models: [...localModels.inventory.models, ...localDownloads],
    },
    ares: { target_id: 'ares', models: aresModels, errors: [], unavailable_reason: null },
  };
  const inventory = {
    targets,
    services,
    connections: [],
    operations,
    model_acquisitions: [...localDownloads, ...aresModels.filter((row) => row.state !== 'ready')],
  };
  const locations = (root, separator) => ({
    root,
    models: `${root}${separator}models`,
    service_data: `${root}${separator}services`,
    captures: `${root}${separator}captures`,
    temporary: `${root}${separator}tmp`,
  });
  const storage = {
    local: {
      root: localModels.home + '\\.clio',
      separator: '\\',
      hostname: localTargetFacts.hostname,
    },
    ares: { root: '/lus/ares/clio', separator: '/', hostname: 'ares-login01' },
  };
  const storageSettings = (id) => {
    const host = storage[id];
    const effective = locations(host.root, host.separator);
    return {
      target_id: id,
      host_label: targets.find((row) => row.id === id).label,
      hostname: host.hostname,
      requested: effective,
      effective,
      defaults: effective,
    };
  };
  const aresFacts = {
    ...localTargetFacts,
    target_id: 'ares',
    label: 'ares',
    os: 'linux',
    hostname: 'ares-login01',
    home: '/home/researcher',
    agent_data_root: '/lus/ares/clio',
    accelerator: 'nvidia',
    gpus: [
      {
        index: 0,
        name: 'NVIDIA A100-SXM4-80GB',
        vendor: 'nvidia',
        memory_total_mib: 81_920,
        uuid: '',
      },
    ],
  };
  const aresStates = {
    vllm: { state: 'running', connection_url: 'http://ares.cluster.example.edu:8000' },
    ollama: { state: 'stopped' },
    searxng: { state: 'running', observation: observation('starting') },
    relay: { state: 'running' },
  };
  const catalogs = {
    local: localCatalog,
    ares: {
      facts: aresFacts,
      services: catalogFor('Linux NVIDIA + Docker').map((row) => ({
        ...row,
        state: 'not_installed',
        ...aresStates[row.id],
      })),
    },
  };
  const notFound = (response, targetId) =>
    sendJson(response, { error: 'target_not_found', target_id: targetId }, 404);

  return {
    catalog(targetId) {
      return catalogs[targetId];
    },
    models(targetId) {
      return modelInventories[targetId];
    },
    async handle(request, response, url) {
      const get = request.method === 'GET';
      if (get && url.pathname === '/v1/infrastructure/inventory') {
        sendJson(response, inventory);
        return true;
      }
      if (get && url.pathname === '/v1/infrastructure/targets') {
        sendJson(response, { targets });
        return true;
      }
      if (get && url.pathname === '/v1/infrastructure/service-connections') {
        sendJson(response, { connections: inventory.connections });
        return true;
      }
      const storageRoute = /^\/v1\/infrastructure\/targets\/([^/]+)\/storage(\/inspect)?$/u.exec(
        url.pathname,
      );
      if (!storageRoute) return false;
      const targetId = decodeURIComponent(storageRoute[1]);
      if (get && !storageRoute[2]) {
        if (storage[targetId]) sendJson(response, storageSettings(targetId));
        else notFound(response, targetId);
        return true;
      }
      if (request.method === 'POST' && storageRoute[2]) {
        const body = await readJson(request);
        if (!storage[targetId]) {
          notFound(response, targetId);
          return true;
        }
        const path =
          typeof body?.path === 'string' && body.path ? body.path : storage[targetId].root;
        const separator = storage[targetId].separator;
        sendJson(response, {
          target_id: targetId,
          host_label: targets.find((row) => row.id === targetId).label,
          path,
          existing_ancestor: path,
          exists: true,
          writable: true,
          free_bytes: targetId === 'ares' ? 1_200_000_000_000 : 412_000_000_000,
          total_bytes: targetId === 'ares' ? 4_000_000_000_000 : 1_000_000_000_000,
          required_bytes: Number(body?.required_bytes ?? 0),
          capacity_ok: true,
          parent: path.split(separator).slice(0, -1).join(separator) || separator,
          entries: [],
          truncated: false,
        });
        return true;
      }
      return false;
    },
  };
}
