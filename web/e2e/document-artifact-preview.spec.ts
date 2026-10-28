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

for (const layout of [
  { name: 'desktop', viewport: { width: 1280, height: 720 } },
  { name: 'phone', viewport: { width: 390, height: 844 } },
]) {
  test.describe(layout.name, () => {
    test.use({ viewport: layout.viewport });
    for (const item of cases.flatMap((item) => [
      { ...item, saved: true },
      ...(item.extension === 'pptx' ? [{ ...item, saved: false }] : []),
    ])) {
      test(`opens the editable ${item.extension} artifact with ${item.saved ? 'its saved' : 'an automatically rendered'} PDF preview`, async ({
        page,
      }, testInfo) => {
        const source = readFileSync(
          new URL(
            `../tests/fixtures/document-preview/synthetic.${item.extension}`,
            import.meta.url,
          ),
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
        let finishConversion!: () => void;
        const conversionResponse = new Promise<void>((resolve) => {
          finishConversion = resolve;
        });
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
          pdf_rendition_artifact_id: item.saved ? pdfId : '',
          provenance: {},
        };
        const pdfManifest = {
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
        // This fixture never edits either metadata record. Load the original
        // API envelopes once, then serve them without an idle upstream proxy
        // socket spanning screenshot and viewer interactions.
        const artifactResponse = await page.request.get(`${endpoint}/v1/artifacts/${sourceId}`);
        expect(artifactResponse.ok()).toBe(true);
        const originalArtifact = await artifactResponse.json();
        const editableArtifact = amendRecord(originalArtifact.artifact);
        const artifactsResponse = await page.request.get(
          `${endpoint}/v1/sessions/${sessionId}/artifacts?include_children=true&include_used=true&limit=200`,
        );
        expect(artifactsResponse.ok()).toBe(true);
        const originalArtifacts = await artifactsResponse.json();
        await page.route('**/v1/**', async (route) => {
          const url = new URL(route.request().url());
          const path = url.pathname;
          if (path === `/v1/sessions/${sessionId}/artifacts`) {
            const body = structuredClone(originalArtifacts);
            body.artifacts = body.artifacts.map(amendRecord);
            const preview = structuredClone(body.artifacts[0]);
            preview.name = `${name}.v1.pdf`;
            preview.head_artifact_id = pdfId;
            preview.versions = preview.versions.map((version: Record<string, unknown>) => ({
              ...version,
              artifact_id: pdfId,
              name: preview.name,
              media_type: 'application/pdf',
              sha256: hash(pdf),
              size_bytes: pdf.length,
              uri: `artifact://${pdfId}`,
              fetch_url: `/v1/artifacts/${pdfId}/bytes`,
              producer: {
                designation: 'document-rendition',
                source_artifact_id: sourceId,
                source_sha256: hash(source),
              },
            }));
            body.artifacts.push(preview);
            body.count = body.artifacts.length;
            await route.fulfill({ json: body });
          } else if (path === `/v1/artifacts/${sourceId}`) {
            await route.fulfill({
              json: {
                ...originalArtifact,
                artifact: editableArtifact,
                resolved: editableArtifact.versions[0],
              },
            });
          } else if (path === `/v1/artifacts/${sourceId}/lineage`) {
            await route.fulfill({
              json: {
                root: sourceId,
                direction: 'both',
                depth: 5,
                nodes: [
                  {
                    id: sourceId,
                    type: 'artifact',
                    name,
                    artifact_id: sourceId,
                    version: 1,
                    workspace_id: workspaceId,
                  },
                  {
                    id: 'render_preview',
                    type: 'activity',
                    tool: 'Render PDF preview',
                    status: 'success',
                  },
                  {
                    id: pdfId,
                    type: 'artifact',
                    name: `${name}.v1.pdf`,
                    artifact_id: pdfId,
                    version: 1,
                    workspace_id: workspaceId,
                  },
                ],
                edges: [
                  { from: sourceId, to: 'render_preview', type: 'used', evidence: 'hash-pair' },
                  { from: 'render_preview', to: pdfId, type: 'generated', evidence: 'hash-pair' },
                ],
              },
            });
          } else if (path === `/v1/artifacts/${sourceId}/document`) {
            if (holdRefresh) await refreshResponse;
            await route.fulfill({ json: manifest });
          } else if (path === `/v1/artifacts/${pdfId}/document`) {
            await route.fulfill({ json: pdfManifest });
          } else if (path === `/v1/artifacts/${pdfId}/document/content`) {
            await route.fulfill({ contentType: 'application/pdf', body: pdf });
          } else if (path === `/v1/artifacts/${sourceId}/bytes`) {
            await route.fulfill({ contentType: item.mime, body: source });
          } else if (path === `/v1/artifacts/${sourceId}/reviews`) {
            await route.fulfill({ json: { reviews: [] } });
          } else if (path.endsWith('/renditions')) {
            conversions.push(path);
            if (!item.saved) {
              expect(route.request().method()).toBe('POST');
              expect(url.searchParams.get('session_id')).toBe(sessionId);
              await conversionResponse;
              manifest.pdf_rendition_artifact_id = pdfId;
              await route.fulfill({
                json: {
                  source_artifact_id: sourceId,
                  converter: 'libreoffice',
                  artifact: pdfManifest,
                },
              });
              return;
            }
            await route.fulfill({
              status: 500,
              json: { detail: 'Saved previews must not reconvert.' },
            });
          } else {
            await route.continue();
          }
        });
        await page.goto(`/workspaces/${workspaceId}/sessions/${sessionId}`);
        // The loading shell is replaced after session hydration. Drive the
        // mounted workspace so an early click is not lost with that shell.
        await expect(page.getByRole('log', { name: 'Conversation', exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Open workspace canvas', exact: true }).click();
        await page.getByRole('button', { name: 'Open a canvas tab', exact: true }).click();
        await page.getByRole('menuitem', { name: 'Session artifacts', exact: true }).click();
        const canvas = page.getByRole('complementary', { name: 'Workspace canvas' });
        await expect(
          canvas.getByRole('button', { name: `Open ${name}.v1.pdf`, exact: true }),
        ).toHaveCount(0);
        await page.screenshot({
          path: testInfo.outputPath(`${item.extension}-deliverables.png`),
          fullPage: true,
        });
        await canvas.getByRole('button', { name: `Open ${name}`, exact: true }).click();
        if (!item.saved) {
          await expect(canvas.getByText('Rendering PDF preview…', { exact: true })).toBeVisible();
          await expect(canvas.getByText(/remains canonical/u)).toHaveCount(0);
          finishConversion();
        }
        const toolbar = canvas.locator('[data-slot="viewer-toolbar"]');
        await expect(toolbar).toHaveCount(1);
        const previewTab = toolbar.getByRole('tab', { name: 'Preview', exact: true });
        await expect(previewTab).toHaveAttribute('data-state', 'active');
        await expect
          .poll(() =>
            previewTab.evaluate((element) => getComputedStyle(element, '::after').opacity),
          )
          .toBe('1');
        await expect(canvas.getByRole('button', { name: 'Reset zoom', exact: true })).toBeVisible();
        const toolbarGeometry = await toolbar.evaluate((element) => ({
          height: element.getBoundingClientRect().height,
          width: element.clientWidth,
          scroll: element.scrollWidth,
        }));
        expect(toolbarGeometry.height).toBeLessThanOrEqual(40);
        expect(toolbarGeometry.scroll).toBeLessThanOrEqual(toolbarGeometry.width);
        await expect(toolbar.getByRole('button', { name: 'Zoom in', exact: true })).toBeVisible();
        await toolbar.getByRole('button', { name: 'File actions', exact: true }).click();
        await page
          .getByRole('menuitem', { name: 'Copy to another workspace', exact: true })
          .click();
        await expect(
          page.getByRole('dialog', { name: 'Copy to another workspace', exact: true }),
        ).toBeVisible();
        await page.getByRole('button', { name: 'Cancel', exact: true }).click();
        const download = page.waitForEvent('download');
        await toolbar
          .getByRole('group', { name: 'File download', exact: true })
          .getByRole('button', { name: /^Download /u })
          .click();
        const saved = await download;
        expect(saved.suggestedFilename()).toBe(name);
        const savedPath = await saved.path();
        expect(savedPath).not.toBeNull();
        expect(hash(readFileSync(savedPath!))).toBe(hash(source));
        await page.screenshot({
          path: testInfo.outputPath(`${item.extension}-shared-toolbar.png`),
          fullPage: true,
        });
        await toolbar.screenshot({
          path: testInfo.outputPath(`${item.extension}-preview-tab.png`),
        });
        await toolbar.getByRole('tab', { name: 'Lineage', exact: true }).click();
        await expect(canvas.getByText('Render PDF preview', { exact: true })).toBeVisible();
        await toolbar.screenshot({
          path: testInfo.outputPath(`${item.extension}-lineage-tab.png`),
        });
        if (layout.name === 'phone') {
          await page.evaluate(() => window.document.documentElement.classList.add('dark'));
          await toolbar.screenshot({
            path: testInfo.outputPath(`${item.extension}-dark-lineage-tab.png`),
          });
          await page.evaluate(() => window.document.documentElement.classList.remove('dark'));
        }
        await previewTab.click();
        await canvas.getByRole('button', { name: 'Maximize canvas', exact: true }).click();
        const document = canvas.getByRole('region', { name: 'Document workspace' });
        await expect(
          document.getByText(`${item.pages} ${item.pages === 1 ? 'page' : 'pages'}`, {
            exact: true,
          }),
        ).toBeVisible();
        await expect(canvas.getByRole('button', { name: 'Use paged PDF view' })).toHaveCount(0);
        await expect(canvas.getByRole('button', { name: 'Zoom in' })).toBeVisible();
        await expect(document.getByText(item.text, { exact: true })).toBeVisible();
        await expect(document.locator('.react-pdf__Page__canvas').first()).toBeVisible();
        const pageCanvas = document.locator('.react-pdf__Page__canvas').first();
        const pdfScroller = document.locator('[data-pdf-scroller]');
        const fittedPage = document.locator('[data-page]').first();
        const pageFits = () =>
          fittedPage.evaluate((element) => {
            const host = element.closest<HTMLElement>('[data-pdf-scroller]')!;
            const bounds = element.getBoundingClientRect();
            return (
              bounds.width + 24 <= host.clientWidth + 1 &&
              bounds.height + 24 <= host.clientHeight + 1
            );
          });
        await expect.poll(pageFits).toBe(true);
        const windowGeometry = await page.evaluate(() => ({
          width: innerWidth,
          density: devicePixelRatio,
        }));
        await pdfScroller.hover();
        await page.keyboard.down('Control');
        await page.mouse.wheel(0, 120);
        await page.keyboard.up('Control');
        await expect(canvas.getByRole('button', { name: 'Reset zoom', exact: true })).toHaveText(
          '85%',
        );
        expect(
          await page.evaluate(() => ({ width: innerWidth, density: devicePixelRatio })),
        ).toEqual(windowGeometry);
        await canvas.getByRole('button', { name: 'Reset zoom', exact: true }).click();
        await expect(canvas.getByRole('button', { name: 'Reset zoom', exact: true })).toHaveText(
          '100%',
        );
        await expect.poll(pageFits).toBe(true);
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
        await canvas.getByRole('button', { name: 'Export to…', exact: true }).click();
        await expect(page.getByRole('menuitem', { name: 'PDF', exact: true })).toBeVisible();
        const pdfDownload = page.waitForEvent('download');
        await page.getByRole('menuitem', { name: 'PDF', exact: true }).click();
        const downloadedPdf = await pdfDownload;
        expect(downloadedPdf.suggestedFilename()).toMatch(/\.pdf$/u);
        const downloadedStream = await downloadedPdf.createReadStream();
        const downloadedChunks: Buffer[] = [];
        for await (const chunk of downloadedStream!) downloadedChunks.push(Buffer.from(chunk));
        expect(hash(Buffer.concat(downloadedChunks))).toBe(hash(pdf));
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
        const lineageTab = toolbar.getByRole('tab', { name: 'Lineage', exact: true });
        await lineageTab.click();
        await expect(lineageTab).toHaveAttribute('data-state', 'active');
        await expect
          .poll(() =>
            lineageTab.evaluate((element) => getComputedStyle(element, '::after').opacity),
          )
          .toBe('1');
        await expect
          .poll(() =>
            previewTab.evaluate((element) => getComputedStyle(element, '::after').opacity),
          )
          .toBe('0');
        await expect(canvas.getByText('Render PDF preview', { exact: true })).toBeVisible();
        const graph = canvas.getByRole('region', { name: 'Artifact lineage graph', exact: true });
        const sourceNode = graph.getByTestId(`rf__node-${sourceId}`);
        const previewNode = graph.getByTestId(`rf__node-${pdfId}`);
        await expect(sourceNode).toBeVisible();
        await expect(previewNode).toBeVisible();
        await expect(sourceNode).toContainText(name);
        await expect(previewNode).toContainText(`${name}.v1.pdf`);
        const sourceBounds = await sourceNode.boundingBox();
        const previewBounds = await previewNode.boundingBox();
        expect(sourceBounds!.x).toBeLessThan(previewBounds!.x);
        await page.screenshot({
          path: testInfo.outputPath(`${item.extension}-preview-lineage.png`),
          fullPage: true,
        });
        await toolbar.getByRole('tab', { name: 'Versions', exact: true }).click();
        await expect(toolbar.getByRole('tab', { name: 'Versions', exact: true })).toHaveAttribute(
          'data-state',
          'active',
        );
        await previewTab.click();
        holdRefresh = true;
        await canvas
          .getByRole('button', { name: 'Refresh document revision', exact: true })
          .click();
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
        expect(conversions).toEqual(item.saved ? [] : [`/v1/artifacts/${sourceId}/renditions`]);
        expect(errors).toEqual([]);
      });
    }
  });
}
