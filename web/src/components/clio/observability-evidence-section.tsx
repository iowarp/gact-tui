import type { FileDiffIcon } from 'lucide-react';
import { AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';

export function EvidenceSection({
  icon: Icon,
  label,
  value,
  count,
  summary,
  children,
  compact = false,
}: {
  icon: typeof FileDiffIcon;
  label: string;
  value: string;
  count: number;
  summary?: string;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <AccordionItem value={value}>
      <AccordionTrigger
        className={
          compact
            ? 'min-h-7 py-1 text-xs hover:no-underline'
            : 'min-h-10 py-2 text-sm hover:no-underline'
        }
        aria-label={`${label}, ${summary ?? `${count.toLocaleString()} recorded`}`}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Icon aria-hidden="true" className="size-3.5 text-muted-foreground" />
          {label}
          <span className="rounded-md bg-muted/70 px-1.5 py-0.5 text-xs font-normal tabular-nums text-muted-foreground">
            {summary ?? count.toLocaleString()}
          </span>
        </span>
      </AccordionTrigger>
      <AccordionContent className="h-auto">
        <div
          className={compact ? 'grid min-w-0 gap-0.5 pl-4' : 'grid min-w-0 grid-cols-1 gap-1 pb-1'}
        >
          {children}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
