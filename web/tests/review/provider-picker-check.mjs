import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = resolve(process.env.CLIO_REVIEW_OUTPUT ?? 'test-results/provider-picker');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const captures = [];
async function capture(name) {
  await page.screenshot({ path: resolve(output, name), fullPage: true });
  captures.push(name);
}
try {
  await page.goto('http://127.0.0.1:5212/tests/review/provider-picker.html');
  await page.getByRole('button', { name: 'Choose model', exact: true }).waitFor();
  await page.evaluate(async () => {
    await document.fonts.load('14px "Inter Variable"');
    await document.fonts.ready;
    if (
      ![...document.fonts].some((font) => font.family.includes('Inter') && font.status === 'loaded')
    )
      throw new Error('Review font did not load; fallback typography is not sufficient.');
  });
  await capture('attention-sound-desktop-fixture.png');
  const attentionLines = await page.getByText('In background', { exact: true }).evaluate((node) => {
    return (
      node.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(node).lineHeight)
    );
  });
  if (attentionLines > 1.1)
    throw new Error('Attention sound label wrapped despite the normal desktop control width.');
  await page.getByRole('button', { name: 'Choose model', exact: true }).click();
  await page.getByText('Codex client 0.157.1', { exact: true }).waitFor();
  await capture('codex-client-update-desktop-fixture.png');
  await page.getByRole('button', { name: 'Reload models', exact: true }).click();
  await page
    .getByText(/Client updated; no new models found/u)
    .first()
    .waitFor();
  await capture('refresh-no-new-models-desktop-fixture.png');
  await page.goto('http://127.0.0.1:5212/tests/review/provider-picker.html');
  await page.getByRole('button', { name: 'Claude Code', exact: true }).click();
  await page.getByRole('button', { name: 'Choose model', exact: true }).click();
  await page.getByRole('button', { name: 'Reload models', exact: true }).click();
  await page
    .getByText(/1 catalogued model needs a newer Anthropic client/u)
    .first()
    .waitFor();
  await capture('claude-client-gap-desktop-fixture.png');
  await page.goto('http://127.0.0.1:5212/tests/review/provider-picker.html');
  await page.getByRole('button', { name: 'llama.cpp server', exact: true }).click();
  await page.getByRole('button', { name: 'Choose model', exact: true }).click();
  await page.getByRole('button', { name: 'Change URL', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'llama.cpp server URL' });
  await input.fill('http://gpu-7:8088/v1');
  await capture('local-server-url-desktop-fixture.png');
  await page.getByRole('button', { name: 'Save and check', exact: true }).click();
  await page
    .locator('[data-slot="provider-endpoint"]')
    .getByText('http://gpu-7:8088/v1', { exact: true })
    .waitFor();
  await page.getByRole('button', { name: 'Provider settings', exact: true }).click();
  await page.getByText('/settings/providers?provider=llama_cpp', { exact: true }).waitFor();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByLabel('llama.cpp server provider settings', { exact: true }).waitFor();
  await capture('provider-settings-anchor-desktop-fixture.png');
  const anchored = await page
    .getByLabel('llama.cpp server provider settings', { exact: true })
    .evaluate((node) => node === document.activeElement);
  if (!anchored) throw new Error('Settings did not focus the requested provider.');
  await page.goto('http://127.0.0.1:5212/tests/review/provider-picker.html');
  await page.setViewportSize({ width: 390, height: 844 });
  await capture('attention-sound-mobile-fixture.png');
  await page.getByRole('button', { name: 'llama.cpp server', exact: true }).click();
  await page.getByRole('button', { name: 'Choose model', exact: true }).click();
  await page.getByRole('button', { name: 'Change URL', exact: true }).click();
  await page.getByRole('textbox', { name: 'llama.cpp server URL' }).fill('http://gpu-7:8088/v1');
  await capture('local-server-url-mobile-fixture.png');
  const geometry = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]').getBoundingClientRect();
    const panel = document.querySelector('[data-slot="provider-endpoint"]').getBoundingClientRect();
    return {
      viewport: innerWidth,
      scroll: document.documentElement.scrollWidth,
      dialog: { left: dialog.left, right: dialog.right },
      endpoint: { left: panel.left, right: panel.right },
    };
  });
  if (
    geometry.scroll > geometry.viewport ||
    geometry.dialog.left < 0 ||
    geometry.dialog.right > geometry.viewport ||
    geometry.endpoint.right > geometry.dialog.right
  )
    throw new Error(JSON.stringify(geometry));
  if (errors.length) throw new Error(JSON.stringify(errors));
  await writeFile(
    resolve(output, 'review.json'),
    JSON.stringify(
      {
        methodology:
          'Actual Chromium rendering and ordinary clicks; simulated provider replies in a labelled browser fixture. No real client updates, inference or user config writes.',
        captures,
        geometry,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    'Provider picker browser review passed: desktop/mobile URL editing, refresh information, settings navigation and containment.',
  );
} finally {
  await browser.close();
}
