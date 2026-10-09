import { expect, test } from '@playwright/test';

const endpoint = `http://127.0.0.1:${process.env['CLIO_FIXTURE_PORT'] ?? '18799'}`;

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}: interactive cursors cover navigation, menus and controls`, async ({ page }) => {
    expect((await page.request.post(`${endpoint}/__test/reset`)).ok()).toBe(true);
    await page.addInitScript(
      ({ connection, theme }) => {
        localStorage.setItem('clio.recent-connections', JSON.stringify([connection]));
        localStorage.setItem('theme', theme);
      },
      { connection: endpoint, theme },
    );
    await page.goto('/workspaces/ws_flat_ndp/new');
    const newSession = page.getByRole('button', { name: 'New session in flat-NDP', exact: true });
    await newSession.hover();
    await expect(newSession).toHaveCSS('cursor', 'pointer');
    await expect(newSession.locator('svg')).toHaveCSS('cursor', 'pointer');
    await newSession.click();

    const create = page.getByRole('dialog', { name: 'Create', exact: true });
    await expect(create.getByRole('tab', { name: 'Workspace', exact: true })).toHaveCSS(
      'cursor',
      'pointer',
    );
    await expect(create.getByRole('textbox', { name: 'Session name', exact: true })).toHaveCSS(
      'cursor',
      'text',
    );
    await expect(create.getByRole('combobox', { name: 'Workspace', exact: true })).toHaveCSS(
      'cursor',
      'pointer',
    );
    const disabledCreate = create.getByRole('button', { name: 'Create session', exact: true });
    await expect(disabledCreate).toBeDisabled();
    await expect(disabledCreate).not.toHaveCSS('cursor', 'pointer');
    await create.getByRole('button', { name: 'Cancel', exact: true }).click();

    const overflow = page.getByRole('button', {
      name: 'Workspace actions for flat-NDP',
      exact: true,
    });
    await overflow.hover();
    await expect(overflow).toHaveCSS('cursor', 'pointer');
    await overflow.click();
    const editWorkspace = page.getByRole('menuitem', { name: 'Edit workspace', exact: true });
    await editWorkspace.hover();
    await expect(editWorkspace).toHaveCSS('cursor', 'pointer');
    await page.keyboard.press('Escape');

    const draftActions = page.getByRole('button', {
      name: 'New conversation actions',
      exact: true,
    });
    await expect(draftActions).toHaveCSS('cursor', 'pointer');
    await draftActions.focus();
    await page.keyboard.press('Enter');
    const files = page.getByRole('menuitem', { name: 'Workspace files', exact: true });
    await expect(files).toHaveCSS('cursor', 'pointer');
    await files.click();
    // Canvas tabs are also reorder handles: retain their explicit grab cursor.
    await expect(page.getByRole('tab', { name: 'Files', exact: true })).toHaveCSS('cursor', 'grab');
    const resize = page.getByRole('separator', { name: 'Resize navigation', exact: true });
    await resize.hover();
    await expect(resize).not.toHaveCSS('cursor', 'pointer');
    await page.getByRole('button', { name: 'Close workspace canvas', exact: true }).click();

    const sessionLink = page.getByRole('link', { name: /^EarthScope NDP evidence review/ });
    await expect(sessionLink).toHaveCSS('cursor', 'pointer');
    await expect(sessionLink.locator('[role="status"]')).toHaveCSS('cursor', 'pointer');
    await sessionLink.click();
    const sessionActions = page.getByRole('button', {
      name: 'Session actions for EarthScope NDP evidence review',
      exact: true,
    });
    await sessionActions.hover();
    await expect(sessionActions).toHaveCSS('cursor', 'pointer');
    await sessionActions.click();
    const exportSession = page.getByRole('menuitem', { name: 'Export session', exact: true });
    await expect(exportSession).toHaveCSS('cursor', 'pointer');
    await exportSession.hover();
    const workspaceFiles = page.getByRole('menuitemcheckbox', {
      name: 'Include workspace files',
      exact: true,
    });
    await expect(workspaceFiles).toHaveCSS('cursor', 'pointer');
    await workspaceFiles.click();
    await expect(workspaceFiles).toBeChecked();
    await expect(
      page.getByRole('menuitemcheckbox', { name: 'Include session artifacts' }),
    ).toBeChecked();
    await expect(page.getByRole('menuitem', { name: 'Download ZIP', exact: true })).toHaveCSS(
      'cursor',
      'pointer',
    );
  });
}
