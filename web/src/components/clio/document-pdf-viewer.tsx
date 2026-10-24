import type { DocumentAnchor } from '@clio/core/v3';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { ViewerZoomControls } from './viewer-zoom-controls';
import { PDF_PAGE_GAP_PX } from '@/lib/runtime-limits';
import {
  estimatedPdfPageHeight,
  fitPdfPageWidth,
  pdfPageNumbers,
  pdfPageWindow,
  pdfRenderDensity,
} from './document-pdf-window';
import { ClioStatus } from './status';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.15;

export function ClioDocumentPdfViewer({
  bytes,
  fit = 'page',
  initialPage,
  name,
  onSelection,
}: {
  bytes: Uint8Array;
  fit?: 'page' | 'width';
  /** Opens on this 1-based page instead of the first, when the caller already
   * knows which page matters (e.g. a view_pdf call's viewed page range). */
  initialPage?: number;
  name: string;
  onSelection: (anchor: DocumentAnchor) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pageCount, setPageCount] = useState(0);
  const [hostWidth, setHostWidth] = useState(640);
  const [scale, setScale] = useState(1);
  const [fitOverride, setFitOverride] = useState<'page'>();
  const fitMode = fitOverride ?? fit;
  const zoomIn = useCallback(() => setScale((value) => Math.min(MAX_ZOOM, value + ZOOM_STEP)), []);
  const zoomOut = useCallback(() => setScale((value) => Math.max(MIN_ZOOM, value - ZOOM_STEP)), []);
  const resetZoom = useCallback(() => {
    setFitOverride('page');
    setScale(1);
  }, []);
  const [scroll, setScroll] = useState({ top: 0, viewport: 0 });
  const [measured, setMeasured] = useState<{ geometry: string; height: number }>();
  // pdf.js transfers a typed array it is handed to its worker thread, which
  // detaches the caller's buffer — and these bytes are the cached resource
  // preview other surfaces read. One copy per document, never per render.
  const file = useMemo(() => ({ data: new Uint8Array(bytes) }), [bytes]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // clientWidth excludes the scrollbar. Reserve the scroller's 24px padding
    // and the page border so a fitted page never creates horizontal overflow.
    const update = (width: number) =>
      setHostWidth(Math.max(1, (scrollRef.current?.clientWidth || width) - 26));
    update(host.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => {
      if (entry) update(entry.contentRect.width);
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const readScroll = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    if (container.clientWidth > 0) setHostWidth(Math.max(1, container.clientWidth - 26));
    setScroll((current) =>
      current.top === container.scrollTop && current.viewport === container.clientHeight
        ? current
        : { top: container.scrollTop, viewport: container.clientHeight },
    );
  }, []);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    readScroll();
    const observer = new ResizeObserver(readScroll);
    observer.observe(container);
    return () => observer.disconnect();
  }, [readScroll]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const onWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.deltaY === 0) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.deltaY < 0) zoomIn();
      else zoomOut();
    };
    // React's delegated wheel listener can be passive. Cancel at the PDF
    // scrollport before the event reaches browser or Desktop window zoom.
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [zoomIn, zoomOut]);

  // The scroll position alone decides the page window. An initial-page anchor
  // jumps the scroll container once a real rendered page supplies its height.
  // The first page to mount (page 1, at the initial scrollTop of 0) renders before any
  // page after it can, so waiting for `measured` before computing the jump
  // trades one page-1 flash for a jump built on this document's true page
  // height rather than the generic aspect-ratio estimate. Guarded by a ref,
  // not state, so it fires exactly once and never fights a later resize/zoom
  // remeasurement or the reader's own scrolling.
  const scrolledToInitialPageRef = useRef(false);
  useEffect(() => {
    if (scrolledToInitialPageRef.current) return;
    if (!initialPage || initialPage <= 1) {
      scrolledToInitialPageRef.current = true;
      return;
    }
    if (!measured) return;
    const container = scrollRef.current;
    if (!container) return;
    scrolledToInitialPageRef.current = true;
    container.scrollTop = Math.max(0, (Math.min(initialPage, pageCount) - 1) * measured.height);
    readScroll();
  }, [initialPage, measured, pageCount, readScroll]);

  // A rendered page is the only honest page height. The estimate stands in
  // until one exists, and a measurement taken at a different width or zoom is
  // discarded rather than trusted at the new geometry.
  const readingHeight = scroll.viewport > 0 ? Math.max(1, scroll.viewport - 26) : 0;
  const pageWidth =
    fitMode === 'page' ? fitPdfPageWidth({ hostWidth, viewportHeight: readingHeight }) : hostWidth;
  const geometry = `${fitMode}:${hostWidth}:${readingHeight}:${scale}`;
  const measurePage = useCallback(
    (element: HTMLDivElement | null) => {
      if (!element) return;
      const height = element.getBoundingClientRect().height;
      if (height > 0) setMeasured({ geometry, height: height + PDF_PAGE_GAP_PX });
    },
    [geometry],
  );
  const pageHeightPx =
    measured?.geometry === geometry ? measured.height : estimatedPdfPageHeight(pageWidth * scale);
  const pageWindow = pdfPageWindow({
    pageCount,
    pageHeightPx,
    scrollTop: scroll.top,
    viewportHeight: scroll.viewport,
  });
  const windowedPages = pdfPageNumbers(pageWindow);

  const captureSelection = () => {
    const selection = window.getSelection();
    const host = hostRef.current;
    if (!selection || selection.isCollapsed || !selection.rangeCount || !host) return;
    const range = selection.getRangeAt(0);
    const page = range.commonAncestorContainer.parentElement?.closest<HTMLElement>('[data-page]');
    if (!page || !host.contains(page)) return;
    const exact = selection.toString().trim();
    const pageRect = page.getBoundingClientRect();
    if (!exact || !pageRect.width || !pageRect.height) return;
    const quads = Array.from(range.getClientRects())
      .filter((rect) => rect.width > 0 && rect.height > 0)
      .map((rect) => {
        const left = bounded((rect.left - pageRect.left) / pageRect.width);
        const right = bounded((rect.right - pageRect.left) / pageRect.width);
        const top = bounded((rect.top - pageRect.top) / pageRect.height);
        const bottom = bounded((rect.bottom - pageRect.top) / pageRect.height);
        return [left, top, right, top, right, bottom, left, bottom];
      });
    if (!quads.length) return;
    const pageIndex = Number(page.dataset.page);
    onSelection({
      profile: 'pdf-quad',
      exact,
      page_index: Number.isInteger(pageIndex) ? pageIndex : 0,
      quads,
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col" ref={hostRef}>
      <ViewerZoomControls
        percent={scale * 100}
        onIn={zoomIn}
        onOut={zoomOut}
        onFit={resetZoom}
        disabledIn={scale >= MAX_ZOOM}
        disabledOut={scale <= MIN_ZOOM}
        labels={{
          in: 'Zoom in',
          out: 'Zoom out',
          reset: 'Reset zoom',
          fit: 'Fit document to view',
          menu: 'PDF actions',
          group: 'PDF zoom',
        }}
      />
      {/* The page window follows this element's scroll position, so the viewer
          owns its scroll region rather than riding whichever ancestor happens
          to scroll — every host has to give it a bounded box. */}
      <div
        className="min-h-0 flex-1 overflow-auto px-3 py-3"
        data-pdf-scroller=""
        onScroll={readScroll}
        ref={scrollRef}
      >
        <Document
          error={
            <ClioStatus
              detail={`Could not render ${name}.`}
              label="PDF unavailable"
              value="failed"
            />
          }
          file={file}
          loading={<p className="p-4 text-sm text-muted-foreground">Loading PDF…</p>}
          onLoadSuccess={({ numPages }) => setPageCount(numPages)}
        >
          <div className="grid gap-3">
            <div
              aria-hidden="true"
              data-pdf-spacer="leading"
              style={{
                height: `${pageWindow.leadingSpacerPx}px`,
                display: pageWindow.leadingSpacerPx > 0 ? undefined : 'none',
              }}
            />
            {windowedPages.map((visiblePage) => (
              <PdfPage
                key={visiblePage}
                fit={fitMode}
                onMeasure={visiblePage === pageWindow.first ? measurePage : undefined}
                onMouseUp={captureSelection}
                pageNumber={visiblePage}
                scale={scale}
                width={hostWidth}
                viewportHeight={readingHeight}
              />
            ))}
            <div
              aria-hidden="true"
              data-pdf-spacer="trailing"
              style={{
                height: `${pageWindow.trailingSpacerPx}px`,
                display: pageWindow.trailingSpacerPx > 0 ? undefined : 'none',
              }}
            />
          </div>
        </Document>
      </div>
      <footer className="shrink-0 border-t px-3 py-1 font-mono text-[10px] text-muted-foreground">
        {pageCount ? `${pageCount} ${pageCount === 1 ? 'page' : 'pages'}` : 'Loading pages…'}
      </footer>
    </div>
  );
}

function PdfPage({
  fit,
  onMeasure,
  onMouseUp,
  pageNumber,
  scale,
  width,
  viewportHeight,
}: {
  fit: 'page' | 'width';
  onMeasure?: (element: HTMLDivElement | null) => void;
  onMouseUp: () => void;
  pageNumber: number;
  scale: number;
  width: number;
  viewportHeight: number;
}) {
  const pageRef = useRef<HTMLDivElement>(null);
  const [aspectRatio, setAspectRatio] = useState(11 / 8.5);
  const fittedWidth =
    fit === 'page' ? fitPdfPageWidth({ hostWidth: width, viewportHeight, aspectRatio }) : width;

  return (
    <div
      className="mx-auto w-fit overflow-hidden rounded-lg border bg-card shadow-sm"
      data-page={pageNumber - 1}
      onMouseUp={onMouseUp}
      ref={pageRef}
    >
      <Page
        devicePixelRatio={pdfRenderDensity({
          width: fittedWidth * scale,
          aspectRatio,
          displayDensity: window.devicePixelRatio,
        })}
        onLoadSuccess={(page) => {
          const viewport = page.getViewport({ scale: 1 });
          setAspectRatio(viewport.height / viewport.width);
        }}
        onRenderSuccess={() => onMeasure?.(pageRef.current)}
        pageNumber={pageNumber}
        renderAnnotationLayer
        renderTextLayer
        scale={scale}
        width={fittedWidth}
      />
    </div>
  );
}

function bounded(value: number) {
  return Math.max(0, Math.min(1, value));
}
