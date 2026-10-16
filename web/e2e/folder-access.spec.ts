import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const width of [1280, 390]) {
  for (const theme of ['light', 'dark']) {
    test(`workspace folder paths are directly editable at ${width}px in ${theme}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`/tests/review/folder-access.html?view=workspace&theme=${theme}`);
      const primary = page.getByRole('textbox', { name: 'Primary folder path' });
      const additional = page.getByRole('textbox', { name: 'Additional folder path' });
      await expect(primary).toBeInViewport();
      await expect(additional).toBeInViewport();
      await expect(page.getByRole('button', { name: 'Enter a path instead' })).toHaveCount(0);
      await expect(page.getByRole('textbox')).toHaveCount(3);
      await primary.fill('C:\\Research workspace');
      await additional.fill('D:\\Final_thesis');
      await page.getByRole('button', { name: 'Browse', exact: true }).first().click();
      await page
        .getByRole('dialog', { name: 'Choose a folder' })
        .getByText('Research', { exact: true })
        .click();
      await page.getByRole('button', { name: 'Use this folder' }).click();
      await expect(primary).toHaveValue('C:\\Users\\Alice\\Documents\\Research');
      await primary.fill('C:\\Research workspace');
      const save = page.getByRole('button', { name: 'Save workspace' });
      await expect(save).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: testInfo.outputPath(`editable-folder-paths-${width}-${theme}.png`),
        fullPage: true,
      });
      await save.click();
      await expect(page.getByRole('status')).toHaveText(
        'Saved primary: C:\\Research workspace; permitted: D:\\Final_thesis',
      );
    });
  }

  test(`folder permission is readable and actionable at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/tests/review/folder-access.html');
    await expect(
      page.getByText('Move the measurements you selected into the results folder.'),
    ).toBeInViewport();
    await expect(page.getByText('Research PC')).toBeInViewport();
    await expect(page.getByText('C:\\Users\\Alice\\Downloads', { exact: true })).toBeVisible();
    await expect(page.getByText(/including after restart/)).toBeVisible();
    const allow = page.getByRole('button', { name: 'Allow for workspace' });
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

test('workspace folder details open from the keyboard without crowding the form', async ({
  page,
}, testInfo) => {
  await page.goto('/tests/review/folder-access.html?view=workspace');
  const editor = page.getByRole('dialog', { name: 'Edit workspace' });
  await expect(editor.getByText('Read & write access', { exact: true })).toBeVisible();
  await expect(page.getByText(/Conversations stay in this workspace/)).toHaveCount(0);
  await page.getByRole('button', { name: 'About the primary folder' }).focus();
  const primaryHelp = page.getByRole('tooltip', { name: /Choose its new location/ });
  await expect(primaryHelp).toContainText('Conversations stay in this workspace');
  await page.keyboard.press('Escape');
  await expect(primaryHelp).not.toBeVisible();
  await expect(editor).toBeVisible();
  await page.getByRole('button', { name: 'About folder access' }).focus();
  const accessHelp = page.getByRole('tooltip', { name: /Removing a folder/ });
  await expect(accessHelp).toContainText('without deleting files');
  await expect(accessHelp).toContainText('after they finish');
  await page.screenshot({ path: testInfo.outputPath('folder-access-help.png') });
  expect(
    (
      await new AxeBuilder({ page })
        .include('[data-slot="dialog-content"]')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
});

test('many folders scroll within the editor while Save remains visible on a small screen', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 640 });
  await page.goto('/tests/review/folder-access.html?view=workspace&folders=many');
  const save = page.getByRole('button', { name: 'Save workspace' });
  await expect(save).toBeInViewport();
  const list = page.getByRole('list', { name: 'Additional permitted folders' });
  await expect(list.getByRole('listitem')).toHaveCount(12);
  const path = list.getByText(/A very long folder name/).first();
  expect(await path.getAttribute('title')).toContain('experiment 1');
  await page.getByRole('textbox', { name: 'Additional folder path' }).fill('D:\\New source');
  await page.getByRole('button', { name: 'Add folder' }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'Add folder' })).toBeInViewport();
  await expect(page.getByRole('textbox', { name: 'Additional folder path' })).toBeInViewport({
    ratio: 1,
  });
  await expect(save).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('many-folders-mobile.png') });
  await save.click();
  await expect(page.getByRole('status')).toHaveText('; permitted: D:\\New source');
});

test('an empty additional folder list stays compact and can save a typed path', async ({
  page,
}, testInfo) => {
  await page.goto('/tests/review/folder-access.html?view=workspace&folders=empty');
  await expect(page.getByRole('list', { name: 'Additional permitted folders' })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Additional folder path' }).fill('D:\\New source');
  await page.screenshot({ path: testInfo.outputPath('empty-folders.png') });
  await page.getByRole('button', { name: 'Save workspace' }).click();
  await expect(page.getByRole('status')).toHaveText('; permitted: D:\\New source');
});
