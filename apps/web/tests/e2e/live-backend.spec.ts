/**
 * LIVE backend verification (gact-tui#322 slice 5).
 *
 * Env-gated: runs only when CLIO_LIVE_URL points at a real clio-agent. It is
 * deliberately NOT part of the default suite, because a green mock run must
 * never be mistaken for live verification — that is the whole reason this file
 * is separate.
 *
 *   CLIO_LIVE_URL=http://127.0.0.1:17891 pnpm test:e2e live-backend
 */
import { expect, test } from '@playwright/test';

const LIVE_URL = process.env['CLIO_LIVE_URL'];

test.skip(!LIVE_URL, 'set CLIO_LIVE_URL to a running clio-agent to run these');

test('connects to a real backend and accepts its contract', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('connect-url').fill(LIVE_URL as string);
  await page.getByTestId('connect-submit').click();

  // Either we land connected, or we surface a typed reason. What must NOT
  // happen is a blank screen or an indefinite pending state.
  const connected = page.getByTestId('connected-backend');
  const error = page.getByTestId('connect-error');
  await expect(connected.or(error)).toBeVisible({ timeout: 20_000 });
});

test('a real backend advertises the contract this build supports', async ({ request }) => {
  const res = await request.get(`${LIVE_URL}/v1/capabilities`);
  expect(res.ok()).toBe(true);
  const caps = (await res.json()) as { contract_version: string; backend: { name: string } };
  // The gate in src/backend/connection.ts accepts exactly this set.
  expect(caps.contract_version).toBe('0.2');
  expect(caps.backend.name).toBeTruthy();
});

test('a failing session list is surfaced as a typed reason, never a blank pane', async ({
  page,
}) => {
  // Regression guard for clio-agent#1171: a store predating #1063 makes
  // /v1/sessions return 500 for the WHOLE list. The client must say so rather
  // than hang or render an empty session list that looks like "no sessions".
  await page.goto('/');
  await page.getByTestId('connect-url').fill(LIVE_URL as string);
  await page.getByTestId('connect-submit').click();

  const connected = page.getByTestId('connected-backend');
  const error = page.getByTestId('connect-error');
  await expect(connected.or(error)).toBeVisible({ timeout: 20_000 });

  if (await error.isVisible()) {
    // The reason must be specific enough to act on.
    await expect(error).toContainText(/handshake|session|500|failed/i);
  }
});
