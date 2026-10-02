import { createComponentImplementation } from '@a2ui/react/v0_9';
import { z } from 'zod';

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
    <div className="min-w-0 space-y-1" role="group">
      <h3 className="text-sm font-medium">This chart type is no longer supported</h3>
      <p className="text-sm text-muted-foreground">Ask the agent to redraw it to see it again.</p>
    </div>
  ),
);
