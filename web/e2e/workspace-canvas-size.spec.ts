import { expect, test } from '@playwright/test';
import { setupWorkspaceBrowser, workspaceUrl } from './workspace-setup';

setupWorkspaceBrowser();

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
