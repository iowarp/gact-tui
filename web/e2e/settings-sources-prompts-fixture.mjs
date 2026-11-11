/**
 * Data-source accounts, prompt families, reminders and commands for the
 * Settings catalog fixture. Answers only while the catalog is on; `empty`
 * lists nothing and `error` fails each list with 503.
 */

const modes = (...supported_modes) => ({ supported_modes, unavailable_reasons: {} });

const providers = () => [
  {
    id: 'local',
    name: 'This computer',
    logo: 'local',
    authentication: 'none',
    configured: true,
    capabilities: modes('read_only', 'working_copy', 'write_enabled'),
    setup_requirement: null,
  },
  {
    id: 'github',
    name: 'GitHub',
    logo: 'github',
    authentication: 'browser',
    configured: true,
    authenticated: true,
    account_name: 'jcernuda',
    account_url: 'https://github.com/settings/installations',
    capabilities: modes('read_only', 'working_copy'),
    setup_requirement: null,
  },
  {
    id: 'google_drive',
    name: 'Google Drive',
    logo: 'google_drive',
    authentication: 'browser',
    configured: true,
    authenticated: false,
    capabilities: modes('read_only', 'working_copy'),
    setup_requirement: null,
  },
  {
    id: 'globus',
    name: 'Globus',
    logo: 'globus',
    authentication: 'browser',
    configured: false,
    authenticated: false,
    capabilities: modes('read_only'),
    setup_requirement: 'Ask the service administrator to register a Globus client ID.',
  },
  {
    id: 'obsidian',
    name: 'Obsidian',
    logo: 'obsidian',
    authentication: 'none',
    configured: true,
    capabilities: modes('read_only', 'write_enabled'),
    setup_requirement: null,
  },
];

const profile = (name, text, scope, extra = {}) => ({
  name,
  text,
  scope,
  source_path: extra.source_path,
  provider: extra.provider,
  model: extra.model,
  metadata: extra.metadata ?? {},
});

const prompts = () => [
  {
    id: 'science.review',
    title: 'Science review',
    description: 'Checks claims against the cited evidence before an answer is final.',
    default_profile: 'heavy',
    profiles: {
      heavy: profile(
        'heavy',
        'Review every claim against its evidence. Keep provenance visible.\n\n{{workspace_name}}',
        'workspace',
        {
          source_path: 'D:/science/.clio/prompts/science.review--heavy.md',
          provider: 'codex',
          model: 'gpt-5.6-luna',
        },
      ),
      light: profile('light', 'Point out unsupported claims.', 'builtin'),
    },
    scope: 'workspace',
    source_path: 'D:/science/.clio/prompts/science.review--heavy.md',
    enabled: true,
    validation_errors: [],
    metadata: {},
  },
  {
    id: 'clio.system',
    title: 'Agent instructions',
    description: 'The base instructions every conversation starts with.',
    default_profile: 'default',
    profiles: {
      default: profile('default', 'You are CLIO, a scientific assistant.', 'builtin'),
    },
    scope: 'builtin',
    enabled: true,
    validation_errors: [],
    metadata: {},
  },
  {
    id: 'clio.summarize',
    title: 'Conversation summary',
    default_profile: 'default',
    profiles: {
      default: profile('default', 'Summarize {{conversation}} in five lines.', 'global', {
        source_path: 'D:/CLIO/config/prompts/clio.summarize.md',
      }),
      brief: profile('brief', 'Summarize in one line.', 'global'),
      detailed: profile('detailed', 'Summarize with every decision and its reason.', 'global'),
    },
    scope: 'global',
    source_path: 'D:/CLIO/config/prompts/clio.summarize.md',
    enabled: true,
    validation_errors: [],
    metadata: {},
  },
  {
    id: 'plot.caption',
    title: 'Plot caption',
    default_profile: 'default',
    profiles: {
      default: profile('default', 'Caption {{figure}} with {{unknown_variable}}.', 'global'),
    },
    scope: 'global',
    enabled: false,
    validation_errors: ['Unknown placeholder {{unknown_variable}}'],
    metadata: {},
  },
  {
    id: 'reminder.context-budget',
    title: 'Context budget',
    description: 'Tells the agent how much of its context window remains.',
    default_profile: 'default',
    profiles: {
      default: profile('default', '{{remaining}} tokens remain.', 'builtin'),
    },
    scope: 'builtin',
    enabled: true,
    validation_errors: [],
    metadata: {
      kind: 'reminder',
      trigger: 'every 6 turns',
      variables: 'remaining',
      param_after: '6',
      required: 'The agent plans its work with this number.',
    },
  },
  {
    id: 'reminder.cite-sources',
    title: 'Cite sources',
    description: 'Reminds the agent to cite the files it read.',
    default_profile: 'default',
    profiles: {
      default: profile('default', 'Cite the files you read.', 'builtin'),
    },
    scope: 'builtin',
    enabled: true,
    validation_errors: [],
    metadata: { kind: 'reminder', trigger: 'after a file read', active: 'true' },
  },
  {
    id: 'reminder.plan-check',
    title: 'Plan check',
    default_profile: 'default',
    profiles: {
      default: profile('default', 'Compare progress with {{plan}}.', 'global'),
    },
    scope: 'global',
    enabled: true,
    validation_errors: [],
    metadata: {
      kind: 'reminder',
      trigger: 'when a plan step completes',
      variables: 'plan',
      active: 'false',
    },
  },
];

