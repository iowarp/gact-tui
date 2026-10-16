import { expect, test } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';

test('real strong and smaller model SVG artifacts render inline and adapt to theme', async ({
  page,
  request,
}) => {
  const evidence = process.env['CLIO_REVIEW_EVIDENCE'];
  if (!evidence) throw new Error('Set CLIO_REVIEW_EVIDENCE');
  const connection = JSON.parse(
    await readFile(`${evidence}/html-responsive-live-v3/connection.json`, 'utf8'),
  );
  expect(connection.runs).toHaveLength(2);
  for (const run of connection.runs) expect(run.accepted_surfaces).toBeGreaterThan(0);
  const response = await request.get(
    `${connection.endpoint}/v1/workspaces/${connection.runs[0].workspace_id}/artifacts`,
  );
  expect(response.ok()).toBe(true);
  const { artifacts } = await response.json();
  const runs = await Promise.all(
    connection.runs.map(async (run: { model: string; name: string; session_id: string }) => {
      const artifact = artifacts.find((row: { name: string }) => row.name === `${run.name}.svg`);
      expect(artifact, `${run.model} registered its SVG`).toBeTruthy();
      expect(typeof artifact.head_artifact_id).toBe('string');
      const response = await request.get(
        `${connection.endpoint}/v1/sessions/${run.session_id}/a2ui/surfaces`,
      );
      expect(response.ok()).toBe(true);
      const { surfaces } = await response.json();
      expect(surfaces).toHaveLength(1);
      expect(surfaces[0].state).toBe('ready');
      expect(JSON.stringify(surfaces[0].messages)).toContain(artifact.head_artifact_id);
      return { ...run, artifact_id: artifact.head_artifact_id, surface: surfaces[0] };
    }),
  );
  await page.addInitScript(
    (data) => {
      window.clioHtmlSvgLive = data;
    },
    { endpoint: connection.endpoint, runs },
  );
  await page.goto('/tests/review/html-responsive.html');
  const receipts: Record<string, unknown>[] = [];
  for (const run of runs) {
    const host = page.locator(`[data-model="${run.model}"]`);
    const image = host.getByRole('img');
    await expect(image).toBeVisible();
    await expect
      .poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
    const source = await image.evaluate(async (element) =>
      fetch((element as HTMLImageElement).src).then((response) => response.text()),
    );
    expect(source).toContain('viewBox');
    expect(source).toContain('--foreground:');
    expect(source).toMatch(/var\(--(?:primary|background)\)/);
    receipts.push({
      model: run.model,
      artifact_id: run.artifact_id,
      surface_id: run.surface.id,
      revision: run.surface.revision,
      sourceLoadedFromPrivateClio: true,
      lightUrl: await image.getAttribute('src'),
    });
  }
  await page.screenshot({
    path: test.info().outputPath('actual-model-svg-light.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
  for (const [i, run] of runs.entries()) {
    const image = page.locator(`[data-model="${run.model}"] img`);
    await expect(image).not.toHaveAttribute('src', receipts[i]!.lightUrl as string);
    const source = await image.evaluate(async (element) =>
      fetch((element as HTMLImageElement).src).then((response) => response.text()),
    );
    expect(source).toContain('--foreground: oklch(0.95 0 0)');
    if (run.name === 'small') {
      const brightestLabelPixel = await image.evaluate((element) => {
        const image = element as HTMLImageElement;
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d')!;
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(24, 14, 220, 20).data;
        let brightest = 0;
        for (let i = 0; i < pixels.length; i += 4)
          brightest = Math.max(brightest, pixels[i]!, pixels[i + 1]!, pixels[i + 2]!);
        return brightest;
      });
      expect(brightestLabelPixel).toBeGreaterThan(150);
    }
  }
  await page.screenshot({
    path: test.info().outputPath('actual-model-svg-dark.png'),
    fullPage: true,
  });
  await writeFile(
    `${evidence}/html-responsive-live-v3/browser-receipt.json`,
    JSON.stringify(receipts, null, 2),
  );
});
