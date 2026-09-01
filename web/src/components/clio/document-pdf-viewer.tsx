import type { DocumentAnchor } from '@clio/core/v3';
import { ChevronLeftIcon, ChevronRightIcon, ZoomInIcon, ZoomOutIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { Button } from '@/components/ui/button';
import { ClioStatus } from './status';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export function ClioDocumentPdfViewer({
  bytes,
  name,
  onSelection,
}: {
  bytes: Uint8Array;
  name: string;
  onSelection: (anchor: DocumentAnchor) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [hostWidth, setHostWidth] = useState(640);
  const [scale, setScale] = useState(1);
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
    onSelection({ profile: 'pdf-quad', exact, page_index: pageNumber - 1, quads });
  };

  return (
    <div className="grid min-h-0 gap-3" ref={hostRef}>
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border bg-background/95 p-2 backdrop-blur">
        <Button
          aria-label="Previous PDF page"
          disabled={pageNumber <= 1}
          onClick={() => setPageNumber((page) => Math.max(1, page - 1))}
          size="icon-sm"
          variant="outline"
        >
          <ChevronLeftIcon aria-hidden="true" />
        </Button>
        <span className="min-w-24 text-center font-mono text-xs">
          Page {pageNumber} of {pageCount || '…'}
        </span>
        <Button
          aria-label="Next PDF page"
          disabled={!pageCount || pageNumber >= pageCount}
          onClick={() => setPageNumber((page) => Math.min(pageCount, page + 1))}
          size="icon-sm"
          variant="outline"
        >
          <ChevronRightIcon aria-hidden="true" />
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button
            aria-label="Zoom PDF out"
            disabled={scale <= 0.7}
            onClick={() => setScale((value) => Math.max(0.7, value - 0.15))}
            size="icon-sm"
            variant="ghost"
          >
            <ZoomOutIcon aria-hidden="true" />
          </Button>
          <span className="min-w-12 text-center font-mono text-[10px]">
            {Math.round(scale * 100)}%
          </span>
          <Button
            aria-label="Zoom PDF in"
            disabled={scale >= 1.75}
            onClick={() => setScale((value) => Math.min(1.75, value + 0.15))}
            size="icon-sm"
            variant="ghost"
          >
            <ZoomInIcon aria-hidden="true" />
          </Button>
        </div>
      </div>
      <Document
        error={<ClioStatus detail={`Could not render ${name}.`} label="PDF unavailable" value="failed" />}
        file={file}
        loading={<p className="p-4 text-sm text-muted-foreground">Loading PDF…</p>}
        onLoadSuccess={({ numPages }) => {
          setPageCount(numPages);
          setPageNumber((page) => Math.min(page, numPages));
        }}
      >
        <div
          className="mx-auto w-fit overflow-hidden rounded-lg border bg-white shadow-sm"
          data-page={pageNumber - 1}
          onMouseUp={captureSelection}
        >
          <Page
            pageNumber={pageNumber}
            renderAnnotationLayer
            renderTextLayer
            scale={scale}
            width={hostWidth / scale}
          />
        </div>
      </Document>
    </div>
  );
}

function bounded(value: number) {
  return Math.max(0, Math.min(1, value));
}
