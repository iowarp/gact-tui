import { expect, test } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Real CLIO and real recorded model responses; no route interception or injected transcript. */
test('marks a fork checkpoint and links the conversation it came from', async ({ page }) => {
  test.setTimeout(120_000);
  const endpoint = process.env['CLIO_ENDPOINT'] ?? 'http://127.0.0.1:17963';
  const out = process.env['CLIO_CONVERSATION_CAPTURE_DIR'];
  const statePath = process.env['CLIO_CONVERSATION_STATE'];
  expect(out).toBeTruthy();
  expect(statePath).toBeTruthy();
  const state = JSON.parse(await readFile(statePath!, 'utf8')) as {
    workspace: string;
    sessions: Record<string, string>;
    reference_state?: string;
  };
  const reference = state.reference_state
    ? (JSON.parse(await readFile(state.reference_state, 'utf8')) as typeof state)
    : state;
  await mkdir(path.join(out!, 'originals'), { recursive: true });
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 940 });
  await page.addInitScript((endpoint) => {
    localStorage.setItem('clio.recent-connections', JSON.stringify([endpoint]));
    localStorage.setItem('theme', 'light');
  }, endpoint);
  const capture = async (name: string, selector?: string) => {
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 15000 });
    await page.screenshot({ path: path.join(out!, 'originals', `${name}.png`) });
    if (selector) {
      const bounds = await page.locator(selector).boundingBox();
      expect(bounds).toBeTruthy();
      await page.screenshot({
        path: path.join(out!, `${name}.png`),
        clip: {
          x: 0,
          y: 0,
          width: page.viewportSize()!.width,
          height: Math.min(page.viewportSize()!.height, Math.ceil(bounds!.y + bounds!.height + 16)),
        },
      });
    } else
      await page.screenshot({
        path: path.join(out!, `${name}.png`),
        clip: { x: 248, y: 0, width: 1192, height: 840 },
      });
  };
  await page.goto(
    `/workspaces/${reference.workspace}/sessions/${reference.sessions['Offset comparison']}`,
  );
  await expect(page.getByRole('combobox', { name: /^Ask .+ to investigate/ })).toBeVisible();
  const log = page.getByRole('log', { name: 'Conversation' });
  await log.evaluate((element) => element.scrollTo({ top: 0, behavior: 'instant' }));
  const checkpoint = page.getByRole('separator', { name: 'Conversation branched here' });
  await checkpoint.scrollIntoViewIfNeeded();
  await expect(checkpoint).toHaveCount(1);
  await expect(checkpoint).toContainText('History above was copied.');
  await expect(checkpoint.getByRole('link', { name: 'Calibration baseline' })).toHaveAttribute(
    'href',
    /#message-/,
  );
  await page.goto(
    `/workspaces/${reference.workspace}/sessions/${reference.sessions['Offset sensitivity']}`,
  );
  await expect(checkpoint.getByRole('link', { name: 'Offset comparison' })).toBeVisible();
  await checkpoint.scrollIntoViewIfNeeded();
  await page.mouse.move(900, 400);
  await page.mouse.wheel(0, 40);
  await expect(checkpoint).toBeInViewport();
  await capture('docs-fork-checkpoint');
  await page.goto(`/workspaces/${state.workspace}/sessions/${state.sessions['Offset comparison']}`);
  await checkpoint.scrollIntoViewIfNeeded();
  await expect(checkpoint).toHaveCount(1);
  expect(pageErrors).toEqual([]);
  await writeFile(
    path.join(out!, 'browser-verdict.json'),
    JSON.stringify(
      {
        passed: true,
        pageErrors,
        cases: ['reference fork and its source', 'recorded fork'],
      },
      null,
      2,
    ),
  );
});
