import { expect, type Download, type Locator, type Page } from '@playwright/test';

/**
 * Open a file view: a visible mode tab, the folded modes menu of a narrow
 * frame bar, the checked mode list in … at the narrowest step, or a secondary
 * inspection view through File actions.
 */
export async function selectFileView(page: Page, viewer: Locator, name: string): Promise<void> {
  const tab = viewer.getByRole('tab', { name, exact: true });
  if (await tab.isVisible()) {
    await tab.click();
    // A narrow frame bar may refold its modes once the new view settles.
    await expect(
      viewer.getByRole('tab', { name, exact: true, includeHidden: true }),
    ).toHaveAttribute('aria-selected', 'true');
    return;
  }
  // The frame bar's folded modes, or a document's own representations menu.
  const foldedModes = viewer
    .locator('[data-modes-folded]')
    .or(viewer.getByRole('button', { name: 'File representations', exact: true }))
    .filter({ visible: true })
    .first();
  if (await foldedModes.isVisible()) {
    await foldedModes.click();
    const mode = page.getByRole('menuitemradio', { name, exact: true });
    if (await mode.count()) {
      await mode.click();
      await expect(viewer.getByRole('tabpanel', { name, exact: true })).toBeVisible();
      return;
    }
    await page.keyboard.press('Escape');
  }
  await viewer.getByRole('button', { name: 'File actions', exact: true }).click();
  // Narrowest, the modes are a checked list in …; otherwise an inspection view.
  await page
    .getByRole('menuitemradio', { name, exact: true })
    .or(page.getByRole('menuitemcheckbox', { name, exact: true }))
    .first()
    .click();
  await expect(viewer.getByRole('tabpanel', { name, exact: true })).toBeVisible();
}

/** Open ▾'s rows: from its chevron, or from the … menu once the frame bar folds Open away. */
export async function openFrameOpenMenu(page: Page, toolbar: Locator): Promise<void> {
  const chevron = toolbar.getByRole('button', { name: 'Open options', exact: true });
  if (await chevron.isVisible()) {
    await chevron.click();
    return;
  }
  await toolbar.getByRole('button', { name: /^(File actions|More actions)$/u }).click();
  await page.getByRole('menuitem', { name: 'Open', exact: true }).click();
}

/** Download the original bytes with the frame's Download, which never folds. */
export async function downloadFromFrame(page: Page, toolbar: Locator): Promise<Download> {
  const download = page.waitForEvent('download');
  // The frame bar comes before any state body that repeats the download.
  await toolbar.getByRole('button', { name: 'Download', exact: true }).first().click();
  return download;
}
