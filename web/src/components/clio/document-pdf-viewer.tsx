import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { ViewerZoomControls } from './viewer-zoom-controls';
import { frameKeyRegion } from './file-viewer-modes';
import { useShortcut } from '@/lib/shortcuts/hooks';
import { FILE_SIZE_FACT, useFileViewerFacts } from './file-viewer-facts';
import { PDF_FLING_PX_PER_MS, PDF_FLING_SETTLE_MS, PDF_PAGE_GAP_PX } from '@/lib/runtime-limits';
import {
  estimatedPdfPageHeight,
  fitPdfPageWidth,
  pdfPageNumbers,
  pdfPageWindow,
  pdfRenderDensity,
} from './document-pdf-window';
import { StateView } from './primitives/state-view';
import { useCommentSession } from './comments/comment-session';
import { useSelectionMarkCommenter, type SelectionMark } from '@/hooks/use-selection-action-file';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

/** Page fit: zooming out stops here. */
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.15;

/** A box to show on one page: 0-based page, and x, y, width, height as fractions of it. */
export interface PdfHighlight {
  page: number;
  rect: [number, number, number, number];
}

export function ClioDocumentPdfViewer({
  bytes,
  fit = 'page',
  initialPage,
  name,
  highlight,
  onPagePoint,
  pageFacts = false,
}: {
  bytes: Uint8Array;
  fit?: 'page' | 'width';
  /** Opens on this 1-based page instead of the first, when the caller already
   * knows which page matters (e.g. a view_pdf call's viewed page range). */
  initialPage?: number;
  name: string;
  /** Outlined on its page and scrolled into view when it changes (LaTeX click-through). */
  highlight?: PdfHighlight;
  /** A double-click on a page, as its 0-based index and the point as fractions of the page. */
  onPagePoint?: (page: number, x: number, y: number) => void;
  /** States "12 pages" and the size as the frame's facts (frame-bar 07), for a PDF file itself. */
  pageFacts?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [hostElement, setHostElement] = useState<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pageCount, setPageCount] = useState(0);
  const [hostWidth, setHostWidth] = useState(640);
  const [scale, setScale] = useState(1);
  // A width-fitted viewer (LaTeX) zooms out to the whole page, where zooming out stops.
  const [fitOverride, setFitOverride] = useState<'page'>();
  const fitMode = fitOverride ?? fit;
  const atFit = scale <= MIN_ZOOM && fitMode === 'page';
  const zoomIn = useCallback(() => setScale((value) => Math.min(MAX_ZOOM, value + ZOOM_STEP)), []);
  const zoomOut = useCallback(() => {
    if (scale > MIN_ZOOM + 1e-6) setScale(Math.max(MIN_ZOOM, scale - ZOOM_STEP));
    else setFitOverride('page');
  }, [scale]);
  const resetZoom = useCallback(() => {
    setScale(MIN_ZOOM);
    setFitOverride(undefined);
  }, []);
  const [scroll, setScroll] = useState({ top: 0, viewport: 0 });
  const [flinging, setFlinging] = useState(false);
  const lastScrollRef = useRef({ top: 0, at: 0 });
  const settleRef = useRef<number | undefined>(undefined);
  const [measured, setMeasured] = useState<{ geometry: string; height: number }>();
  // pdf.js transfers a typed array it is handed to its worker thread, which
  // detaches the caller's buffer — and these bytes are the cached resource
  // preview other surfaces read. One copy per document, never per render.
  const file = useMemo(() => ({ data: new Uint8Array(bytes) }), [bytes]);
  // While new bytes load, the pages are gone and the scroller is back at the top.
  const [loadedFile, setLoadedFile] = useState<typeof file>();
  const loaded = loadedFile === file;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // clientWidth excludes the scrollbar. Reserve the scroller's 24px padding
    // and the page border so a fitted page never creates horizontal overflow.
    const update = (width: number) => {
      // Hidden (under Lineage, or in a background tab) the host measures 0: keep the
      // last geometry instead of re-rendering every mounted page at 1px and back.
      if (!isRendered(host)) return;
      setHostWidth(Math.max(1, (scrollRef.current?.clientWidth || width) - 26));
    };
    update(host.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => {
      if (entry) update(entry.contentRect.width);
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  // Set while the scroller is hidden: shown again, it may come back at the top.
  const hiddenRef = useRef(false);
  const readScroll = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    if (!isRendered(container)) {
      hiddenRef.current = true;
      return;
    }
    if (container.clientWidth > 0) setHostWidth(Math.max(1, container.clientWidth - 26));
    // A fling passes pages faster than pdf.js can paint them: pages entering the window
    // keep their sized card until the scroll settles, instead of each painting in passing.
    const now = performance.now();
    const last = lastScrollRef.current;
    const speed = Math.abs(container.scrollTop - last.top) / Math.max(1, now - last.at);
    lastScrollRef.current = { top: container.scrollTop, at: now };
    if (speed > PDF_FLING_PX_PER_MS) {
      setFlinging(true);
      window.clearTimeout(settleRef.current);
      settleRef.current = window.setTimeout(() => setFlinging(false), PDF_FLING_SETTLE_MS);
    }
    setScroll((current) =>
      current.top === container.scrollTop && current.viewport === container.clientHeight
        ? current
        : { top: container.scrollTop, viewport: container.clientHeight },
    );
  }, []);
  useEffect(() => () => window.clearTimeout(settleRef.current), []);
  // The viewer's own jump lands on its page rather than flinging past the pages
  // between, so the pages it lands on paint at once.
  const jumpTo = useCallback(
    (container: HTMLElement, top: number) => {
      container.scrollTop = top;
      lastScrollRef.current = { top: container.scrollTop, at: performance.now() };
      readScroll();
    },
    [readScroll],
  );

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

  // A new highlight scrolls its page into view, then its box within the page.
  useEffect(() => {
    if (!highlight) return;
    const container = scrollRef.current;
    if (!container) return;
    // A mounted page gives its true place; otherwise its estimated place brings it in.
    const page = container.querySelector<HTMLElement>(`[data-page="${highlight.page}"]`);
    const pageHeight = page?.offsetHeight ?? measured?.height ?? container.clientHeight;
    const pageTop = page
      ? page.getBoundingClientRect().top -
        container.getBoundingClientRect().top +
        container.scrollTop
      : highlight.page * pageHeight;
    jumpTo(
      container,
      Math.max(0, pageTop + highlight.rect[1] * pageHeight - container.clientHeight / 3),
    );
  }, [highlight, jumpTo, measured]);

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

  // The scroll position alone decides the page window. An initial-page anchor
  // jumps the scroll container once a real rendered page supplies its height at
  // the current geometry. The first page to mount (page 1, at the initial
  // scrollTop of 0) renders before any page after it can, so waiting for that
  // measurement trades one page-1 flash for a jump built on this document's
  // true page height rather than the generic aspect-ratio estimate. Until the
  // reader scrolls away from it, the anchor holds: a host still settling its
  // size (a transcript card laying out) changes the page height, and the jump is
  // redone at the new height instead of leaving the view dozens of pages early.
  const initialJumpRef = useRef<{ top: number } | 'done'>(undefined);
  useEffect(() => {
    const jumped = initialJumpRef.current;
    if (jumped === 'done') return;
    if (!initialPage || initialPage <= 1) {
      initialJumpRef.current = 'done';
      return;
    }
    if (!pageCount || measured?.geometry !== geometry) return;
    const container = scrollRef.current;
    if (!container) return;
    if (jumped && Math.abs(container.scrollTop - jumped.top) > 1) {
      initialJumpRef.current = 'done';
      return;
    }
    jumpTo(container, Math.max(0, (Math.min(initialPage, pageCount) - 1) * measured.height));
    initialJumpRef.current = { top: container.scrollTop };
  }, [geometry, initialPage, jumpTo, measured, pageCount]);
  const pageWindow = pdfPageWindow({
    pageCount,
    pageHeightPx,
    scrollTop: scroll.top,
    viewportHeight: scroll.viewport,
  });
  const windowedPages = pdfPageNumbers(pageWindow);
  // The page whose upper half has reached the top of the view, so short pages that all fit
  // still read as page 1; the end of a scrolled document is its last page.
  const pageStride = Math.max(1, pageHeightPx);
  // The reader's place is a page and a point within it, not a pixel offset: a narrower
  // host, a change of fit or a zoom step changes every page's height, and the same
  // scrollTop would then show another page (or clamp at the end). Whenever the page
  // height changes, or a hidden scroller is shown or a document reloaded, the view
  // returns to that place.
  const anchorRef = useRef<{ stride: number; page: number }>(undefined);
  // Set from a return to the anchor until it lands: pages below still laying out can
  // stop it short, and that position isn't the reader's. Their own input ends it.
  const restoringRef = useRef(false);
  const retryRef = useRef<number>(undefined);
  const restore = useCallback(
    (container: HTMLElement) => {
      const step = (attempt: number) => {
        window.cancelAnimationFrame(retryRef.current ?? 0);
        const anchor = anchorRef.current;
        if (!anchor) return;
        const top = anchor.page * anchor.stride;
        restoringRef.current = true;
        if (Math.abs(container.scrollTop - top) > 1) jumpTo(container, top);
        if (Math.abs(container.scrollTop - top) <= 1 || attempt >= 60) {
          restoringRef.current = false;
          return;
        }
        retryRef.current = window.requestAnimationFrame(() => {
          if (restoringRef.current) step(attempt + 1);
        });
      };
      step(0);
    },
    [jumpTo],
  );
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const release = () => {
      restoringRef.current = false;
      window.cancelAnimationFrame(retryRef.current ?? 0);
    };
    const events = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;
    for (const type of events) container.addEventListener(type, release, { passive: true });
    return () => {
      release();
      for (const type of events) container.removeEventListener(type, release);
    };
  }, []);
  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!loaded) {
      if (anchorRef.current) hiddenRef.current = true;
      return;
    }
    if (!container || !pageCount || !isRendered(container)) return;
    const anchor = anchorRef.current;
    if (anchor && (hiddenRef.current || Math.abs(anchor.stride - pageStride) > 0.5)) {
      hiddenRef.current = false;
      anchorRef.current = { stride: pageStride, page: anchor.page };
      restore(container);
      return;
    }
    hiddenRef.current = false;
    if (anchor && restoringRef.current) return;
    anchorRef.current = { stride: pageStride, page: scroll.top / pageStride };
  }, [loaded, pageCount, pageStride, restore, scroll.top]);
  const atEnd = scroll.top > 0 && scroll.top + scroll.viewport >= pageCount * pageStride - 1;
  const currentPage = atEnd
    ? pageCount
    : Math.min(
        pageCount,
        Math.max(
          1,
          Math.floor((scroll.top + Math.min(scroll.viewport, pageStride) / 2) / pageStride) + 1,
        ),
      );
  const pageFact = pageCount ? `${currentPage} / ${pageCount}` : undefined;
  // PgUp and PgDn turn whole pages, wherever focus is in the frame showing this PDF.
  const pageRegion = useMemo(
    () => ({
      get current(): Element | null {
        const host = hostRef.current;
        if (!host?.isConnected || !host.getClientRects().length) return null;
        const frame = host.closest('[data-slot="file-viewer"]');
        return frame ? frameKeyRegion(frame) : host;
      },
    }),
    [],
  );
  useShortcut(
    'pdf-page',
    (event) => {
      const container = scrollRef.current;
      if (!container || !pageCount || pageStride <= 0) return;
      // Step from the page at the scroll top: at the bottom the readout can show a
      // later page than the one the top edge sits on.
      const atTop = Math.min(pageCount, Math.floor((container.scrollTop + 4) / pageStride) + 1);
      // Back from partway down a page goes to its own top first.
      const partway = container.scrollTop > (atTop - 1) * pageStride + 4;
      const step = event.key === 'PageUp' ? (partway ? 0 : -1) : 1;
      const target = Math.min(pageCount, Math.max(1, atTop + step));
      jumpTo(container, (target - 1) * pageStride);
    },
    { region: pageRegion, enabled: pageCount > 0 },
  );
  useFileViewerFacts(
    pageFacts && pageCount
      ? [`${pageCount} ${pageCount === 1 ? 'page' : 'pages'}`, FILE_SIZE_FACT]
      : undefined,
  );
  const zoomFact = Math.abs(scale - 1) > 1e-6 ? `${Math.round(scale * 100)}%` : undefined;
  // The page sits between zoom − and + (frame-bar 07), so the bar's fact is the size.
  const pageCounter = pageFact ? (
    <span title={`Page ${currentPage} of ${pageCount}`}>
      <span aria-hidden="true">{pageFact}</span>
      <span className="sr-only">
        Page {currentPage} of {pageCount}
      </span>
    </span>
  ) : null;

  // The viewer makes its own text marks (pdf-quad): in a comment session's text mode a
  // selection becomes one at once, and the selection menu's Comment makes one too.
  const session = useCommentSession();
  useSelectionMarkCommenter(hostElement, (selection) =>
    hostElement ? pdfSelectionMark(selection, hostElement) : undefined,
  );
  const captureSelection = useCallback(() => {
    const selection = window.getSelection();
    if (!session?.active || session.mode !== 'text' || !selection || !hostRef.current) return;
    const mark = pdfSelectionMark(selection, hostRef.current);
    if (!mark) return;
    session.addMark(mark.anchor, mark.place);
    selection.removeAllRanges();
  }, [session]);

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      // A surrounding CommentCapture leaves selections in here to the viewer's own
      // pdf-quad marks; a mouse, touch or keyboard selection all reach it.
      data-comment-text="own"
      onKeyUp={(event) => {
        if (event.shiftKey) captureSelection();
      }}
      onTouchEnd={captureSelection}
      ref={(element) => {
        hostRef.current = element;
        setHostElement(element);
      }}
    >
      <ViewerZoomControls
        label="PDF zoom"
        onIn={zoomIn}
        onOut={zoomOut}
        onReset={resetZoom}
        disabledIn={scale >= MAX_ZOOM}
        disabledOut={atFit}
        readout={
          pageCounter || zoomFact ? (
            <>
              {pageCounter}
              {zoomFact ? <span>{zoomFact}</span> : null}
            </>
          ) : undefined
        }
      >
        <span
          className="flex min-w-0 flex-1 gap-2 truncate px-1.5 text-[11px] text-muted-foreground tabular-nums"
          data-slot="pdf-page-counter"
        >
          {pageCounter}
          {zoomFact ? <span>{zoomFact}</span> : null}
        </span>
      </ViewerZoomControls>
      {/* The page window follows this element's scroll position, so the viewer
          owns its scroll region rather than riding whichever ancestor happens
          to scroll — every host has to give it a bounded box. Scroll anchoring
          is off: pages mounting at full size above a jump target would make
          the browser shift scrollTop and land several pages late. */}
      <div
        aria-label={pageCount ? `${name}, page ${currentPage} of ${pageCount}` : name}
        className="min-h-0 flex-1 overflow-auto [overflow-anchor:none] px-3 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        data-pdf-scroller=""
        onScroll={readScroll}
        ref={scrollRef}
        role="region"
        tabIndex={0}
      >
        <Document
          error={<StateView kind="error" size="viewer" title={`Couldn't read ${name}`} />}
          file={file}
          loading={<StateView kind="loading" size="viewer" title={`Loading ${name}`} />}
          onLoadSuccess={({ numPages }) => {
            setPageCount(numPages);
            setLoadedFile(file);
          }}
        >
          {/* No transitions on the page boxes: a spacer's height must hold the moment it
              is set, or a return to the reader's place clamps against the old extent
              (the reduced-motion rule gives every property a 1ms duration). */}
          <div className="grid gap-3 [&_*]:transition-none">
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
                highlight={highlight?.page === visiblePage - 1 ? highlight.rect : undefined}
                onPagePoint={onPagePoint}
                onMeasure={visiblePage === pageWindow.first ? measurePage : undefined}
                onMouseUp={captureSelection}
                pageCount={pageCount}
                pageNumber={visiblePage}
                paint={!flinging}
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
    </div>
  );
}

