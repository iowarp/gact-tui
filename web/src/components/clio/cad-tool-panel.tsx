import { ph, t } from '@lingui/core/macro';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { CloseIcon } from '@/lib/icon-vocabulary';

/**
 * One CAD tool's panel: a named, closable card. Panels stack in a column at the view's right
 * when it is wide and in a scrolling sheet along its bottom edge when it is narrow (a phone).
 */
export function CadToolPanel({
  title,
  slot,
  onClose,
  children,
}: {
  title: string;
  slot: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="pointer-events-auto flex flex-col gap-2 rounded-md border bg-popover/95 p-2 text-sm text-popover-foreground shadow-sm"
      data-slot={slot}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-caption font-medium text-muted-foreground">{title}</h3>
        <Button
          aria-label={t`Close ${ph({ title })}`}
          className="size-6"
          onClick={onClose}
          size="icon"
          variant="ghost"
        >
          <CloseIcon aria-hidden="true" className="size-3.5" />
        </Button>
      </div>
      {children}
    </section>
  );
}

/** The column (wide) or bottom sheet (narrow) the open tool panels share. */
export function CadToolColumn({ children }: { children: ReactNode }) {
  return (
    <div
      className="pointer-events-none absolute inset-x-2 bottom-2 flex max-h-[48%] flex-col gap-2 overflow-y-auto @2xl:inset-x-auto @2xl:top-2 @2xl:right-2 @2xl:bottom-auto @2xl:max-h-[calc(100%-6rem)] @2xl:w-72"
      data-slot="cad-tools"
    >
      {children}
    </div>
  );
}
