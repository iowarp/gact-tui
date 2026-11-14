import type { ReactNode } from 'react';
import { ChevronDownIcon, SquareCheckIcon, SquareIcon, SquareMinusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useEvidenceDisclosure } from '@/hooks/use-evidence-disclosures';
import { cn } from '@/lib/utils';
import { todoCurrentSummary } from './todo-list-summary';
import { t, ph } from '@lingui/core/macro';

export function TodoStatusIcon({ state, className }: { state?: string; className?: string }) {
  const Icon =
    state === 'completed'
      ? SquareCheckIcon
      : state === 'in_progress'
        ? SquareMinusIcon
        : SquareIcon;
  return (
    <Icon
      aria-hidden="true"
      className={cn(
        'size-4 shrink-0',
        state === 'completed'
          ? 'text-success'
          : state === 'in_progress'
            ? 'text-warning'
            : 'text-muted-foreground',
        className,
      )}
    />
  );
}

/** Keep unfinished work visible and completed items behind one shared disclosure. */
export function TodoList<T>({
  items,
  status,
  renderItem,
  scope,
  summary = false,
}: {
  items: readonly T[];
  status: (item: T) => string | undefined;
  renderItem: (item: T, index: number) => ReactNode;
  scope: 'showcase' | 'work' | 'transcript';
  summary?: boolean;
}) {
  const [open, setOpen] = useEvidenceDisclosure(`todos-completed:${scope}`, false);
  const current = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => status(item) !== 'completed');
  const completed = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => status(item) === 'completed');
  return (
    <div className="min-w-0 space-y-1" data-slot="todo-list">
      {summary ? (
        <p className="text-xs tabular-nums text-muted-foreground">
          {todoCurrentSummary(items, status)}
        </p>
      ) : null}
      {current.length ? (
        <ul className="flex list-none flex-col gap-1.5" aria-label={t`Current todos`}>
          {current.map(({ item, index }) => renderItem(item, index))}
        </ul>
      ) : !completed.length ? (
        <p className="text-xs text-muted-foreground">{t`No current todos.`}</p>
      ) : null}
      {completed.length ? (
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              aria-label={
                open
                  ? t`Hide completed ${ph({ count: completed.length })}`
                  : t`Show completed ${ph({ count: completed.length })}`
              }
              variant="ghost"
              className="group h-7 gap-1.5 border-0 px-0 text-xs font-normal text-muted-foreground hover:bg-transparent hover:text-foreground"
            >
              {open ? t`Hide completed` : t`Show completed`}
              <span className="tabular-nums">{completed.length}</span>
              <ChevronDownIcon
                aria-hidden="true"
                className="size-3.5 transition-transform group-data-[state=open]:rotate-180"
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="flex list-none flex-col gap-1.5 pt-1" aria-label={t`Completed todos`}>
              {completed.map(({ item, index }) => renderItem(item, index))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  );
}