// Memoized: a scroll re-renders the viewer, and a page that stays in the window keeps
// its rendered canvas and text layer without reconciling them again.
const PdfPage = memo(function PdfPage({
  fit,
  highlight,
  onMeasure,
  onMouseUp,
  onPagePoint,
  pageCount,
  pageNumber,
  paint,
  scale,
  width,
  viewportHeight,
}: {
  fit: 'page' | 'width';
  highlight?: [number, number, number, number];
  onMeasure?: (element: HTMLDivElement | null) => void;
  onMouseUp: () => void;
  onPagePoint?: (page: number, x: number, y: number) => void;
  pageCount: number;
  pageNumber: number;
  /** False while the reader flings past: an unpainted page holds its size until then. */
  paint: boolean;
  scale: number;
  width: number;
  viewportHeight: number;
}) {
  const pageRef = useRef<HTMLDivElement>(null);
  const [aspectRatio, setAspectRatio] = useState(11 / 8.5);
  // Once painted, a page keeps its canvas through later flings while it stays mounted.
  const [painted, setPainted] = useState(paint);
  if (paint && !painted) setPainted(true);
  const fittedWidth =
    fit === 'page' ? fitPdfPageWidth({ hostWidth: width, viewportHeight, aspectRatio }) : width;

  return (
    <div
      aria-label={`Page ${pageNumber} of ${pageCount}`}
      className="relative mx-auto w-fit overflow-hidden rounded-lg border bg-card shadow-sm"
      data-page={pageNumber - 1}
      role="group"
      onDoubleClick={
        onPagePoint
          ? (event) => {
              const box = pageRef.current?.getBoundingClientRect();
              if (!box?.width || !box.height) return;
              onPagePoint(
                pageNumber - 1,
                bounded((event.clientX - box.left) / box.width),
                bounded((event.clientY - box.top) / box.height),
              );
            }
          : undefined
      }
      onMouseUp={onMouseUp}
      ref={pageRef}
    >
      {painted || paint ? (
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
      ) : (
        <div
          aria-hidden="true"
          data-pdf-unpainted=""
          style={{
            width: `${fittedWidth * scale}px`,
            height: `${fittedWidth * scale * aspectRatio}px`,
          }}
        />
      )}
      {highlight ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-sm bg-primary/15 ring-2 ring-primary"
          data-slot="pdf-highlight"
          style={{
            left: `${highlight[0] * 100}%`,
            top: `${highlight[1] * 100}%`,
            width: `${highlight[2] * 100}%`,
            height: `${highlight[3] * 100}%`,
          }}
        />
      ) : null}
    </div>
  );
});

