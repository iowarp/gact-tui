import { createComponentImplementation } from '@a2ui/react/v0_9';
import { ChartNoAxesCombinedIcon } from 'lucide-react';
import { z } from 'zod';
import { Frame, FrameDescription, FrameHeader, FrameTitle } from '@/components/reui/frame';

/**
 * `clio.time-series.v1` was retired when charts moved to the unified,
 * preset-based `clio.chart.v1` — but old transcripts (and old export files)
 * still name it. Left unregistered, `@a2ui/react`'s own renderer falls back
 * to its generic "no implementation at all for this type" case: a raw,
 * unstyled `<div style={{ color: 'red' }}>Unknown component type: ...</div>`
 * that reads like a live bug rather than an explained, expected state
 * (#1533 MEDIUM 7). Registering an implementation for the retired name
 * intercepts that fallback with a clean reui card instead. No prop is read —
 * a legacy payload's shape is whatever the old, now-deleted schema was, and
 * none of it is worth reviving — so the schema accepts anything.
 */
export const ClioTimeSeriesFallbackCatalogComponent = createComponentImplementation(
  { name: 'clio.time-series.v1', schema: z.object({}).passthrough() },
  () => (
    <Frame role="group" spacing="sm">
      <FrameHeader>
        <ChartNoAxesCombinedIcon aria-hidden="true" className="size-4 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <FrameTitle>This chart type is no longer supported</FrameTitle>
          <FrameDescription>Ask the agent to redraw it to see it again.</FrameDescription>
        </div>
      </FrameHeader>
    </Frame>
  ),
);
