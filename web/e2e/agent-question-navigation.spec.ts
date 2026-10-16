import { expect, test } from '@playwright/test';

const endpoint = `http://127.0.0.1:${process.env['CLIO_FIXTURE_PORT'] ?? '18799'}`;
const prompt =
  'What do the treatment labels represent, and which units should be used? Until confirmed, I will compare the recorded categories without assigning a numeric dose.';

test.afterEach(async ({ page }) => {
  // Finish polling response handlers before Playwright disposes their request context.
  await page.unrouteAll({ behavior: 'wait' });
});

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}: open questions remain reachable above the composer and link to their source`, async ({
    page,
  }, testInfo) => {
    expect((await page.request.post(`${endpoint}/__test/reset`)).ok()).toBe(true);
    await page.request.post(`${endpoint}/v1/permissions/perm_fixture`);
    expect((await page.request.post(`${endpoint}/__test/question-tray`)).ok()).toBe(true);
    await page.route('**/v1/sessions/sess_flat_ndp/interactions?*', async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      body.interactions = body.interactions.map((row: { id: string }) =>
        row.id === 'native:question:tray'
          ? {
              ...row,
              prompt,
              payload: {
                question_id: 'tray',
                response_mode: 'async',
                question_kind: 'freeform',
                allow_freeform: true,
                options: [],
              },
            }
          : row,
      );
      await route.fulfill({ response, json: body });
    });
    await page.addInitScript(
      ({ endpoint, theme }) => {
        localStorage.setItem('clio.recent-connections', JSON.stringify([endpoint]));
        localStorage.setItem('theme', theme);
      },
      { endpoint, theme },
    );
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/workspaces/ws_flat_ndp/sessions/sess_flat_ndp');
    const submittedAnswers: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && /\/(questions|interactions)\//.test(request.url()))
        submittedAnswers.push(request.url());
    });

    const draft = 'Use the documented category labels.';
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const tracker = page.getByRole('button', { name: '1 open question', exact: true });
      await expect(tracker).toBeVisible();
      // A real click must reach the tracker; no forced clicks through the docked composer.
      await tracker.click();
      const questions = page.getByRole('dialog', { name: 'Open questions', exact: true });
      await expect(questions).toContainText(prompt);
      // Loading the transcript must preserve an already-open question list.
      await expect(
        questions.getByRole('button', { name: 'Go to question 1', exact: true }),
      ).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`question-list-${theme}-${width}.png`) });
      await questions.getByRole('button', { name: 'Expand question 1', exact: true }).click();
      await expect(questions.getByText('Answer when ready', { exact: true })).toBeVisible();
      await expect(questions.getByRole('button', { name: 'Collapse question 1' })).toBeVisible();
      await questions
        .getByRole('button', { name: 'Read and answer question 1', exact: true })
        .click();
      const dialog = page.getByRole('dialog', { name: /^.+ asked a question$/u });
      await expect(dialog).toContainText(prompt);
      await expect(dialog.getByRole('textbox')).toBeVisible();
      const title = dialog.locator('[data-slot="pending-interaction-title"]');
      expect(await title.evaluate((node) => node.scrollHeight <= node.clientHeight + 1)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`question-answer-${theme}-${width}.png`) });
      if (width === 1280) {
        await expect(dialog.getByRole('textbox')).toHaveValue('');
        await expect(dialog.getByRole('button', { name: 'Send response' })).toBeDisabled();
        await dialog.getByRole('textbox').fill(draft);
      } else {
        await expect(dialog.getByRole('textbox')).toHaveValue(draft);
      }
      await expect(dialog.getByRole('button', { name: 'Send response' })).toBeEnabled();
      // Inspecting or drafting an answer never resolves the question.
      await dialog.getByRole('button', { name: 'Close', exact: true }).click();
      await tracker.click();
      await questions.getByRole('button', { name: 'Go to question 1', exact: true }).click();
      await expect(page).toHaveURL(/#message-msg_stream\/activity-tool_fixture_question$/);
      const summary = page.locator('#question-tool_fixture_question');
      await expect(summary).toBeVisible();
      await expect(summary).toBeFocused();
      const geometry = await summary.evaluate((node) => {
        const style = getComputedStyle(node);
        return {
          paddingTop: Number.parseFloat(style.paddingTop),
          paddingBottom: Number.parseFloat(style.paddingBottom),
          lineHeight: Number.parseFloat(style.lineHeight),
          fontSize: Number.parseFloat(style.fontSize),
          overflow: node.scrollWidth > node.clientWidth,
        };
      });
      expect(geometry.paddingTop).toBeGreaterThanOrEqual(10);
      expect(geometry.paddingBottom).toBeGreaterThanOrEqual(10);
      expect(geometry.lineHeight / geometry.fontSize).toBeGreaterThanOrEqual(1.4);
      expect(geometry.overflow).toBe(false);
      await page.screenshot({ path: testInfo.outputPath(`question-${theme}-${width}.png`) });
      await summary.click();
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(tracker).toBeVisible();
    }
    expect(submittedAnswers).toEqual([]);
  });
}
