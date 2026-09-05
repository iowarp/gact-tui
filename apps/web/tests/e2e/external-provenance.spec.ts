import { expect, test } from '@playwright/test';
import { connectMockBackend } from './mock-backend';

async function openSession(page: import('@playwright/test').Page): Promise<void> {
  await connectMockBackend(page);
  await page.getByRole('button', { name: 'Boot smoke session', exact: true }).click();
  await expect(page.getByTestId('part-tool').first()).toBeVisible();
}

test('external input source and incomplete warning survive browser reload', async ({ page }) => {
  test.setTimeout(60_000);
  await openSession(page);

  const stage = page.getByTestId('part-tool').filter({ hasText: 'stage_resource' });
  await stage.getByRole('button').first().click();
  await expect(stage.getByTestId('part-tool-input-sources')).toContainText(
    'earthscope_stations.csv',
  );
  await expect(stage.getByTestId('part-tool-input-sources')).toContainText(
    'D:/external/earthscope_stations.csv',
  );

  const unknown = page.getByTestId('part-tool').filter({ hasText: 'unknown_reader' });
  await unknown.getByRole('button').first().click();
  await expect(unknown.getByTestId('part-tool-provenance-incomplete')).toContainText(
    'provenance incomplete',
  );

  await page.reload();
  await page.getByRole('button', { name: 'Boot smoke session', exact: true }).click();
  const reloadedStage = page.getByTestId('part-tool').filter({ hasText: 'stage_resource' });
  await reloadedStage.getByRole('button').first().click();
  await expect(reloadedStage.getByTestId('part-tool-input-sources')).toContainText(
    'earthscope_stations.csv',
  );
  const reloadedUnknown = page.getByTestId('part-tool').filter({ hasText: 'unknown_reader' });
  await reloadedUnknown.getByRole('button').first().click();
  await expect(reloadedUnknown.getByTestId('part-tool-provenance-incomplete')).toBeVisible();
});
