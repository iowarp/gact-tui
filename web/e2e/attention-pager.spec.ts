import { expect, test } from '@playwright/test';
import type { PendingInteraction } from '@clio/core/v3';

const endpoint = `http://127.0.0.1:${process.env['CLIO_FIXTURE_PORT'] ?? '18799'}`;
const sid = 'sess_flat_ndp';
const question = (id: string): PendingInteraction => ({
  id,
  kind: 'question',
  status: 'pending',
  owner_session_id: sid,
  attended_session_id: sid,
  title: 'Question from agent',
  prompt: 'Which evidence should stay primary?',
  requires_human_response: true,
  source: { protocol: 'native', tool_name: 'ask_user' },
  created_at: '2026-10-16T12:00:00Z',
  actions: ['answer', 'cancel'],
  payload: { response_mode: 'blocking', allow_freeform: true },
});

for (const theme of ['light', 'dark']) {
  for (const width of [1280, 390]) {
    test(`${theme} ${width}: one attention page, scoped permission, atomic bundle and retained drafts`, async ({
      page,
    }, testInfo) => {
      expect((await page.request.post(`${endpoint}/__test/reset`)).ok()).toBe(true);
      expect((await page.request.post(`${endpoint}/__test/mcp-v2-ui-demo`)).ok()).toBe(true);
      let rows: PendingInteraction[] = [
        {
          ...question('permission:read'),
          kind: 'permission',
          title: 'Read the station evidence table',
          prompt: 'The agent needs the selected evidence source.',
          actions: ['deny', 'allow', 'allow_session', 'allow_workspace'],
          payload: {
            tool_call: {
              tool_name: 'workspace.read',
              input: {
                path: 'results/stations.csv',
                reason: 'Compare the observed station coverage.',
              },
            },
            execution: { computer: 'Research PC', cwd: 'D:\\Research' },
          },
        },
        {
          ...question('question:bundle'),
          prompt: 'Choose the analysis',
          payload: {
            response_mode: 'blocking',
            metadata: {
              question_bundle: {
                questions: [
                  {
                    id: 'view',
                    question: 'Which evidence view?',
                    kind: 'choice',
                    options: [
                      {
                        label: 'Station table',
                        value: 'table',
                        description: 'Keep sortable evidence primary.',
                      },
                      { label: 'Displacement plot', value: 'plot' },
                    ],
                  },
                  {
                    id: 'region',
                    question: 'Which region?',
                    kind: 'choice',
                    allow_freeform: true,
                    options: [{ label: 'Europe', value: 'eu' }],
                  },
                  {
                    id: 'notes',
                    question: 'What should I emphasize?',
                    kind: 'freeform',
                    allow_freeform: true,
                    options: [],
                  },
                ],
              },
            },
          },
        },
        { ...question('question:other'), prompt: 'Anything else for the report?' },
      ];
      const submissions: { id: string; body: Record<string, unknown> }[] = [];
      await page.route(`${endpoint}/v1/sessions/${sid}/interactions?*`, (route) =>
        route.fulfill({ json: { interactions: rows, degradations: [], has_more: false } }),
      );
      await page.route(`${endpoint}/v1/sessions/${sid}/interactions/*/respond`, async (route) => {
        const id = decodeURIComponent(route.request().url().split('/').at(-2)!);
        submissions.push({ id, body: route.request().postDataJSON() });
        rows = rows.filter((row) => row.id !== id);
        await route.fulfill({ json: { interaction_id: id, status: 'answered' } });
      });
      await page.addInitScript(
        ({ endpoint, theme }) => {
          localStorage.setItem('clio.recent-connections', JSON.stringify([endpoint]));
          localStorage.setItem('theme', theme);
        },
        { endpoint, theme },
      );
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/workspaces/ws_flat_ndp/sessions/${sid}`);
      const panel = page.getByRole('region', { name: 'Agent needs your attention', exact: true });
      await expect(panel.getByText('1 / 3', { exact: true })).toBeVisible();
      await expect(panel.locator('[data-attention-item]:visible')).toHaveCount(1);
      await expect(panel.getByText('Read file', { exact: true })).toBeVisible();
      await expect(panel.getByText('results/stations.csv', { exact: true })).toBeVisible();
      await expect(page.getByRole('log', { name: 'Conversation', exact: true })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`permission-${theme}-${width}.png`) });
      await panel.getByRole('combobox', { name: 'Permission duration' }).click();
      await expect(page.getByRole('option', { name: 'This workspace' })).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath(`permission-scope-${theme}-${width}.png`),
      });
      await page.getByRole('option', { name: 'This session' }).click();
      await panel.getByRole('button', { name: 'Next request' }).click();
      await expect(panel.getByText('2 / 3', { exact: true })).toBeVisible();
      await panel.getByRole('radio', { name: /Station table/ }).click();
      await panel.getByRole('button', { name: 'Next question' }).click();
      await panel.getByRole('radio', { name: 'Other answer' }).click();
      await panel.getByRole('textbox', { name: 'Which region?' }).fill('New Zealand');
      await page.setViewportSize({ width: width === 390 ? 1280 : 390, height: 900 });
      await expect(panel.getByRole('textbox', { name: 'Which region?' })).toHaveValue(
        'New Zealand',
      );
      await page.setViewportSize({ width, height: 900 });
      await expect(panel.getByRole('textbox', { name: 'Which region?' })).toHaveValue(
        'New Zealand',
      );
      await panel.getByRole('button', { name: 'Next request' }).click();
      await panel.getByRole('textbox').fill('Keep uncertainty visible.');
      await panel.getByRole('button', { name: 'Previous request' }).click();
      await expect(panel.getByRole('textbox', { name: 'Which region?' })).toHaveValue(
        'New Zealand',
      );
      await panel.getByRole('button', { name: 'Next question' }).click();
      await expect(panel.getByRole('button', { name: 'Submit all answers' })).toBeDisabled();
      expect(submissions).toHaveLength(0);
      await panel.getByRole('textbox').fill('Measurement quality');
      await page.screenshot({ path: testInfo.outputPath(`bundle-${theme}-${width}.png`) });
      await panel.getByRole('button', { name: 'Submit all answers' }).click();
      await expect(panel.getByText('2 / 2', { exact: true })).toBeVisible();
      await expect(panel.getByRole('textbox')).toHaveValue('Keep uncertainty visible.');
      expect(submissions).toEqual([
        {
          id: 'question:bundle',
          body: {
            action: 'answer',
            metadata: {
              answers: {
                view: { answer: '', selected_options: ['table'] },
                region: { answer: 'New Zealand', selected_options: [] },
                notes: { answer: 'Measurement quality', selected_options: [] },
              },
            },
          },
        },
      ]);
      await panel.getByRole('button', { name: 'Previous request' }).click();
      await expect(panel.getByRole('combobox', { name: 'Permission duration' })).toContainText(
        'This session',
      );
      await panel.getByRole('button', { name: 'Allow for session' }).click();
      await expect(panel.getByText('1 / 1', { exact: true })).toBeVisible();
      expect(submissions[1]).toEqual({ id: 'permission:read', body: { action: 'allow_session' } });
      const bounds = await panel.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page.unrouteAll({ behavior: 'wait' });
    });
  }
}
