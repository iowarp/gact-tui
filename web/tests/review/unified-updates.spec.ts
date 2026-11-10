import { expect, test } from '@playwright/test';
test('one product action installs and verifies the same app and runtime target', async ({
  page,
}) => {
  await page.goto('/tests/review/unified-updates.html');
  await page.getByRole('button', { name: 'Check for updates', exact: true }).click();
  const update = page.getByRole('button', { name: /^Update / });
  await expect(update).toHaveCount(1);
  await update.click();
  await expect(page).toHaveURL(/view=complete/);
  await expect(page.getByTestId('recovery-state')).toHaveText('Recovery: done');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});
test('a reachable older runtime is a failed update after restart', async ({ page }) => {
  await page.goto('/tests/review/unified-updates.html?view=recovery');
  await expect(page.getByRole('alertdialog')).toContainText('Update did not finish');
  await expect(page.getByRole('alertdialog')).toContainText(
    'runtime is 0.9.5-beta.7.1, expected 0.9.5-beta.7.2',
  );
  await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});
