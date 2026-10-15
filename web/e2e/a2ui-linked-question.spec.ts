import { expect, test } from '@playwright/test';
import { linkedQuestionSurface } from './a2ui-linked-question-fixture.mjs';

const endpoint = `http://127.0.0.1:${process.env['CLIO_FIXTURE_PORT'] ?? '18799'}`;
const sid = 'sess_flat_ndp';

for (const width of [1280, 390]) {
  test(`keeps five dashboard tabs while a linked decision waits at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.request.post(`${endpoint}/__test/reset`);
    const surface = linkedQuestionSurface(sid);
    let asked = false;
    let answered = false;
    const submissions: unknown[] = [];
    await page.addInitScript((service) => {
      localStorage.setItem('clio.recent-connections', JSON.stringify([service]));
      localStorage.setItem('theme', 'light');
    }, endpoint);
    await page.route(`${endpoint}/v1/capabilities`, async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      body.capabilities.x_clio_interactions = true;
      await route.fulfill({ json: body });
    });
    await page.route('**/v1/sessions?*', async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      for (const session of body.sessions ?? [])
        if (session.id === sid) session.state = 'waiting_user';
      await route.fulfill({ json: body });
    });
    await page.route(`${endpoint}/v1/sessions`, async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      for (const session of body.sessions ?? [])
        if (session.id === sid) session.state = 'waiting_user';
      await route.fulfill({ json: body });
    });
    await page.route(`${endpoint}/v1/sessions/${sid}/messages*`, async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      const response = await route.fetch();
      const body = await response.json();
      body.messages = [
        {
          id: 'review-request',
          session_id: sid,
          role: 'user',
          created_at: '2026-10-14T23:59:59Z',
          blocks: [
            {
              id: 'review-request-text',
              type: 'text',
              text: 'Show the research dashboard. Keep its tabs available while I review checkpoint cleanup.',
            },
          ],
        },
        {
          id: surface.message_id,
          session_id: sid,
          role: 'assistant',
          created_at: '2026-10-15T00:00:00Z',
          blocks: [{ id: surface.part_id, type: 'a2ui', surface_id: surface.id }],
        },
      ];
      body.tools = [];
      body.tasks = [];
      body.subagents = [];
      body.artifacts = [];
      body.surfaces = [surface];
      await route.fulfill({ json: body });
    });
    await page.route(`${endpoint}/v1/sessions/${sid}/interactions*`, async (route) => {
      await route.fulfill({
        json: {
          interactions:
            asked && !answered
              ? [
                  {
                    id: 'question:dashboard-review',
                    kind: 'question',
                    owner_session_id: sid,
                    attended_session_id: sid,
                    status: 'pending',
                    title: 'Review checkpoint cleanup',
                    prompt: 'Review checkpoint cleanup',
                    requires_human_response: true,
                    source: { protocol: 'native', surface_id: surface.id },
                    created_at: '2026-10-15T00:00:00Z',
                    actions: ['answer', 'cancel'],
                    payload: {
                      response_mode: 'blocking',
                      metadata: {
                        a2ui_presentation: 'linked',
                        a2ui_answer_action: 'question.submit',
                      },
                    },
                  },
                ]
              : [],
          degradations: [],
          has_more: false,
        },
      });
    });
    await page.route(`${endpoint}/v1/sessions/${sid}/a2ui/actions`, async (route) => {
      submissions.push(route.request().postDataJSON());
      answered = true;
      await route.fulfill({ json: { state: 'delivered', status: 'accepted' } });
    });
    await page.goto(`/workspaces/ws_flat_ndp/sessions/${sid}`);
    const input = page.getByRole('textbox', { name: 'Project name' });
    await expect(input).toBeVisible();
    await input.fill('Retained research draft');
    await expect(page.getByRole('button', { name: 'Go to question' })).toHaveCount(0);
    asked = true;
    const notice = page.getByRole('region', { name: 'Agent needs your response' });
    await expect(notice.getByRole('button', { name: 'Go to question' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Overview', exact: true })).toHaveAttribute(
      'data-state',
      'active',
    );
    await expect(input).toHaveValue('Retained research draft');
    await expect(notice.getByRole('tab')).toHaveCount(0);
    await expect(page.locator('[data-slot="pending-a2ui"]')).toHaveCount(0);
    await page.screenshot({ path: `screenshots/linked-question-overview-${width}.png` });
    await notice.getByRole('button', { name: 'Go to question' }).click();
    await expect(page.getByRole('tab', { name: 'Decisions', exact: true })).toHaveAttribute(
      'data-state',
      'active',
    );
    await expect(page.getByRole('button', { name: 'Keep checkpoints' })).toHaveCount(1);
    expect(submissions).toHaveLength(0);
    await page.screenshot({ path: `screenshots/linked-question-decision-${width}.png` });
    await page.getByRole('tab', { name: 'Overview', exact: true }).click();
    await expect(input).toHaveValue('Retained research draft');
    await notice.getByRole('button', { name: 'Go to question' }).click();
    await page.getByRole('button', { name: 'Keep checkpoints' }).click();
    await expect.poll(() => submissions.length).toBe(1);
    expect(submissions[0]).toMatchObject({
      message: {
        action: { name: 'question.submit', surfaceId: surface.id, context: { choice: 'keep' } },
      },
    });
    await expect(notice).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Decisions', exact: true })).toHaveAttribute(
      'data-state',
      'active',
    );
    expect(errors).toEqual([]);
    await page.unrouteAll({ behavior: 'wait' });
  });
}
