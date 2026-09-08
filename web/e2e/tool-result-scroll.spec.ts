import { expect, test, type Page } from '@playwright/test';

const endpoint = `http://127.0.0.1:${process.env['CLIO_FIXTURE_PORT'] ?? '18799'}`;
const session = 'sess_flat_ndp';

async function openFixture(page: Page, type?: string) {
  await page.request.post(`${endpoint}/__test/reset`);
  await page.addInitScript((address) => {
    localStorage.setItem('clio.recent-connections', JSON.stringify([address]));
  }, endpoint);
  await page.route(`**/v1/sessions/${session}/messages`, async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    const todos = Array.from({ length: 4 }, (_, i) => ({
      content: `Task ${i}: ${'Long readable evidence '.repeat(12)}`,
      status: 'pending',
    }));
    data.tools[0].input = type === 'short' ? { value: 'x' } : { todos };
    data.tools[0].output =
      type === 'short'
        ? { value: 'y' }
        : {
            todos,
            observations: Array.from({ length: 50 }, (_, i) => `Row ${i}`),
          };
    data.tools[0].presentation =
      type && type !== 'short'
        ? {
            summary: '',
            blocks: [
              {
                id: 'body',
                type,
                text: Array.from(
                  { length: 100 },
                  (_, i) => `line-${i} ${'wide-output-'.repeat(40)}`,
                ).join('\n'),
              },
            ],
          }
        : undefined;
    await route.fulfill({ response, json: data });
  });
  await page.goto(`/workspaces/ws_flat_ndp/sessions/${session}`);
  const responses = page.getByRole('button', { name: '2 responses needed', exact: true });
  await expect(responses).toHaveCount(1);
  await responses.click();
  await page.getByRole('radio', { name: 'Full activity view', exact: true }).click();
}

test('short technical results fit their content instead of padding to the viewport limit', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1003, height: 1037 });
  await openFixture(page, 'short');
  await page
    .getByRole('button', { name: 'Technical details for Search EarthScope catalog' })
    .click();
  const body = page.getByRole('region', { name: 'Scrollable result content' });
  await expect.poll(() => body.evaluate((e) => e.clientHeight)).toBeLessThan(400);
  await expect
    .poll(() => body.evaluate((e) => Math.abs(e.scrollHeight - e.clientHeight)))
    .toBeLessThan(2);
});

for (const size of [
  { width: 1003, height: 1037 },
  { width: 640, height: 480 },
]) {
  test(`technical details are reachable without compressed sections at ${size.width}x${size.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await openFixture(page);
    await page
      .getByRole('button', { name: 'Technical details for Search EarthScope catalog' })
      .click();
    const dialog = page.getByRole('dialog');
    const body = dialog.getByRole('region', { name: 'Scrollable result content' });
    await expect(body).toBeVisible();
    const input = dialog.getByRole('heading', { name: 'Arguments' }).locator('..');
    await expect.poll(() => input.evaluate((e) => e.clientHeight >= e.scrollHeight)).toBe(true);
    await expect.poll(() => body.evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(true);
    await body.focus();
    await page.keyboard.press('Control+End');
    await expect.poll(() => body.evaluate((e) => e.scrollTop)).toBeGreaterThan(0);
    await expect(dialog.getByRole('heading', { name: 'Result' })).toBeAttached();
    await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeInViewport();
    await expect
      .poll(() => dialog.evaluate((e) => e.getBoundingClientRect().bottom <= innerHeight))
      .toBe(true);
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('button', { name: 'Technical details for Search EarthScope catalog' }),
    ).toBeFocused();
  });
}

for (const type of ['text', 'markdown', 'code', 'diff', 'terminal']) {
  test(`full ${type} results scroll to their actual end`, async ({ page }) => {
    await page.setViewportSize({ width: 1003, height: 1037 });
    await openFixture(page, type);
    const activity = page.locator('[data-slot="tool-activity"]').first();
    await activity.getByRole('button', { name: 'Show more', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const body = dialog.getByRole('region', { name: 'Scrollable result content' });
    await expect(body).toBeVisible();
    await body.focus();
    await page.keyboard.press('Control+End');
    await expect
      .poll(() => body.evaluate((e) => e.scrollHeight - e.scrollTop - e.clientHeight))
      .toBeLessThan(2);
    await expect(body).toContainText('line-99');
    if (type === 'code' || type === 'diff') {
      const code = dialog.locator('[data-slot="code-block-scroll"]');
      await expect.poll(() => code.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(true);
      await code.focus();
      await page.keyboard.press('ArrowRight');
      await expect.poll(() => code.evaluate((e) => e.scrollLeft)).toBeGreaterThan(0);
    }
    await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeInViewport();
  });
}
