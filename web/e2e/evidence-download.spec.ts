import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const endpoint = `http://127.0.0.1:${process.env['CLIO_FIXTURE_PORT'] ?? '18799'}`;

test('Download with evidence saves one intact ZIP from the artifact Open menu', async ({
  page,
}, testInfo) => {
  expect((await page.request.post(`${endpoint}/__test/reset`)).ok()).toBe(true);
  await page.addInitScript((value) => {
    localStorage.setItem('clio.recent-connections', JSON.stringify([value]));
    localStorage.setItem('theme', 'light');
  }, endpoint);
  // An empty, valid ZIP: the actual UI/repository/download path is exercised.
  const bytes = Buffer.alloc(22);
  bytes.writeUInt32LE(0x06054b50);
  let exports = 0;
  await page.route('**/v1/artifacts/artifact_plot/export', (route) => {
    exports += 1;
    return route.fulfill({ contentType: 'application/zip', body: bytes });
  });
  await page.goto('/workspaces/ws_flat_ndp/sessions/sess_flat_ndp');
  await page.getByRole('button', { name: 'Open vertical-displacement.png', exact: true }).click();
  const canvas = page.getByRole('complementary', { name: 'Workspace canvas' });
  const download = page.waitForEvent('download');
  await canvas.getByRole('button', { name: 'Open options', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Download with evidence/u }).click();
  const saved = await download;
  expect(saved.suggestedFilename()).toBe('vertical-displacement.png.crate.zip');
  expect(await readFile((await saved.path())!)).toEqual(bytes);
  expect(exports).toBe(1);
  await page.screenshot({ path: testInfo.outputPath('evidence-zip-download.png') });
});
