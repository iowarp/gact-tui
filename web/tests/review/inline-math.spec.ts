import { expect, test } from '@playwright/test';

test('inline and display math render across real transcript, file and artifact views', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/tests/review/inline-math.html');
  for (const name of ['Transcript', 'File', 'Artifact']) {
    const region = page.getByRole('region', { name, exact: true });
    await expect(region.locator('.katex')).toHaveCount(7);
    await expect(region.locator('h1 .katex')).toHaveCount(1);
    await expect(region.locator('.katex-display')).toHaveCount(1);
    await expect(region.locator('.katex-error')).toHaveCount(0);
    await expect(region).toContainText('Currency stays text: $20 and $30, or $20–$30.');
    await expect(region.locator('code').filter({ hasText: '$n$' })).toHaveCount(1);
  }
  await page.screenshot({ path: test.info().outputPath('inline-math-three-views.png') });
  const file = page.getByRole('region', { name: 'File', exact: true });
  await file.getByRole('tab', { name: 'Source', exact: true }).click();
  await expect(file.getByRole('tabpanel', { name: 'Source', exact: true })).toContainText(
    String.raw`$\sigma_{\infty}(n)$`,
  );
  await file.getByRole('tab', { name: 'Preview', exact: true }).click();
  await expect(file.locator('.katex')).toHaveCount(7);
  const artifact = page.getByRole('region', { name: 'Artifact', exact: true });
  await artifact.getByRole('tab', { name: 'Read raw', exact: true }).click();
  await expect(artifact).toContainText(String.raw`$\sigma_{\infty}(n)$`);
  await artifact.getByRole('tab', { name: 'Read document', exact: true }).click();
  await expect(artifact.locator('.katex')).toHaveCount(7);
  expect(errors).toEqual([]);
});
