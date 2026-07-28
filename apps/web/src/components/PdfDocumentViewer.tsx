import { createEffect, onCleanup } from 'solid-js';
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import pdfWorkerUrl from './pdfWorkerCompat.ts?worker&url';
import type { DocumentAnchor } from '@clio/core';
import { ensurePdfJsRuntimeCompatibility } from './pdfJsCompatibility.js';

interface PdfDocumentViewerProps {
  blob: Blob;
  onSelection: (anchor: DocumentAnchor, rect: DOMRect) => void;
}

interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

function isTextItem(value: unknown): value is PdfTextItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<PdfTextItem>;
  return typeof item.str === 'string' && Array.isArray(item.transform);
}

function selectionQuads(range: Range, page: HTMLElement): number[][] {
  const pageRect = page.getBoundingClientRect();
  if (!pageRect.width || !pageRect.height) return [];
  return Array.from(range.getClientRects())
    .filter((rect) => rect.width > 0 && rect.height > 0)
    .map((rect) => {
      const left = Math.max(0, Math.min(1, (rect.left - pageRect.left) / pageRect.width));
      const right = Math.max(0, Math.min(1, (rect.right - pageRect.left) / pageRect.width));
      const top = Math.max(0, Math.min(1, (rect.top - pageRect.top) / pageRect.height));
      const bottom = Math.max(0, Math.min(1, (rect.bottom - pageRect.top) / pageRect.height));
      return [left, top, right, top, right, bottom, left, bottom];
    });
}

interface LoadedPdf {
  pdf: PDFDocumentProxy;
  task: PDFDocumentLoadingTask;
}

async function renderPdf(
  host: HTMLElement,
  blob: Blob,
  signal: AbortSignal,
): Promise<LoadedPdf> {
  ensurePdfJsRuntimeCompatibility();
  const { GlobalWorkerOptions, Util, getDocument } = await import('pdfjs-dist');
  GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const task = getDocument({ data: bytes });
  const abort = () => void task.destroy();
  signal.addEventListener('abort', abort, { once: true });
  try {
    const pdf = await task.promise;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      if (signal.aborted) throw new DOMException('PDF render cancelled', 'AbortError');
      const page = await pdf.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const available = Math.max(320, host.clientWidth - 36);
      const scale = Math.min(1.65, available / baseViewport.width);
      const viewport = page.getViewport({ scale });
      const pageElement = document.createElement('section');
      pageElement.className = 'document-pdf__page';
      pageElement.dataset.pageIndex = String(pageNumber - 1);
      pageElement.style.width = `${viewport.width}px`;
      pageElement.style.height = `${viewport.height}px`;

      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas 2D context is unavailable');
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      pageElement.append(canvas);

      const textLayer = document.createElement('div');
      textLayer.className = 'document-pdf__text-layer';
      const textContent = await page.getTextContent();
      for (const rawItem of textContent.items) {
        if (!isTextItem(rawItem) || !rawItem.str) continue;
        const transform = Util.transform(viewport.transform, rawItem.transform);
        const fontHeight = Math.hypot(transform[2], transform[3]);
        const span = document.createElement('span');
        span.textContent = rawItem.str;
        span.style.left = `${transform[4]}px`;
        span.style.top = `${transform[5] - fontHeight}px`;
        span.style.fontSize = `${fontHeight}px`;
        span.style.transform = `scaleX(${rawItem.width > 0 ? (rawItem.width * scale) / Math.max(span.offsetWidth, rawItem.width * scale) : 1})`;
        textLayer.append(span);
      }
      pageElement.append(textLayer);
      if (signal.aborted) throw new DOMException('PDF render cancelled', 'AbortError');
      host.append(pageElement);
      await page.render({
        canvas,
        canvasContext: context,
        viewport,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
      }).promise;
    }
    return { pdf, task };
  } finally {
    signal.removeEventListener('abort', abort);
  }
}

export function PdfDocumentViewer(props: PdfDocumentViewerProps) {
  let host: HTMLDivElement | undefined;

  createEffect(() => {
    const blob = props.blob;
    if (!host) return;
    const controller = new AbortController();
    let completedTask: PDFDocumentLoadingTask | undefined;
    host.replaceChildren();
    void renderPdf(host, blob, controller.signal)
      .then((loaded) => {
        if (controller.signal.aborted) void loaded.task.destroy();
        else completedTask = loaded.task;
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted && host) {
          host.textContent = `Could not render PDF: ${error instanceof Error ? error.message : String(error)}`;
          host.classList.add('document-pdf--error');
        }
      });
    onCleanup(() => {
      controller.abort();
      void completedTask?.destroy();
    });
  });

  function captureSelection() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount || !host) return;
    const range = selection.getRangeAt(0);
    const page =
      range.commonAncestorContainer.parentElement?.closest<HTMLElement>('.document-pdf__page');
    if (!page || !host.contains(page)) return;
    const exact = selection.toString().trim();
    const quads = selectionQuads(range, page);
    if (!exact || !quads.length) return;
    props.onSelection(
      {
        profile: 'pdf-quad',
        exact,
        page_index: Number(page.dataset.pageIndex ?? 0),
        quads,
      },
      range.getBoundingClientRect(),
    );
  }

  return (
    <div ref={host} class="document-pdf" data-testid="document-pdf" onMouseUp={captureSelection} />
  );
}
