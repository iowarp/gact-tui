import { expect, test } from '@playwright/test';

for (const width of [1280, 390]) {
  test(`folder permission is readable and actionable at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/tests/review/folder-access.html');
    await expect(
      page.getByText('Move the measurements you selected into the results folder.', {
        exact: true,
      }),
    ).toBeInViewport();
    // Runs on has a wide and a narrow layout; the container query shows one of them.
    await expect(
      page.getByText('Research PC', { exact: true }).filter({ visible: true }),
    ).toBeInViewport();
    // Wide windows list each folder; a fifth of the window summarises them (spec), with
    // the paths kept in the row's title.
    if (width > 768) {
      await expect(page.getByText('C:\\Users\\Alice\\Downloads', { exact: true })).toBeVisible();
    } else {
      const folders = page.getByText('writes to 2 folders', { exact: true });
      await expect(folders).toBeVisible();
      await expect(
        page.locator('[title*="C:\\\\Users\\\\Alice\\\\Downloads"]').first(),
      ).toBeAttached();
    }
    await expect(page.getByText(/including after restart/).filter({ visible: true })).toBeVisible();
    const allow = page.getByRole('button', { name: 'Allow for this workspace' });
    const deny = page.getByRole('button', { name: 'Deny', exact: true });
    await expect(allow).toBeInViewport();
    await expect(deny).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: testInfo.outputPath(`folder-permission-${width}.png`),
      fullPage: true,
    });
    await allow.click();
    await expect(page.getByRole('status')).toHaveText(
      'Folder permission saved. The original operation can continue.',
    );
    await expect(allow).toHaveCount(0);
    await page.reload();
    await deny.click();
    await expect(page.getByRole('status')).toHaveText(
      'Folder access declined. The agent can choose another approach.',
    );
    await expect(deny).toHaveCount(0);
  });
}
