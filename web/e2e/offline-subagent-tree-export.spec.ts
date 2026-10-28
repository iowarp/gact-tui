import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { subagentTreeExportHtml } from './subagent-tree-export-fixture.mjs';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function openOffline(page: Page) {
  const file = test.info().outputPath('subagent-tree-export.html');
  writeFileSync(file, subagentTreeExportHtml(webRoot));
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
  return { blocked, errors };
}

const section = (page: Page, id: string) => page.locator(`[data-archive-session="${id}"]`);

test('an exported subagent tree reaches every descendant from its spawn and back, with its agent, model, assignment and result', async ({
  page,
}) => {
  const { blocked, errors } = await openOffline(page);
  await expect(section(page, 'sess_root')).toBeVisible({ timeout: 30_000 });
  // Each child reads after the session that started it; the fork under level 1, which made it.
  const order = await page
    .locator('[data-archive-session]')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-archive-session')));
  expect(order).toEqual(['sess_root', 'sess_l1', 'sess_fork', 'sess_explore']);

  const edges = [
    {
      parent: 'sess_root',
      child: 'sess_l1',
      link: 'Open level 1',
      origin: 'Delegated by Subagent tree',
      agent: 'standard',
      model: 'local / model-b (named for this call)',
      asked: 'You are level 1.',
      result: 'Level 1 is done.',
    },
    {
      parent: 'sess_l1',
      child: 'sess_fork',
      link: 'Open level 1~1',
      origin: 'Forked from level 1',
      agent: 'standard',
      model: 'local / model-b',
      asked: 'Reply with the words fork of level 1.',
      result: 'fork of level 1',
    },
    {
      parent: 'sess_l1',
      child: 'sess_explore',
      link: 'Open explore root',
      origin: 'Delegated by level 1',
      agent: 'explore',
      model: 'local / model-b (the caller’s model)',
      asked: 'List the workspace root.',
      result: 'readme.txt',
    },
  ];
  for (const edge of edges) {
    const parent = section(page, edge.parent);
    const activity = parent.getByRole('button', { name: /^Activity:/ }).first();
    if ((await activity.getAttribute('aria-expanded')) !== 'true') await activity.click();
    await parent.getByRole('button', { name: edge.link }).click();
    await expect(page).toHaveURL(new RegExp(`#${edge.child}$`, 'u'));
    const child = section(page, edge.child);
    await expect(child).toBeInViewport();
    const header = child.locator('[data-slot="archive-session-origin"]');
    await expect(header).toContainText(edge.origin);
    await expect(header).toContainText(edge.agent);
    await expect(header).toContainText(edge.model);
    await expect(header).toContainText(edge.asked);
    await expect(header).toContainText(edge.result);
    await expect(header).toContainText('Completed');
    // Back to the call that started it, in the parent's transcript.
    await header.getByRole('button').first().click();
    await expect(page).toHaveURL(new RegExp(`#message-m_${edge.parent}/`, 'u'));
    await expect(parent.locator(`[id="message-m_${edge.parent}"]`)).toBeInViewport();
  }

  expect(blocked).toEqual([]);
  expect(errors).toEqual([]);
});
