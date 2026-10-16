import { expect, test } from '@playwright/test';

test('goal judging has its own visible shimmer and clears when work resumes', async ({ page }) => {
  await page.goto('/tests/review/model-wait.html');
  await page.getByRole('button', { name: 'judging', exact: true }).click();
  const feedback = page.locator('[data-slot="goal-check-feedback"]');
  await expect(feedback).toContainText('Checking goal completion');
  await expect(feedback).toContainText(/\d+s/u);
  await page.screenshot({ path: test.info().outputPath('goal-judging.png') });
  await page.getByRole('button', { name: 'tool', exact: true }).click();
  await expect(feedback).toHaveCount(0);
});

test('large model catalogs paint providers before preparing models and reopen cached', async ({ page }) => {
  await page.goto('/tests/review/model-picker-loading.html');
  await page.getByRole('button', { name: 'Choose a model', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Search providers and models' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Model 0000 128K', exact: true })).toBeVisible();
  const observations = page.locator('#timing-receipt');
  const receipt = JSON.parse((await observations.textContent()) ?? '[]');
  const first = receipt.find((row: {event: string}) => row.event === 'skeleton-commit');
  expect(first).toMatchObject({ providerVisible: true, searchVisible: true });
  expect(receipt.some((row: {event: string; skeletonVisible?: boolean}) => row.event === 'first-frame' && row.skeletonVisible)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('picker-loaded.png') });
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Choose a model', exact: true }).click();
  await expect(page.getByRole('option', { name: 'Model 0000 128K', exact: true })).toBeVisible();
  expect(JSON.parse((await observations.textContent()) ?? '[]').some((row: {event: string}) => row.event === 'skeleton-commit')).toBe(false);
});

test('offline WebGL and OrbitControls render, react, stop and restart', async ({ page }) => {
  const errors: string[] = [];
  const external: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.url().startsWith('https://')) external.push(request.url());
  });
  await page.goto('/tests/review/webgl-preview.html');
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#result')).toContainText('WebGL running');
  await frame.getByLabel('Wave height').fill('1.6');
  await expect(frame.locator('#result')).toContainText('height 1.6');
  const pixels = await frame
    .locator('canvas')
    .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  expect(pixels.length).toBeGreaterThan(10_000);
  await page.screenshot({ path: test.info().outputPath('webgl-running.png') });
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.locator('iframe')).toHaveCount(0);
  await page.getByRole('button', { name: 'Restart' }).click();
  await expect(frame.locator('#result')).toContainText('height 0.8');
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('the Desktop frame runs under the actual main-page CSP without relaxing scripts', async ({
  page,
}) => {
  await page.goto('/tests/review/webgl-preview.html?desktop-policy');
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#result')).toContainText('WebGL running');
  await expect(page.locator('iframe')).toHaveAttribute(
    'src',
    'http://127.0.0.1:8198/v1/html-renderer',
  );
  const policy = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content');
  expect(policy).toContain("script-src 'self'");
  expect(policy).not.toContain("script-src 'self' 'unsafe-inline'");
  const isolated = await frame.locator('body').evaluate(() => {
    try {
      void window.parent.document;
      return false;
    } catch {
      return true;
    }
  });
  expect(isolated).toBe(true);
  await page.screenshot({ path: test.info().outputPath('webgl-desktop-policy.png') });
});
