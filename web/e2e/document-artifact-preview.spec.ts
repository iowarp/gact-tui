import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// Synthetic editable documents and real LibreOffice PDF renditions, produced by
// clio-agent's locked document_stack/smoke.py. Only API transport is a fixture:
// the artifact workspace, document routing and pdf.js renderer are production UI.
const endpoint = `http://127.0.0.1:${process.env['CLIO_FIXTURE_PORT'] ?? '18799'}`;
const sessionId = 'sess_flat_ndp';
const workspaceId = 'ws_flat_ndp';
// The documentation recorder uses a scaled display. Its source PDF should still
// have enough raster resolution to keep text sharp at the CSS viewing size.
test.use({ deviceScaleFactor: 0.8 });
const cases = [
  {
    extension: 'docx',
    profile: 'ooxml-word',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    text: 'After edit',
    pages: 1,
  },
  {
    extension: 'pptx',
    profile: 'ooxml-slides',
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    text: 'Evidence slide 1',
    pages: 2,
  },
  {
    extension: 'xlsx',
    profile: 'ooxml-sheet',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    text: 'Total',
    pages: 1,
  },
];

for (const item of cases) {
  test(`opens the editable ${item.extension} artifact with its saved PDF preview`, async ({
    page,
  }, testInfo) => {
    const source = readFileSync(
      new URL(`../tests/fixtures/document-preview/synthetic.${item.extension}`, import.meta.url),
    );
    const pdf = readFileSync(
      new URL(`../tests/fixtures/document-preview/${item.extension}.pdf`, import.meta.url),
    );
    const name = `synthetic.${item.extension}`;
    const sourceId = 'artifact_plot';
    const pdfId = `artifact_preview_${item.extension}`;
    const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
    const errors: string[] = [];
    const conversions: string[] = [];
    let holdRefresh = false;
    let finishRefresh!: () => void;
    const refreshResponse = new Promise<void>((resolve) => {
      finishRefresh = resolve;
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.request.post(`${endpoint}/__test/reset`);
    await page.addInitScript((value) => {
      localStorage.setItem('clio.recent-connections', JSON.stringify([value]));
      localStorage.setItem('theme', 'light');
    }, endpoint);
    const manifest = {
      artifact_id: sourceId,
      workspace_id: workspaceId,
      name,
      version: 1,
      sha256: hash(source),
      mime_type: item.mime,
      profile: item.profile,
      content_url: `/v1/artifacts/${sourceId}/document/content`,
      anchors: [],
      native_open: true,
      embedded_editors: [],
      rendition_formats: ['pdf'],
      pdf_rendition_artifact_id: pdfId,
      provenance: {},
    };
    const amendRecord = (record: Record<string, unknown>) => ({
      ...record,
      name,
      kind: 'report',
      media_type: item.mime,
      versions: (record.versions as Array<Record<string, unknown>>).map((version) => ({
        ...version,
        name,
        kind: 'report',
        media_type: item.mime,
        sha256: hash(source),
        size_bytes: source.length,
      })),
    });
    await page.route('**/v1/**', async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      if (path === `/v1/sessions/${sessionId}/artifacts`) {
        const response = await route.fetch();
        const body = await response.json();
        body.artifacts = body.artifacts.map(amendRecord);
        await route.fulfill({ response, json: body });
      } else if (path === `/v1/artifacts/${sourceId}`) {
        const response = await route.fetch();
        const body = await response.json();
        body.artifact = amendRecord(body.artifact);
        body.resolved = body.artifact.versions[0];
        await route.fulfill({ response, json: body });
      } else if (path === `/v1/artifacts/${sourceId}/document`) {
        if (holdRefresh) await refreshResponse;
        await route.fulfill({ json: manifest });
      } else if (path === `/v1/artifacts/${pdfId}/document`) {
        await route.fulfill({
          json: {
            ...manifest,
            artifact_id: pdfId,
            name: `${name}.v1.pdf`,
            mime_type: 'application/pdf',
            sha256: hash(pdf),
            profile: 'pdf',
            native_open: false,
            rendition_formats: [],
            pdf_rendition_artifact_id: '',
            content_url: `/v1/artifacts/${pdfId}/document/content`,
          },
        });
      } else if (path === `/v1/artifacts/${pdfId}/document/content`) {
        await route.fulfill({ contentType: 'application/pdf', body: pdf });
      } else if (path === `/v1/artifacts/${sourceId}/bytes`) {
        await route.fulfill({ contentType: item.mime, body: source });
      } else if (path === `/v1/artifacts/${sourceId}/reviews`) {
        await route.fulfill({ json: { reviews: [] } });
      } else if (path.endsWith('/renditions')) {
        conversions.push(path);
        await route.fulfill({
          status: 500,
          json: { detail: 'Saved previews must not reconvert.' },
        });
      } else {
        await route.continue();
      }
    });
    await page.goto(`/workspaces/${workspaceId}/sessions/${sessionId}`);
    await page.getByRole('button', { name: 'Open workspace canvas', exact: true }).click();
    await page.getByRole('button', { name: 'Open a canvas tab', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Session artifacts', exact: true }).click();
    const canvas = page.getByRole('complementary', { name: 'Workspace canvas' });
    await canvas.getByRole('button', { name: `Open ${name}`, exact: true }).click();
    await canvas.getByRole('button', { name: 'Maximize canvas', exact: true }).click();
    const document = canvas.getByRole('region', { name: 'Document workspace' });
    await expect(
      document.getByText(`${item.pages} ${item.pages === 1 ? 'page' : 'pages'}`, { exact: true }),
    ).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Use paged PDF view' })).toHaveCount(0);
    await expect(canvas.getByRole('button', { name: 'Zoom PDF in' })).toBeVisible();
    await expect(document.getByText(item.text, { exact: true })).toBeVisible();
    await expect(document.locator('.react-pdf__Page__canvas').first()).toBeVisible();
    const pageCanvas = document.locator('.react-pdf__Page__canvas').first();
    await expect
      .poll(async () =>
        pageCanvas.evaluate((canvas) => {
          const bounds = canvas.getBoundingClientRect();
          const density = (canvas as HTMLCanvasElement).width / bounds.width;
          // Large pages may reach the allocation cap before 2x density.
          const required = Math.min(2, Math.sqrt(8_000_000 / (bounds.width * bounds.height)));
          return density / required;
        }),
      )
      .toBeGreaterThanOrEqual(0.99);
    await canvas.getByRole('button', { name: 'Open in', exact: true }).click();
    await expect(page.getByRole('menuitem', { name: 'PDF preview', exact: true })).toBeVisible();
    await page.getByRole('menuitem', { name: 'PDF preview', exact: true }).click();
    const scroller = document.locator('[data-pdf-scroller]');
    const scrollerBounds = await scroller.boundingBox();
    const canvasBounds = await canvas.boundingBox();
    expect(
      canvasBounds!.y + canvasBounds!.height - scrollerBounds!.y - scrollerBounds!.height,
    ).toBeLessThan(45);
    if (item.pages > 1) {
      await scroller.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await expect(document.getByText('Evidence slide 2', { exact: true })).toBeVisible();
    }
    await page.screenshot({
      path: testInfo.outputPath(`${item.extension}-pdf-preview.png`),
      fullPage: true,
    });
    holdRefresh = true;
    await canvas.getByRole('button', { name: 'Refresh document revision', exact: true }).click();
    const refreshing = canvas.getByRole('button', {
      name: 'Refresh document revision — refreshing',
      exact: true,
    });
    await expect(refreshing).toBeDisabled();
    await expect(refreshing).toHaveAttribute('aria-busy', 'true');
    const icon = refreshing.locator('svg');
    await expect(icon).toHaveCSS('animation-name', 'spin');
    const before = await icon.evaluate((element) => getComputedStyle(element).transform);
    await page.waitForTimeout(100);
    const after = await icon.evaluate((element) => getComputedStyle(element).transform);
    expect(after).not.toBe(before);
    await page.screenshot({
      path: testInfo.outputPath(`${item.extension}-refresh-pending.png`),
      fullPage: true,
    });
    finishRefresh();
    await expect(
      canvas.getByRole('button', { name: 'Refresh document revision', exact: true }),
    ).toBeEnabled();
    expect(conversions).toEqual([]);
    expect(errors).toEqual([]);
  });
}
