import { expect, test } from '@playwright/test';
import {
  hideWorkbenchList,
  setupWorkspaceBrowser,
  showWorkbenchList,
  workspaceUrl,
} from './workspace-setup';

setupWorkspaceBrowser();

test('remembers the resized list width and gives it back to the tabs when hidden', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(workspaceUrl);
  await showWorkbenchList(page, 'Files');
  const canvas = page.getByRole('complementary', { name: 'Workspace canvas', exact: true });
  const tabs = canvas.locator(':scope > [data-slot="tabs"]');
  const list = page.getByRole('region', { name: 'Files list', exact: true });
  const resize = page.getByRole('separator', { name: 'Resize Files list', exact: true });
  const storedShares = () =>
    page.evaluate(() => window.localStorage.getItem('clio.workbench-list-share.v1'));
  // Loading and opening never record a width; only the user's resize does.
  expect(await storedShares()).toBeNull();
  const panelWidth = (await canvas.boundingBox())!.width;
  const originalWidth = (await list.boundingBox())!.width;
  expect(originalWidth / panelWidth).toBeCloseTo(0.36, 1);

  // The handle shows only on hover or focus; a drag to the left widens the list.
  const handle = (await resize.boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 200);
  await page.mouse.down();
  await page.mouse.move(handle.x - 60, handle.y + 200, { steps: 10 });
  await page.mouse.up();
  await expect
    .poll(async () => (await list.boundingBox())!.width)
    .toBeGreaterThan(originalWidth + 50);
  const resizedWidth = (await list.boundingBox())!.width;
  const stored = JSON.parse((await storedShares())!) as { list: number };
  expect(stored.list).toBeCloseTo(resizedWidth / panelWidth, 2);
  await page.screenshot({ path: testInfo.outputPath('list-resized.png') });

  // Arrow keys on the focused handle resize too; left widens, released keys store.
  await resize.focus();
  await page.keyboard.press('ArrowLeft');
  await expect
    .poll(async () => (await list.boundingBox())!.width)
    .toBeGreaterThan(resizedWidth + 8);
  const keyedWidth = (await list.boundingBox())!.width;
  const keyed = JSON.parse((await storedShares())!) as { list: number };
  expect(keyed.list).toBeCloseTo(keyedWidth / panelWidth, 2);

  // Hiding the list hands its width to the tabs; showing it again restores the width.
  const tabsBeside = (await tabs.boundingBox())!.width;
  await hideWorkbenchList(page);
  await expect(list).toBeHidden();
  await expect
    .poll(async () => (await tabs.boundingBox())!.width)
    .toBeGreaterThanOrEqual(tabsBeside + keyedWidth - 1);
  await showWorkbenchList(page, 'Files');
  await expect
    .poll(async () => Math.abs((await list.boundingBox())!.width - keyedWidth))
    .toBeLessThanOrEqual(1);
  await page.reload();
  await showWorkbenchList(page, 'Files');
  await expect
    .poll(async () => Math.abs((await list.boundingBox())!.width - keyedWidth))
    .toBeLessThanOrEqual(1);
});

for (const width of [1100, 1600]) {
  test(`remembers the resized canvas width after closing and reopening at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(workspaceUrl);
    await expect(
      page.getByText('Review the EarthScope station evidence and keep provenance visible.', {
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Open workspace canvas', exact: true }).click();
    const canvas = page.getByRole('complementary', { name: 'Workspace canvas', exact: true });
    const resize = page.getByRole('separator', { name: 'Resize workspace canvas', exact: true });
    await expect(canvas).toBeVisible();
    // Loading and opening never record a width; only the user's resize does.
    const storedShare = () =>
      page.evaluate(() => window.localStorage.getItem('clio.workbench-share.v1'));
    expect(await storedShare()).toBeNull();
    const originalWidth = (await canvas.boundingBox())!.width;
    const handle = (await resize.boundingBox())!;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + 100);
    await page.mouse.down();
    await page.mouse.move(handle.x - 100, handle.y + 100, { steps: 10 });
    await page.mouse.up();
    await expect
      .poll(async () => (await canvas.boundingBox())!.width)
      .toBeGreaterThan(originalWidth + 80);
    const resizedWidth = (await canvas.boundingBox())!.width;
    expect(Number(await storedShare())).toBeCloseTo(resizedWidth / width, 2);
    const restoredWidths: Partial<Record<'button' | 'shortcut', number>> = {};
    await page.screenshot({ path: testInfo.outputPath('canvas-resized.png') });

    for (const method of ['button', 'shortcut'] as const) {
      if (method === 'button') {
        await page.getByRole('button', { name: 'Close workspace canvas', exact: true }).click();
      } else {
        await page.keyboard.press('ControlOrMeta+Shift+B');
      }
      await expect(
        page.getByRole('button', { name: 'Open workspace canvas', exact: true }),
      ).toBeVisible();
      await expect(canvas).toBeHidden();
      if (method === 'button') {
        await page.getByRole('button', { name: 'Open workspace canvas', exact: true }).click();
      } else {
        await page.keyboard.press('ControlOrMeta+Shift+B');
      }
      await expect(canvas).toBeVisible();
      await expect
        .poll(async () => Math.abs((await canvas.boundingBox())!.width - resizedWidth))
        .toBeLessThanOrEqual(1);
      restoredWidths[method] = (await canvas.boundingBox())!.width;
    }
    await testInfo.attach('Canvas widths', {
      body: JSON.stringify({ originalWidth, resizedWidth, restoredWidths }),
      contentType: 'application/json',
    });
    await page.screenshot({ path: testInfo.outputPath('canvas-reopened.png') });
  });
}
