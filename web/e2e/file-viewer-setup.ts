import { expect, type Locator, type Page } from '@playwright/test';

/** Open a primary file tab or a secondary inspection view through File actions. */
export async function selectFileView(page: Page, viewer: Locator, name: string): Promise<void> {
  const tab = viewer.getByRole('tab', { name, exact: true });
  if (await tab.count()) {
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
  } else if (['Source', 'Read document', 'HTML preview', 'Data'].includes(name)) {
    await viewer.getByRole('button', { name: 'File representations', exact: true }).click();
    await page.getByRole('menuitemradio', { name, exact: true }).click();
    await expect(viewer.getByRole('tabpanel', { name, exact: true })).toBeVisible();
  } else {
    await viewer.getByRole('button', { name: 'File actions', exact: true }).click();
    await page.getByRole('menuitemcheckbox', { name, exact: true }).click();
    await expect(viewer.getByRole('tabpanel', { name, exact: true })).toBeVisible();
  }
}
