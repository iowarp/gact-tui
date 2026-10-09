/** Test-only conversation forks and mixed output records for issue regressions. */
export function createBranchArtifactFixture({
  session,
  workspaceId,
  observedAt,
  transcriptMessages,
  readJson,
  sendJson,
  commonHeaders,
}) {
  const branches = new Map();
  let mixed = false;
  let compact = false;
  const names = [
    'collect_sweep.py',
    'plan-sweep.md',
    'sweep-compare.json',
    'optimized_iso0.5.glb',
    'sweep-slides.pptx',
  ];
  const records = names.map((name, index) => ({
    workspace_id: workspaceId,
    name,
    kind: 'application/octet-stream',
    latest_version: 1,
    head_artifact_id: `artifact_navigation_${index}`,
    aliases: {},
    producing_session_ids: [session.id],
    versions: [
      {
        artifact_id: `artifact_navigation_${index}`,
        workspace_id: workspaceId,
        name,
        version: 1,
        kind: 'application/octet-stream',
        custody: 'fixture',
        mechanism: 'fixture_capture',
        evidence_class: 'test_owned',
        size_bytes: 32,
        created_at: observedAt,
        producer: { session_id: session.id },
        uri: `artifact://artifact_navigation_${index}`,
        fetch_url: `/v1/artifacts/artifact_navigation_${index}/bytes`,
      },
    ],
  }));
  return {
    reset() {
      branches.clear();
      mixed = false;
      compact = false;
    },
    compactMessages() {
      return compact
        ? ['Baseline sweep', 'Baseline complete.'].map((text, index) => ({
            id: `msg_baseline_${index}`,
            session_id: session.id,
            role: index ? 'assistant' : 'user',
            created_at: observedAt,
            completed_at: observedAt,
            blocks: [{ id: `baseline_text_${index}`, type: 'text', text }],
          }))
        : undefined;
    },
    sessions() {
      return [...branches.values()].map((entry) => entry.session);
    },
    artifacts() {
      return mixed ? records : [];
    },
    async handle(request, response, url) {
      if (request.method === 'POST' && url.pathname === '/__test/branch-navigation') {
        compact = true;
        session.state = 'completed';
        sendJson(response, { enabled: true });
        return true;
      }
      if (request.method === 'POST' && url.pathname === '/__test/artifact-navigation') {
        mixed = true;
        sendJson(response, { enabled: true });
        return true;
      }
      if (request.method === 'POST' && url.pathname === `/v1/sessions/${session.id}/fork`) {
        const body = await readJson(request);
        const source = transcriptMessages();
        const cutoff = body.at_message_id
          ? source.findIndex((message) => message.id === body.at_message_id) + 1
          : source.length;
        const id = `sess_branch_${branches.size + 1}`;
        const messages = structuredClone(source.slice(0, cutoff)).map((message) => ({
          ...message,
          session_id: id,
        }));
        const row = {
          ...session,
          id,
          title: `${session.title} (fork)`,
          state: 'completed',
          parent_session_id: session.id,
          session_kind: 'branch',
          message_count: messages.length,
        };
        branches.set(id, { session: row, messages });
        sendJson(response, row, 201);
        return true;
      }
      const artifactMatch = /^\/v1\/artifacts\/(artifact_navigation_\d+)(\/bytes)?$/u.exec(
        url.pathname,
      );
      if (mixed && request.method === 'GET' && artifactMatch) {
        const record = records.find((row) => row.head_artifact_id === artifactMatch[1]);
        if (!record) return false;
        if (artifactMatch[2]) {
          response.writeHead(200, commonHeaders('text/plain'));
          response.end('# Test-owned sweep script\nprint("sweep")\n');
        } else sendJson(response, { artifact: record, resolved: record.versions[0] });
        return true;
      }
      const match = /^\/v1\/sessions\/(sess_branch_\d+)(\/.*)?$/u.exec(url.pathname);
      const entry = match && branches.get(match[1]);
      if (!entry) return false;
      const suffix = match[2] ?? '';
      if (request.method === 'GET' && !suffix) {
        sendJson(response, entry.session);
      } else if (request.method === 'GET' && suffix === '/messages') {
        sendJson(response, {
          messages: entry.messages,
          tools: [],
          tasks: [],
          subagents: [],
          artifacts: [],
          surfaces: [],
          runs: [],
        });
      } else if (request.method === 'POST' && suffix === '/messages') {
        const body = await readJson(request);
        const id = `msg_branch_${entry.messages.length}`;
        const acceptedAt = new Date().toISOString();
        entry.messages.push({
          id,
          session_id: entry.session.id,
          role: 'user',
          created_at: acceptedAt,
          blocks: [
            {
              id: `${id}_text`,
              type: 'text',
              text: body.parts?.find((part) => part.type === 'text')?.text ?? body.text ?? '',
            },
          ],
        });
        entry.session.message_count = entry.messages.length;
        entry.session.updated_at = acceptedAt;
        entry.session.last_interaction_at = acceptedAt;
        sendJson(
          response,
          {
            message_id: id,
            accepted_at: acceptedAt,
            delivery: body.delivery ?? 'prompt',
            state: 'started',
            effective_model: body.model ?? { provider_id: 'codex', model_id: 'gpt-5.6-luna' },
            behavior: body.behavior,
            idempotent_replay: false,
          },
          202,
        );
      } else if (request.method === 'GET' && suffix === '/events') {
        response.writeHead(200, commonHeaders('text/event-stream'));
        response.write(': branch fixture\n\n');
        const keepAlive = setInterval(() => response.write(': branch fixture\n\n'), 1000);
        request.on('close', () => clearInterval(keepAlive));
      } else if (
        request.method === 'GET' &&
        ['/questions', '/permissions', '/interactions', '/agent-tasks', '/artifacts'].includes(
          suffix,
        )
      ) {
        sendJson(response, {
          questions: [],
          permissions: [],
          interactions: [],
          tasks: [],
          artifacts: [],
          used: [],
          count: 0,
          include_children: true,
          child_session_ids: [],
          next_cursor: null,
        });
      } else {
        // Copied context/configuration use the base fixture's established handlers.
        url.pathname = `/v1/sessions/${session.id}${suffix}`;
        return false;
      }
      return true;
    },
  };
}
