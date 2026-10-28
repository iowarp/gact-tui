/** Test-owned sources and a recorded-shape search reply, never a live model acceptance claim. */
export async function installSearchFixture(page, endpoint, theme = 'light') {
  await page.request.post(`${endpoint}/__test/reset`);
  await page.request.post(`${endpoint}/__test/branch-navigation`);
  await page.request.post(`${endpoint}/v1/permissions/perm_fixture`, {
    data: { decision: 'deny' },
  });
  await page.request.post(
    `${endpoint}/v1/sessions/sess_flat_ndp/questions/question_fixture/answer`,
    { data: { text: 'Station table' } },
  );
  const baseSessions = await (await page.request.get(`${endpoint}/v1/sessions`)).json();
  const baseWorkspaces = await (await page.request.get(`${endpoint}/v1/workspaces`)).json();
  const session = { ...baseSessions.sessions[0], title: 'Plant study review', state: 'completed' };
  const workspace = baseWorkspaces.workspaces[0];
  const archive = {
    ...workspace,
    id: 'ws_search_archive',
    display_name: 'Archived field notes',
    name: 'Archived field notes',
    path: '/archive',
  };
  const archivedSession = {
    ...session,
    id: 'sess_search_archive',
    workspace_id: archive.id,
    title: 'Plant study archive',
  };
  const phrase = 'Share a plant with the reviewer.';
  const assistant = {
    id: 'msg_search_passage',
    session_id: session.id,
    role: 'assistant',
    created_at: session.updated_at,
    completed_at: session.updated_at,
    stop_reason: 'end_turn',
    blocks: [
      {
        id: 'part_search_passage',
        type: 'text',
        text: `${'The protocol records the available measurements.\n\n'.repeat(80)}${phrase}\n\nKeep the source labels unchanged.`,
      },
    ],
  };
  const archiveMessage = { ...assistant, session_id: archivedSession.id };
  const searchSession = {
    ...session,
    id: 'sess_search_fixture',
    title: 'CLIO Search',
    session_kind: 'lookup',
    model_id: 'Fleet search model',
    metadata: {
      agent_ref: 'clio/clio-search',
      search_session: { ephemeral: true },
      side_session: { read_only: true, ephemeral: true },
    },
  };
  const state = { submitted: [], deleted: [], created: 0, searchRequests: [] };
  let answerReady;
  const ready = new Promise((resolve) => {
    answerReady = resolve;
  });
  const fileText =
    '# Plant study notes\n\nThe archived protocol records a reviewer handoff.\nShare a plant with the reviewer.\nKeep the original labels.\n';
  const snapshot = (messages) => ({
    messages,
    tools: [],
    tasks: [],
    subagents: [],
    artifacts: [],
    surfaces: [],
    runs: [],
  });
  await page.route('**/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const json = async (body, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', json: body });
    if (request.method() === 'GET' && path === '/v1/settings/fleet')
      return json({
        revision: 'fixture',
        judges: { goals: null, variants: null, permissions: null },
        search: { provider_id: 'lmstudio', model_id: 'Fleet search model' },
      });
    if (request.method() === 'GET' && path === '/v1/workspaces')
      return json({ workspaces: [workspace, archive] });
    if (request.method() === 'GET' && path === '/v1/sessions')
      return json({ sessions: [session, archivedSession] });
    if (path === `/v1/sessions/${session.id}` && request.method() === 'GET') return json(session);
    if (path === `/v1/sessions/${archivedSession.id}` && request.method() === 'GET')
      return json(archivedSession);
    if (path === `/v1/sessions/${session.id}/messages`)
      return json(
        snapshot([
          {
            id: 'msg_search_request',
            session_id: session.id,
            role: 'user',
            created_at: session.created_at,
            blocks: [{ id: 'part_request', type: 'text', text: 'Review the study protocol.' }],
          },
          assistant,
        ]),
      );
    if (path === `/v1/sessions/${archivedSession.id}/messages`)
      return json(snapshot([archiveMessage]));
    if (path === '/v1/session-recall/search') {
      const query = url.searchParams.get('query') ?? url.searchParams.get('q') ?? '';
      const matches = phrase.toLowerCase().includes(query.toLowerCase());
      return json({
        query,
        include_cross_session: true,
        searched_sessions: [session.id, archivedSession.id],
        hits: matches
          ? [
              {
                session_id: session.id,
                session_title: session.title,
                workspace_id: session.workspace_id,
                message_id: assistant.id,
                part_id: 'part_search_passage',
                role: 'assistant',
                created_at: assistant.created_at,
                text: `…The protocol records the available measurements. ${phrase} Keep the source labels unchanged.`,
                score: 1,
                match_terms: query.split(' '),
                metadata: { exact_phrase: true },
              },
            ]
          : [],
        metadata: {},
      });
    }
    if (path.endsWith('/files') && request.method() === 'GET')
      return json({
        entries: [
          {
            path: 'notes/plant-study.md',
            type: 'file',
            size: fileText.length,
            media_type: 'text/markdown',
            internal: false,
          },
        ],
        truncated: false,
      });
    if (path.endsWith('/files/read'))
      return route.fulfill({ contentType: 'text/plain', body: fileText });
    if (path.endsWith('/files/passage')) {
      if (!url.searchParams.get('path')) return json({ detail: 'path is required' }, 422);
      return json({ text: fileText, start_line: 1, truncated: false, next_line: null });
    }
    if (/\/sessions\/[^/]+\/(interactions|permissions|questions)$/u.test(path))
      return json({ interactions: [], permissions: [], questions: [] });
    if (path === '/v1/search/sessions' && request.method() === 'POST') {
      state.searchRequests.push(request.postDataJSON());
      state.created += 1;
      return json(searchSession, 201);
    }
    if (path === `/v1/sessions/${searchSession.id}` && request.method() === 'DELETE') {
      state.deleted.push(searchSession.id);
      return route.fulfill({ status: 204 });
    }
    if (path === `/v1/sessions/${searchSession.id}/messages` && request.method() === 'POST') {
      const body = request.postDataJSON();
      state.submitted.push(body);
      answerReady();
      return json(
        {
          message_id: 'msg_search_question',
          accepted_at: session.updated_at,
          delivery: 'start',
          state: 'started',
          effective_model: { provider_id: 'lmstudio', model_id: 'Fleet search model' },
          behavior: body.behavior,
          idempotent_replay: false,
        },
        202,
      );
    }
    if (path === `/v1/sessions/${searchSession.id}/messages` && request.method() === 'GET') {
      await ready;
      return json(
        snapshot([
          {
            id: 'msg_search_answer',
            session_id: searchSession.id,
            role: 'assistant',
            created_at: session.updated_at,
            completed_at: session.updated_at,
            stop_reason: 'end_turn',
            blocks: [
              {
                id: 'part_search_answer',
                type: 'text',
                text: `The reviewer handoff appears in the study protocol. [Open the matching message](session://${session.workspace_id}/${session.id}#message-${assistant.id}?part=part_search_passage&find=Share%20a%20plant%20with%20the%20reviewer.)\n\nThe archived notes record the same handoff. [Read the archived notes](workspace-file://${archive.id}/notes/plant-study.md?line=4&find=Share%20a%20plant%20with%20the%20reviewer.)`,
              },
            ],
          },
        ]),
      );
    }
    if (path === `/v1/sessions/${searchSession.id}/events`)
      return route.fulfill({ contentType: 'text/event-stream', body: ': test search\n\n' });
    if (path === `/v1/sessions/${searchSession.id}`) return json(searchSession);
    return route.fallback();
  });
  await page.addInitScript(
    ({ endpoint, theme }) => {
      localStorage.setItem('clio.recent-connections', JSON.stringify([endpoint]));
      localStorage.setItem('theme', theme);
    },
    { endpoint, theme },
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  return { session, workspace, phrase, state };
}
