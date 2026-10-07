import type { FileDiffIcon } from 'lucide-react';
import { AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';

export function EvidenceSection({
  icon: Icon,
  label,
  value,
  count,
  children,
}: {
  icon: typeof FileDiffIcon;
  label: string;
  value: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <AccordionItem value={value}>
      <AccordionTrigger
        className="min-h-9 py-2 text-xs hover:no-underline"
        aria-label={`${label}, ${count.toLocaleString()} recorded`}
      >
        <span className="flex items-center gap-2">
          <Icon aria-hidden="true" className="size-3.5 text-muted-foreground" />
          {label}
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {count.toLocaleString()}
          </span>
        </span>
      </AccordionTrigger>
      <AccordionContent>
        <div className="clio-scrollbar grid min-w-0 grid-cols-1 max-h-[min(24rem,60vh)] gap-2 overflow-y-auto pr-1">
          {children}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
