import { expect, test } from '@playwright/test';

const fixtureEndpoint = `http://127.0.0.1:${process.env['CLIO_FIXTURE_PORT'] ?? '18799'}`;
const workspaceUrl = '/workspaces/ws_flat_ndp/sessions/sess_flat_ndp';

test.beforeEach(async ({ page }) => {
  expect((await page.request.post(`${fixtureEndpoint}/__test/reset`)).ok()).toBe(true);
  await page.request.post(`${fixtureEndpoint}/__test/branch-navigation`);
  await page.addInitScript((endpoint) => {
    localStorage.setItem('clio.recent-connections', JSON.stringify([endpoint]));
    localStorage.setItem('theme', 'light');
  }, fixtureEndpoint);
});

for (const scenario of [
  { name: 'disabled capture', enabled: false, captured: false },
  { name: 'configured capture without records', enabled: true, captured: false },
  { name: 'recorded attention', enabled: true, captured: true },
]) {
  test(`offers attention controls only with recorded attention: ${scenario.name}`, async ({
    page,
  }, testInfo) => {
    await page.route('**/attention/availability', (route) =>
      route.fulfill({
        json: { enabled: scenario.enabled, messages: { msg_baseline_1: scenario.captured } },
      }),
    );
    const availability = page.waitForResponse((response) =>
      response.url().endsWith('/attention/availability'),
    );
    await page.goto(workspaceUrl);
    await availability;
    // The initial plain paragraph is the lazy Markdown fallback. Select only
    // after its rendered container replaces it, or that replacement clears the range.
    const answer = page
      .locator('#message-msg_baseline_1 [data-slot="message-text"] > div')
      .getByText('Baseline complete.', { exact: true });
    await expect(answer).toBeVisible();
    const actions = page.getByRole('toolbar', { name: 'Selection actions' });
    // Initial query hydration can replace the answer DOM. Re-select until the
    // ordinary toolbar is visible, then inspect its final capability actions.
    await expect
      .poll(async () => {
        await answer.evaluate((element) => {
          const range = document.createRange();
          range.selectNodeContents(element);
          const selection = window.getSelection()!;
          selection.removeAllRanges();
          selection.addRange(range);
          document.dispatchEvent(new Event('selectionchange'));
        });
        return actions.isVisible();
      })
      .toBe(true);
    await expect(actions.getByRole('button', { name: 'Add to chat', exact: true })).toBeVisible();
    await expect(actions.getByRole('button', { name: 'More details', exact: true })).toBeVisible();
    for (const name of ['Add to attention set', 'Trace later use', 'Understand attention']) {
      await expect(actions.getByRole('button', { name, exact: true })).toHaveCount(
        scenario.captured ? 1 : 0,
      );
    }
    // Reply actions are named on hover; reveal them before counting.
    const reply = page.locator('#message-msg_baseline_1');
    await reply.locator('[data-slot="message-completion-footer"]').hover();
    await expect(reply.getByRole('button', { name: 'Copy message', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Select content for attention' })).toHaveCount(
      scenario.captured ? 1 : 0,
    );
    await page.screenshot({ path: testInfo.outputPath('attention-controls.png') });
  });
}
