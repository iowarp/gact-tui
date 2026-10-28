import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';
import { workflowExportHtml } from './workflow-export-fixture.mjs';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('an exported workflow run draws its railroad offline, a fork beside its step, each step opening its conversation', async ({
  page,
}) => {
  const file = test.info().outputPath('workflow-export.html');
  writeFileSync(file, workflowExportHtml(webRoot));
  const self = pathToFileURL(file).href;
  // A reader without CLIO: everything except the file itself is blocked.
  const blocked: string[] = [];
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url === self || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    blocked.push(url);
    return route.abort();
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(self);

  const card = page.locator('[data-slot="flow-run-card"]');
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card).toContainText('3 steps, 3 done');
  // The railroad as drawn live: each node a selectable mark named by its state.
  const step = card.locator('[data-key="draft"]');
  const fork = card.locator('[data-key="draft~1"]');
  await expect(step).toBeVisible({ timeout: 30_000 });
  await expect(fork).toHaveAttribute('aria-label', /fork of draft/u);
  // The fork runs beside its step: the same column of the track, on its own line.
  const stepBox = (await step.boundingBox())!;
  const forkBox = (await fork.boundingBox())!;
  const center = (box: { x: number; width: number }) => box.x + box.width / 2;
  expect(Math.abs(center(forkBox) - center(stepBox))).toBeLessThan(stepBox.width);
  expect(forkBox.y).toBeGreaterThan(stepBox.y + stepBox.height / 2);

  // A step opens its details, and from there its conversation in the archive.
  await step.click();
  const details = card.getByRole('region', { name: 'draft: Completed' });
  await expect(details).toContainText('Draft the summary.');
  await details.getByRole('button', { name: 'Open draft' }).click();
  await expect(page).toHaveURL(/#sess_draft$/u);
  const conversation = page.locator('[data-archive-session="sess_draft"]');
  await expect(conversation).toBeInViewport();
  await expect(conversation).toContainText('The draft summary of the run.');

  expect(blocked).toEqual([]);
  expect(errors).toEqual([]);
});
