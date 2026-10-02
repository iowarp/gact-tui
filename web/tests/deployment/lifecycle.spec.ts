import { expect, test } from '@playwright/test';

for (const width of [1280, 390]) {
  test(`deployment lifecycle and existing-agent choices at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/tests/deployment/preview.html');
    await page.getByText('Remote host', { exact: true }).click();
    await page.getByRole('combobox', { name: 'Saved SSH host' }).click();
    await page.getByRole('option', { name: /HPC/ }).click();
    await expect(
      page.getByRole('checkbox', { name: /Keep this remote agent running/ }),
    ).not.toBeChecked();
    await expect(page.getByText(/will stop gracefully on exit/)).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('lifecycle.png'), fullPage: true });
    await page.getByRole('button', { name: 'Deploy and connect' }).click();
    await expect(page.getByRole('button', { name: 'Reconnect and update' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Leave it running and start another' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible();
    const dialog = page.getByRole('dialog');
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    await dialog.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await page.screenshot({ path: testInfo.outputPath('existing-agent.png'), fullPage: true });
  });
}
