import { expect, test } from '@playwright/test';
import { connectMockBackend } from './mock-backend';

test.use({ video: 'on' });

test('document artifact selection, floating review, history, and policy', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('clio.preview-rail-open.v1', 'true');
  });
  await connectMockBackend(page, 'documents');

  const rail = page.getByTestId('preview-rail');
  await expect(rail).toBeVisible();
  await page.getByTestId('preview-rail-row-evidence-brief.md').click();

  const workspace = page.getByTestId('document-workspace');
  await expect(workspace).toBeVisible();
  await expect(workspace).toContainText('tentative pending quality review');
  await expect(workspace).toContainText('v2');

  await page.evaluate(() => {
    const root = document.querySelector('[data-testid="document-markdown"]');
    if (!root) throw new Error('Markdown document root is unavailable');
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node && !node.textContent?.includes('tentative pending quality review')) {
      node = walker.nextNode();
    }
    if (!node?.textContent) throw new Error('Review target text is unavailable');
    const exact = 'tentative pending quality review';
    const start = node.textContent.indexOf(exact);
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, start + exact.length);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    node.parentElement?.dispatchEvent(
      new MouseEvent('mouseup', { bubbles: true, cancelable: true }),
    );
  });

  const composer = page.getByTestId('document-review-composer');
  await expect(composer).toBeVisible();
  await expect(composer).toContainText('tentative pending quality review');
  await composer
    .locator('textarea')
    .fill('State the uncertainty source and keep the scan-limit caveat adjacent.');
  const composeShot = testInfo.outputPath('document-floating-review.png');
  await page.screenshot({ path: composeShot, fullPage: false });
  await testInfo.attach('floating-review', {
    path: composeShot,
    contentType: 'image/png',
  });

  await composer.getByRole('button', { name: 'Send to agent' }).click();
  await expect(page.getByTestId('document-action-status')).toContainText('exact revision');
  await page.getByRole('button', { name: /^Comments/ }).click();
  const comments = page.getByTestId('document-comments');
  await expect(comments).toContainText('State the uncertainty source');
  await expect(comments).toContainText('dispatched');

  await page.getByRole('button', { name: 'History' }).click();
  await page.getByRole('button', { name: /Version 1/ }).click();
  await expect(page.getByTestId('document-action-status')).toContainText('immutable version 1');

  await page.getByRole('button', { name: 'Policy' }).click();
  await expect(page.getByTestId('document-policy')).toContainText('Static HTML cannot run scripts');
  const finalShot = testInfo.outputPath('document-history-policy.png');
  await page.screenshot({ path: finalShot, fullPage: false });
  await testInfo.attach('history-policy', {
    path: finalShot,
    contentType: 'image/png',
  });
});

test('PDF text layer creates a page-bound review anchor', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('clio.preview-rail-open.v1', 'true');
  });
  await connectMockBackend(page, 'documents');

  await page.getByTestId('preview-rail-row-evidence-brief.pdf').click();
  const viewer = page.getByTestId('document-pdf');
  await expect(viewer).toBeVisible();
  await page.waitForTimeout(2_000);
  expect(await viewer.textContent()).not.toContain('Could not render PDF');
  await expect(viewer.locator('.document-pdf__page')).toHaveCount(1, {
    timeout: 15_000,
  });
  await expect(viewer.locator('.document-pdf__text-layer')).toContainText('Evidence brief');

  await page.evaluate(() => {
    const spans = Array.from(
      document.querySelectorAll<HTMLElement>('.document-pdf__text-layer span'),
    );
    const span = spans.find((candidate) => candidate.textContent?.includes('Evidence brief'));
    const text = span?.firstChild;
    if (!span || !text?.textContent) throw new Error('PDF review target text is unavailable');
    const exact = 'Evidence brief';
    const start = text.textContent.indexOf(exact);
    const range = document.createRange();
    range.setStart(text, start);
    range.setEnd(text, start + exact.length);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    span.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
  });

  const composer = page.getByTestId('document-review-composer');
  await expect(composer).toBeVisible();
  await expect(composer).toContainText('Evidence brief');
  await composer.locator('textarea').fill('Make this title more specific to the evidence.');
  const shot = testInfo.outputPath('document-pdf-review.png');
  await page.screenshot({ path: shot, fullPage: false });
  await testInfo.attach('pdf-review', {
    path: shot,
    contentType: 'image/png',
  });

  await composer.getByRole('button', { name: 'Send to agent' }).click();
  await expect(page.getByTestId('document-action-status')).toContainText('exact revision');
});
