import { expect, test } from '@playwright/test';

const endpoint = `http://127.0.0.1:${process.env['CLIO_FIXTURE_PORT'] ?? '18799'}`;
const prompt =
  'What do the treatment labels represent, and which units should be used? Until confirmed, I will compare the recorded categories without assigning a numeric dose.';

test.afterEach(async ({ page }) => {
  // Finish polling response handlers before Playwright disposes their request context.
  await page.unrouteAll({ behavior: 'wait' });
});

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}: an open question is asked once, above the composer that answers it`, async ({
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
    const dock = page.getByRole('region', { name: 'Agent needs your attention', exact: true });
    const composer = page.getByRole('combobox', { name: /^Ask / });
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      // One ask card above the composer; no floating question pill.
      await expect(page.getByRole('button', { name: /open questions?$/u })).toHaveCount(0);
      const card = dock.locator('[data-slot="ask-card"]:visible');
      await expect(card).toContainText(prompt);
      const title = card.locator('[data-slot="pending-interaction-title"]');
      expect(await title.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      // A written answer goes in the composer; the card keeps no second field.
      await expect(card.getByRole('textbox')).toHaveCount(0);
      if (width === 1280) {
        await expect(composer).toHaveText('');
        await card.getByRole('button', { name: 'Type your answer below' }).click();
        await expect(composer).toBeFocused();
        await composer.fill(draft);
      }
      await expect(card.getByText('Type your answer in the message box below')).toBeVisible();
      await expect(composer).toHaveText(draft);
      await page.screenshot({ path: testInfo.outputPath(`question-answer-${theme}-${width}.png`) });
      // The transcript keeps only the activity row, which leads to the card.
      const activity = page.getByRole('button', { name: `Answer below: ${prompt}`, exact: true });
      await activity.scrollIntoViewIfNeeded();
      await expect(activity).toBeVisible();
      await expect(page.locator('[data-inline-question]')).toHaveCount(0);
      await activity.click();
      await expect(card).toBeInViewport();
      await expect(composer).toHaveText(draft);
    }
    expect(submittedAnswers).toEqual([]);
  });
}