const command = (row) => ({
  kind: 'command',
  source: 'clio_builtin',
  plugin: 'core',
  label: '',
  status: 'available',
  enabled: true,
  aliases: [],
  arguments: [],
  metadata: {},
  unsupported_fields: [],
  ...row,
});

const commands = () => [
  command({
    id: '/compact',
    kind: 'builtin',
    title: 'Compact conversation',
    description: 'Summarize earlier turns to free context.',
    aliases: ['/summarize'],
  }),
  command({
    id: '/review',
    title: 'Review an artifact',
    description: 'Check a plot, table or notebook against its sources.',
    source: 'clio_workspace',
    argument_hint: '<artifact>',
    unsupported_fields: ['allowed-tools'],
  }),
  command({
    id: '/ndp-search',
    title: 'Search the data portal',
    description: 'Find NDP datasets by keyword.',
    plugin: 'ndp',
    source: 'plugin',
    argument_hint: '<keywords>',
  }),
  command({
    id: '/deploy',
    title: 'Deploy',
    description: 'Deploy the current build.',
    source: 'claude_user',
    enabled: false,
    status: 'disabled',
    disabled_reason: 'command_shadowed',
    disabled_detail: 'The workspace command file of the same name wins.',
  }),
  command({
    id: 'spotter-analysis',
    kind: 'skill',
    title: 'SPOTTER analysis',
    description: 'Run the SPOTTER campaign analysis notebook.',
    plugin: 'spotter',
    source: 'plugin',
  }),
  command({
    id: 'github:summarize-pr',
    kind: 'mcp_prompt',
    title: 'Summarize pull request',
    description: 'Summarize a pull request and its review.',
    label: 'GitHub',
    source: 'mcp',
    argument_hint: '<number>',
  }),
];

function resolve(prompt, profileName) {
  const name = profileName || prompt.default_profile || Object.keys(prompt.profiles)[0];
  const chosen = prompt.profiles[name] ?? Object.values(prompt.profiles)[0];
  return {
    id: prompt.id,
    profile: chosen?.name ?? name,
    text: chosen?.text ?? '',
    title: prompt.title,
    description: prompt.description,
    scope: chosen?.scope ?? prompt.scope,
    source_path: chosen?.source_path ?? prompt.source_path,
    provider: chosen?.provider,
    model: chosen?.model,
    validation_errors: prompt.validation_errors,
    metadata: { ...prompt.metadata, ...(chosen?.metadata ?? {}) },
  };
}

