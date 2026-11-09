import { expect, type Download, type Locator, type Page } from '@playwright/test';

/**
 * Open a file view: a visible mode tab, the folded modes menu of a narrow
 * frame bar, or a secondary inspection view through File actions.
 */
export async function selectFileView(page: Page, viewer: Locator, name: string): Promise<void> {
  // Mode tabs fold into a menu as the bar measures; choose the path once it holds still.
  await frameSettled(viewer.locator('[data-slot="frame-bar"]').first());
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
      // The segment's tab carries the choice; a renderer names its own panel.
      await expect(
        viewer.getByRole('tab', { name, exact: true, includeHidden: true }),
      ).toHaveAttribute('aria-selected', 'true');
      return;
    }
    await page.keyboard.press('Escape');
  }
  await viewer.getByRole('button', { name: 'File actions', exact: true }).click();
  await page.getByRole('menuitemcheckbox', { name, exact: true }).click();
  await expect(viewer.getByRole('tabpanel', { name, exact: true })).toBeVisible();
}

/** Open ▾'s rows: from its chevron, or from the … menu once the frame bar folds Open away. */
export async function openFrameOpenMenu(page: Page, toolbar: Locator): Promise<void> {
  // The bar refits as its facts arrive; choose the path once its folds hold still.
  await frameSettled(toolbar);
  const chevron = toolbar.getByRole('button', { name: 'Open options', exact: true });
  if (await chevron.isVisible()) {
    await chevron.click();
    return;
  }
  await toolbar.getByRole('button', { name: /^(File actions|More actions)$/u }).click();
  await page.getByRole('menuitem', { name: 'Open', exact: true }).click();
}

/** Wait until the frame bar's fold step reads the same twice, 200ms apart. */
async function frameSettled(toolbar: Locator): Promise<void> {
  if (!(await toolbar.count())) return;
  let last: string | undefined;
  await expect
    .poll(
      async () => {
        const fold = String(await toolbar.getAttribute('data-fold'));
        const settled = fold === last;
        last = fold;
        return settled;
      },
      { intervals: [200] },
    )
    .toBe(true);
}

/** Download the original bytes with the frame's Download, which never folds. */
export async function downloadFromFrame(page: Page, toolbar: Locator): Promise<Download> {
  const download = page.waitForEvent('download');
  // The frame bar comes before any state body that repeats the download.
  await toolbar.getByRole('button', { name: 'Download', exact: true }).first().click();
  return download;
}
