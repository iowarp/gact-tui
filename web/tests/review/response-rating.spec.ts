import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const service = 'http://127.0.0.1:18817';
const evidence = process.env['CLIO_REVIEW_EVIDENCE'];
if (!evidence) throw new Error('Set CLIO_REVIEW_EVIDENCE to the bounded C: capture directory.');

test.beforeEach(async ({ page }) => {
  await page.addInitScript((endpoint) => {
    localStorage.setItem('clio.recent-connections', JSON.stringify([{ endpoint }]));
  }, service);
});

test('rates a real response, reloads from clio-core, changes and removes it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 900, height: 450 });
  await page.goto('/tests/review/response-rating.html?theme=dark');
  await expect(page.getByText('Six times seven is 42.', { exact: true })).toBeVisible();
  const { session_id } = await (await page.request.get(`${service}/__test/session`)).json();
  const feedbackUrl = `${service}/v1/sessions/${session_id}/messages/answer/feedback`;
  const historyUrl = `${service}/v1/sessions/${session_id}/response-feedback`;
  await expect(page.getByRole('button', { name: 'Rate response', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Rate response', exact: true }).click();
  await expect(page.getByRole('menuitemradio', { name: 'Good response' })).toBeVisible();
  await page.screenshot({ path: `${evidence}/rating-menu-dark.png`, animations: 'disabled' });
  await page.getByRole('menuitemradio', { name: 'Good response' }).click();
  await expect(page.getByRole('button', { name: 'Rated good response' })).toBeEnabled();
  const good = (await (await page.request.get(feedbackUrl)).json()).feedback;
  expect(good.rating).toBe('good');
  expect(good.prompt_text).toBe('What is six times seven?');
  expect(good.response_text).toBe('Six times seven is 42.');
  // Reconstruct the server's ARC ledger and clear the browser's query cache by reloading.
  expect((await page.request.post(`${service}/__test/reopen-ledger`)).ok()).toBe(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Rated good response' })).toBeEnabled();
  await page.getByRole('button', { name: 'Rated good response' }).click();
  await expect(page.getByRole('menuitemradio', { name: 'Good response' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.screenshot({ path: `${evidence}/rating-saved-dark.png`, animations: 'disabled' });
  await page.getByRole('menuitemradio', { name: 'Bad response' }).click();
  await expect(page.getByRole('button', { name: 'Rated bad response' })).toBeEnabled();
  await page.goto('/tests/review/response-rating.html?theme=light');
  await expect(page.getByRole('button', { name: 'Rated bad response' })).toBeEnabled();
  await page.getByRole('button', { name: 'Rated bad response' }).click();
  await page.screenshot({ path: `${evidence}/rating-saved-light.png`, animations: 'disabled' });
  await page.getByRole('menuitem', { name: 'Remove rating' }).click();
  await expect(page.getByRole('button', { name: 'Rate response', exact: true })).toBeEnabled();
  const items = (await (await page.request.get(historyUrl)).json()).items;
  const changes = items.slice(-3);
  expect(changes.map((row: { rating: string | null }) => row.rating)).toEqual(['good', 'bad', null]);
  expect(changes[1].previous_feedback_id).toBe(changes[0].feedback_id);
  expect(changes[2].previous_feedback_id).toBe(changes[1].feedback_id);
  await writeFile(`${evidence}/clio-core-feedback-history.json`, JSON.stringify(items, null, 2));
  expect(errors).toEqual([]);
});
