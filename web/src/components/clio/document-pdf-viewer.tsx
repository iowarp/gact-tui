import type { DocumentAnchor } from '@clio/core/v3';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  SquareStackIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { Button } from '@/components/ui/button';
import { ButtonGroup, ButtonGroupText } from '@/components/ui/button-group';
import { Toggle } from '@/components/ui/toggle';
import { PDF_PAGE_GAP_PX } from '@/lib/runtime-limits';
import {
  estimatedPdfPageHeight,
  fitPdfPageWidth,
  pdfPageNumbers,
  pdfPageWindow,
} from './document-pdf-window';
import { ClioStatus } from './status';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export function ClioDocumentPdfViewer({
  bytes,
  fit = 'width',
  name,
  onSelection,
}: {
  bytes: Uint8Array;
  fit?: 'page' | 'width';
  name: string;
  onSelection: (anchor: DocumentAnchor) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [hostWidth, setHostWidth] = useState(640);
  const [scale, setScale] = useState(1);
  const [paged, setPaged] = useState(false);
  const [scroll, setScroll] = useState({ top: 0, viewport: 0 });
  const [measured, setMeasured] = useState<{ geometry: string; height: number }>();
  // pdf.js transfers a typed array it is handed to its worker thread, which
  // detaches the caller's buffer — and these bytes are the cached resource
  // preview other surfaces read. One copy per document, never per render.
  const file = useMemo(() => ({ data: new Uint8Array(bytes) }), [bytes]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const update = (width: number) => setHostWidth(Math.max(280, width - 32));
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

  // A rendered page is the only honest page height. The estimate stands in
  // until one exists, and a measurement taken at a different width or zoom is
  // discarded rather than trusted at the new geometry.
  const pageWidth =
    fit === 'page'
      ? fitPdfPageWidth({ hostWidth, viewportHeight: scroll.viewport })
      : hostWidth;
  const geometry = `${pageWidth}:${scale}`;
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
      page_index: Number.isInteger(pageIndex) ? pageIndex : pageNumber - 1,
      quads,
    });
  };

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3" ref={hostRef}>
      <div className="z-10 flex min-h-10 flex-wrap items-center gap-1.5 border-b bg-background/95 px-2 py-1 backdrop-blur">
        {paged ? (
          <ButtonGroup aria-label="PDF page navigation">
            <Button
              aria-label="Previous PDF page"
              disabled={pageNumber <= 1}
              onClick={() => setPageNumber((page) => Math.max(1, page - 1))}
              size="icon-sm"
              variant="outline"
            >
              <ChevronLeftIcon aria-hidden="true" />
            </Button>
            <ButtonGroupText className="min-w-24 justify-center px-2 font-mono text-xs">
              Page {pageNumber} of {pageCount || '…'}
            </ButtonGroupText>
            <Button
              aria-label="Next PDF page"
              disabled={!pageCount || pageNumber >= pageCount}
              onClick={() => setPageNumber((page) => Math.min(pageCount, page + 1))}
              size="icon-sm"
              variant="outline"
            >
              <ChevronRightIcon aria-hidden="true" />
            </Button>
          </ButtonGroup>
        ) : (
          <span className="px-1.5 font-mono text-xs text-muted-foreground">
            {pageCount ? `${pageCount} ${pageCount === 1 ? 'page' : 'pages'}` : 'Loading pages…'}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <ButtonGroup aria-label="PDF zoom">
            <Button
              aria-label="Zoom PDF out"
              disabled={scale <= 0.7}
              onClick={() => setScale((value) => Math.max(0.7, value - 0.15))}
              size="icon-sm"
              variant="outline"
            >
              <ZoomOutIcon aria-hidden="true" />
            </Button>
            <ButtonGroupText className="min-w-11 justify-center px-1.5 font-mono text-[10px]">
              {Math.round(scale * 100)}%
            </ButtonGroupText>
            <Button
              aria-label="Zoom PDF in"
              disabled={scale >= 1.75}
              onClick={() => setScale((value) => Math.min(1.75, value + 0.15))}
              size="icon-sm"
              variant="outline"
            >
              <ZoomInIcon aria-hidden="true" />
            </Button>
          </ButtonGroup>
          <Toggle
            aria-label="Use paged PDF view"
            onPressedChange={setPaged}
            pressed={paged}
            size="sm"
            title={paged ? 'Use continuous scroll' : 'Use paged view'}
            variant="outline"
          >
            <SquareStackIcon aria-hidden="true" />
          </Toggle>
        </div>
      </div>
      {/* The page window follows this element's scroll position, so the viewer
          owns its scroll region rather than riding whichever ancestor happens
          to scroll — every host has to give it a bounded box. */}
      <div
        className="min-h-0 overflow-auto"
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
          onLoadSuccess={({ numPages }) => {
            setPageCount(numPages);
            setPageNumber((page) => Math.min(page, numPages));
          }}
        >
          {paged ? (
            <PdfPage
              onMouseUp={captureSelection}
              pageNumber={pageNumber}
              scale={scale}
              width={pageWidth}
            />
          ) : (
            <div className="grid gap-3">
              <div
                aria-hidden="true"
                data-pdf-spacer="leading"
                style={{ height: `${pageWindow.leadingSpacerPx}px` }}
              />
              {windowedPages.map((visiblePage) => (
                <PdfPage
                  key={visiblePage}
                  onMeasure={visiblePage === pageWindow.first ? measurePage : undefined}
                  onMouseUp={captureSelection}
                  pageNumber={visiblePage}
                  scale={scale}
                  width={pageWidth}
                />
              ))}
              <div
                aria-hidden="true"
                data-pdf-spacer="trailing"
                style={{ height: `${pageWindow.trailingSpacerPx}px` }}
              />
            </div>
          )}
        </Document>
      </div>
    </div>
  );
}

function PdfPage({
  onMeasure,
  onMouseUp,
  pageNumber,
  scale,
  width,
}: {
  onMeasure?: (element: HTMLDivElement | null) => void;
  onMouseUp: () => void;
  pageNumber: number;
  scale: number;
  width: number;
}) {
  const pageRef = useRef<HTMLDivElement>(null);

  return (
    <div
      className="mx-auto w-fit overflow-hidden rounded-lg border bg-white shadow-sm"
      data-page={pageNumber - 1}
      onMouseUp={onMouseUp}
      ref={pageRef}
    >
      <Page
        onRenderSuccess={() => onMeasure?.(pageRef.current)}
        pageNumber={pageNumber}
        renderAnnotationLayer
        renderTextLayer
        scale={scale}
        width={width}
      />
    </div>
  );
}

function bounded(value: number) {
  return Math.max(0, Math.min(1, value));
}