/**
 * A selection on a page as a pdf-quad mark: its text and its line boxes as fractions of
 * the page it starts on (a selection across pages is placed on its first).
 */
function pdfSelectionMark(selection: Selection, host: HTMLElement): SelectionMark | undefined {
  if (selection.isCollapsed || !selection.rangeCount) return undefined;
  const range = selection.getRangeAt(0);
  const start =
    range.startContainer instanceof Element
      ? range.startContainer
      : range.startContainer.parentElement;
  const page = start?.closest<HTMLElement>('[data-page]');
  if (!page || !host.contains(page)) return undefined;
  const exact = selection.toString().trim();
  const pageRect = page.getBoundingClientRect();
  if (!exact || !pageRect.width || !pageRect.height) return undefined;
  const rects = Array.from(range.getClientRects())
    .filter((rect) => rect.width > 0 && rect.height > 0)
    .filter((rect) => rect.bottom > pageRect.top && rect.top < pageRect.bottom);
  if (!rects.length) return undefined;
  const quads = rects.map((rect) => {
    const left = bounded((rect.left - pageRect.left) / pageRect.width);
    const right = bounded((rect.right - pageRect.left) / pageRect.width);
    const top = bounded((rect.top - pageRect.top) / pageRect.height);
    const bottom = bounded((rect.bottom - pageRect.top) / pageRect.height);
    return [left, top, right, top, right, bottom, left, bottom];
  });
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const pageIndex = Number(page.dataset.page);
  return {
    anchor: {
      profile: 'pdf-quad',
      exact,
      page_index: Number.isInteger(pageIndex) ? pageIndex : 0,
      quads,
    },
    place: {
      box: {
        left,
        top,
        width: Math.max(...rects.map((rect) => rect.right)) - left,
        height: Math.max(...rects.map((rect) => rect.bottom)) - top,
      },
    },
  };
}

function bounded(value: number) {
  return Math.max(0, Math.min(1, value));
}

/** Laid out on screen: a `display: none` ancestor leaves it no boxes and no size. */
function isRendered(element: HTMLElement) {
  return element.getClientRects().length > 0 || element.clientWidth > 0 || element.clientHeight > 0;
}