/** Per-catalog state; `reset` restores the seeded rows. */
export function createSourcesPromptsCatalog() {
  let accounts = providers();
  let families = prompts();
  const reset = () => {
    accounts = providers();
    families = prompts();
  };

  const handle = async (request, response, url, { sendJson, readJson, empty, error, fail }) => {
    const path = url.pathname;
    const method = request.method;
    if (method === 'GET' && path === '/v1/storage/providers') {
      if (error) return fail(sendJson, response, 'data source accounts'), true;
      sendJson(response, {
        clio_id: 'fixture',
        host_id: 'fixture-host',
        providers: empty ? [] : accounts,
      });
      return true;
    }
    const signOut = /^\/v1\/storage\/accounts\/([^/]+)$/u.exec(path);
    if (method === 'DELETE' && signOut) {
      const row = accounts.find((entry) => entry.id === decodeURIComponent(signOut[1]));
      if (row) Object.assign(row, { authenticated: false, account_name: undefined });
      sendJson(response, { signed_out: true });
      return true;
    }
    if (method === 'GET' && path === '/v1/prompts') {
      if (error) return fail(sendJson, response, 'prompts'), true;
      sendJson(response, { prompts: empty ? [] : families });
      return true;
    }
    if (method === 'POST' && path === '/v1/prompts/reload') {
      sendJson(response, {
        reload: { prompt_ids: families.map((row) => row.id), prompt_count: families.length },
      });
      return true;
    }
    const action = /^\/v1\/prompts\/([^/]+)(?:\/(render|validate))?$/u.exec(path);
    if (action) {
      const id = decodeURIComponent(action[1]);
      const body = method === 'GET' ? {} : ((await readJson(request)) ?? {});
      let prompt = families.find((row) => row.id === id);
      if (method === 'PUT') {
        const profileName = body.profile || 'default';
        prompt ??= {
          id,
          title: body.title || id,
          default_profile: profileName,
          profiles: {},
          scope: body.scope ?? 'global',
          enabled: true,
          validation_errors: [],
          metadata: {},
        };
        if (!families.includes(prompt)) families.push(prompt);
        Object.assign(prompt, {
          title: body.title || prompt.title,
          description: body.description || prompt.description,
          scope: body.scope ?? prompt.scope,
        });
        prompt.profiles[profileName] = profile(profileName, body.text ?? '', body.scope, {
          provider: body.provider,
          model: body.model,
          metadata: body.metadata ?? prompt.profiles[profileName]?.metadata,
        });
        sendJson(response, { prompt });
        return true;
      }
      if (!prompt) return sendJson(response, { error: 'not_found' }, 404), true;
      const profileName = url.searchParams.get('profile') ?? body.profile;
      if (action[2] === 'validate') {
        const errors = /\{\{unknown/u.test(body.text ?? '')
          ? ['Unknown placeholder {{unknown_variable}}']
          : [];
        sendJson(response, {
          enabled: !errors.length,
          validation_errors: errors,
          prompt,
        });
        return true;
      }
      if (action[2] === 'render') {
        const resolved = resolve(prompt, profileName);
        sendJson(response, {
          prompt: {
            ...resolved,
            text: resolved.text.replace(/\{\{(\w+)\}\}/gu, (_match, name) =>
              name === 'workspace_name' ? 'Flat NDP' : `<${name}>`,
            ),
          },
        });
        return true;
      }
      if (method === 'GET') {
        sendJson(response, { prompt: resolve(prompt, profileName) });
        return true;
      }
    }
    if (method === 'GET' && path === '/v1/commands') {
      if (error) return fail(sendJson, response, 'commands'), true;
      sendJson(response, { commands: empty ? [] : commands() });
      return true;
    }
    return false;
  };

  return { handle, reset };
}
