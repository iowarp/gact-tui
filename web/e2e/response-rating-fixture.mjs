/** Browser-only feedback receipts; backend tests cover actual ARC persistence. */
export async function installResponseRatingFixture(page, endpoint) {
  await page.request.post(`${endpoint}/__test/reset`);
  await page.request.post(`${endpoint}/v1/permissions/perm_fixture`);
  await page.request.post(
    `${endpoint}/v1/sessions/sess_flat_ndp/questions/question_fixture/answer`,
    {
      data: { selected_options: ['table'] },
    },
  );
  const session = {
    ...(await (await page.request.get(`${endpoint}/v1/sessions`)).json()).sessions[0],
    state: 'completed',
    title: 'Response feedback review',
  };
  const messageId = 'msg_rating_review';
  const text = 'The report preserves the original labels and explains the quality flags.';
  const state = { feedback: null, history: [], failNext: false };
  await page.route(`${endpoint}/v1/sessions`, (route) =>
    route.fulfill({ json: { sessions: [session] } }),
  );
  await page.route(`${endpoint}/v1/sessions/${session.id}`, (route) =>
    route.fulfill({ json: session }),
  );
  await page.route(
    (url) => url.origin === endpoint && url.pathname === `/v1/sessions/${session.id}/messages`,
    (route) =>
      route.fulfill({
        json: {
          messages: [
            {
              id: messageId,
              session_id: session.id,
              role: 'assistant',
              created_at: session.created_at,
              completed_at: session.updated_at,
              stop_reason: 'end_turn',
              blocks: [{ id: 'rating_text', type: 'text', text }],
            },
          ],
          tools: [],
          tasks: [],
          subagents: [],
          artifacts: [],
          surfaces: [],
          runs: [],
        },
      }),
  );
  await page.route(
    `${endpoint}/v1/sessions/${session.id}/messages/${messageId}/feedback`,
    async (route) => {
      if (route.request().method() === 'PUT') {
        if (state.failNext) {
          state.failNext = false;
          return route.fulfill({
            status: 503,
            json: {
              error: { error: 'feedback_unavailable', message: 'Test-owned write failure.' },
            },
          });
        }
        const input = route.request().postDataJSON();
        if (input.expected_feedback_id !== (state.feedback?.feedback_id ?? null))
          return route.fulfill({
            status: 409,
            json: { error: { message: 'Feedback changed elsewhere.' } },
          });
        state.feedback = {
          schema_version: 1,
          feedback_id: input.feedback_id,
          previous_feedback_id: state.feedback?.feedback_id ?? null,
          rating: input.rating,
          comment: input.comment ?? state.feedback?.comment ?? '',
          created_at: new Date().toISOString(),
          session_id: session.id,
          message_id: messageId,
          turn_id: 'rating_prompt',
          workspace_id: session.workspace_id,
          prompt_message_id: 'rating_prompt',
          prompt_text: 'Review the report.',
          response_text: text,
          response_sha256: 'fixture',
          message_created_at: session.created_at,
          stop_reason: 'end_turn',
          model_ref: {},
          model_ref_source: 'unknown',
          source: 'user',
        };
        state.history.push(state.feedback);
      }
      return route.fulfill({ json: { feedback: state.feedback } });
    },
  );
  await page.addInitScript((address) => {
    localStorage.setItem('clio.recent-connections', JSON.stringify([address]));
    localStorage.setItem('theme', 'light');
  }, endpoint);
  return { state, session, messageId, text };
}
