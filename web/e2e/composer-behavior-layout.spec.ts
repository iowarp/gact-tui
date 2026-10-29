import { expect, test } from '@playwright/test';
import { setupWorkspaceBrowser } from './workspace-setup';

setupWorkspaceBrowser();

for (const width of [320, 390, 1280]) {
  test(`behavior menu descriptions fit without clipping at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => {
      localStorage.setItem(
        'clio.appearance.v1',
        JSON.stringify({ theme: 'light', motion: 'reduced' }),
      );
    });
    await page.route('**/v1/spotter/availability*', (route) =>
      route.fulfill({
        json: {
          available: false,
          reason: 'spotter_watcher_provenance_unavailable',
          message: 'The review journal is not configured.',
          remedy:
            'enable the native journal and configure provenance.agentic.providers before using SPOTTER review',
        },
      }),
    );
    await page.goto('/workspaces/ws_flat_ndp/new');

    for (const name of ['Confirmation policy: Ask first', 'Execution mode: Execute']) {
      await page.getByRole('button', { name, exact: true }).click();
      const menu = page.getByRole('menu');
      await expect(menu).toBeVisible();
      if (name.startsWith('Confirmation')) {
        await expect(menu.getByRole('menuitemradio', { name: /SPOTTER review/ })).toBeDisabled();
        await expect(menu.getByText('Not available here.', { exact: true })).toBeVisible();
      }
      await page.evaluate(() => document.fonts.ready);
      const clipped = await menu.getByRole('menuitemradio').evaluateAll((rows) =>
        rows.flatMap((row) => {
          const bounds = row.getBoundingClientRect();
          const text = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
          const failures: string[] = [];
          while (text.nextNode()) {
            if (!text.currentNode.textContent?.trim()) continue;
            const range = document.createRange();
            range.selectNodeContents(text.currentNode);
            if (
              [...range.getClientRects()].some(
                (rect) =>
                  rect.right > bounds.right - 24 ||
                  rect.left < bounds.left ||
                  rect.bottom > bounds.bottom + 1,
              )
            ) {
              failures.push(text.currentNode.textContent);
            }
          }
          return failures;
        }),
      );
      expect(clipped).toEqual([]);
      const bounds = (await menu.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      await menu.screenshot({
        path: testInfo.outputPath(
          `${name.startsWith('Confirmation') ? 'confirmations' : 'execution'}-${width}.png`,
        ),
      });
      await page.keyboard.press('Escape');
    }
    await page.getByRole('button', { name: 'Confirmation policy: Ask first', exact: true }).click();
    await page.getByRole('menuitemradio', { name: /^Workspace edits/ }).click();
    await expect(
      page.getByRole('button', { name: 'Confirmation policy: Workspace edits', exact: true }),
    ).toBeVisible();
  });
}
