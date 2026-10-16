import { expect, test } from '@playwright/test';
const evidence = 'D:/CLIO-Develop/native-service-completion-20261016';
for (const theme of ['light', 'dark']) {
  test(`AMD native setup ${theme}`, async ({ page }) => {
    await page.goto(`/tests/review/service-methods.html?theme=${theme}`);
    await page
      .getByRole('button', { name: /llama.cpp/ })
      .first()
      .click();
    await expect(page.getByRole('radio', { name: /^Native/ })).toBeChecked();
    await expect(page.getByRole('button', { name: 'Install', exact: true })).toBeEnabled();
    await page.getByRole('combobox', { name: 'llama.cpp Native variant' }).click();
    await expect(page.getByRole('option', { name: /AMD ROCm/ })).toBeEnabled();
    await page.getByRole('option', { name: /AMD ROCm/ }).click();
    await expect(page.getByRole('combobox', { name: 'llama.cpp Native variant' })).toContainText(
      'AMD ROCm',
    );
    await page.screenshot({ path: `${evidence}/amd-native-${theme}.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await page.screenshot({ path: `${evidence}/amd-native-${theme}-mobile.png`, fullPage: true });
  });
}
test('Linux without a container engine offers all five native installers', async ({ page }) => {
  await page.goto('/tests/review/service-methods.html?host=2');
  for (const name of ['llama.cpp', 'Ollama', 'CLIO Web Search', 'Flowcept', 'HPE CMF']) {
    await page
      .getByRole('button', { name: new RegExp(name) })
      .first()
      .click();
    await expect(page.getByRole('radio', { name: /^Native/ })).toBeChecked();
    await expect(page.getByRole('radio', { name: /^Containers/ })).toBeDisabled();
    await page.getByRole('button', { name: /Choose another service/ }).click();
  }
  await page.screenshot({ path: `${evidence}/linux-native-services.png`, fullPage: true });
});
