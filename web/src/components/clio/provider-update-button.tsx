import { CircleArrowUpIcon } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { t } from '@lingui/core/macro';

/**
 * "Update to 0.2.181", or the short "Update" when the row has no room for the
 * version: phones have no hover, so the action never reads as a cut-off word.
 */
export function ProviderUpdateButton({
  disabled,
  onUpdate,
  updateTo,
}: {
  disabled: boolean;
  onUpdate: () => void;
  updateTo: string;
}) {
  const label = useRef<HTMLSpanElement>(null);
  const [compact, setCompact] = useState(false);
  const [rowWidth, setRowWidth] = useState(0);
  const full = t`Update to ${updateTo}`;
  const width = (node: Element | null | undefined) =>
    Math.round(node?.closest('[role="group"]')?.getBoundingClientRect().width ?? 0);
  useLayoutEffect(() => {
    const row = label.current?.closest('[role="group"]');
    if (!row || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setRowWidth(width(row)));
    observer.observe(row);
    return () => observer.disconnect();
  }, []);
  // The row width the label last stopped fitting at: only a wider row tries the full label
  // again, and the layout pass below shortens it before paint.
  const compactAt = useRef<{ width: number; full: string } | undefined>(undefined);
  useLayoutEffect(() => {
    const at = compactAt.current;
    if (at && (rowWidth > at.width || at.full !== full)) {
      compactAt.current = undefined;
      setCompact(false);
    }
  }, [rowWidth, full]);
  useLayoutEffect(() => {
    const node = label.current;
    if (compact || !node || node.scrollWidth <= node.clientWidth + 1) return;
    compactAt.current = { width: width(node), full };
    setCompact(true);
  }, [compact, full, rowWidth]);
  return (
    <Button
      aria-label={full}
      className="h-[22px] min-w-0 shrink gap-[5px] rounded-[6px] px-2 text-caption font-semibold text-accent-foreground"
      data-compact={compact ? '' : undefined}
      data-slot="provider-update-available"
      disabled={disabled}
      onClick={onUpdate}
      size="xs"
      title={full}
      type="button"
      variant="outline"
    >
      <CircleArrowUpIcon aria-hidden="true" className="size-3 shrink-0" />
      <span className="min-w-0 truncate" ref={label}>
        {compact ? t`Update` : full}
      </span>
    </Button>
  );
}
