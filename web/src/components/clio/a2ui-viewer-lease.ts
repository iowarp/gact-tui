import { createContext } from 'react';

/**
 * One viewer's identity on the service: its id and view epoch. A transcript surface
 * keeps one lease whether its renderer is mounted or suspended off screen, so the
 * service sees one continuous viewer and a capture is never sent to a renderer that
 * scrolled away and unmounted while its lease was still running out.
 */
export class A2uiViewerLease {
  readonly viewerId = crypto.randomUUID();
  epoch = 0;

  /** A new view epoch: the reported state changed, or its renderer mounted or suspended. */
  advance(): number {
    this.epoch += 1;
    return this.epoch;
  }
}

/**
 * The lease a mounted renderer reports with. `suspended` is true while the surface is
 * mounted only for a capture of it off screen: the suspended viewer keeps reporting
 * then, and the renderer reports nothing of its own.
 */
export const A2uiViewerLeaseContext = createContext<
  { lease: A2uiViewerLease; suspended: boolean } | undefined
>(undefined);
