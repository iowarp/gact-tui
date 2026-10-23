import type { ContextSnapshot, Message } from '@clio/core/v3';
import { ChevronRightIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { contextComposition, contextPercent, contextTokens } from './context-composition-model';

const COLORS: Record<string, string> = {
  system: 'bg-sky-500',
  tools: 'bg-orange-500',
  skills: 'bg-violet-500',
  messages: 'bg-teal-500',
  results: 'bg-amber-500',
  reasoning: 'bg-pink-500',
};
const GRID = 'grid grid-cols-[minmax(0,1fr)_4rem_3.5rem] items-center gap-2';

/** Shared measured usage and expandable contributors for the rail and full context view. */
export function ContextUsage({
  context,
  messages = [],
  compact = false,
}: {
  context?: ContextSnapshot;
  messages?: readonly Message[];
  compact?: boolean;
}) {
  const { used, limit, sections, reserve, free, estimated } = contextComposition(context, messages);
  const cacheRead = context?.cache_read_tokens ?? 0;
  return (
    <section
      aria-label="Context usage"
      className={cn('min-w-0', !compact && 'rounded-xl border p-3')}
    >
      {!compact ? <h3 className="mb-3 text-sm font-semibold">Context</h3> : null}
      <div className="flex items-baseline justify-between gap-2 text-sm tabular-nums">
        <strong className="font-medium">
          {limit ? `${Math.round((used / limit) * 100)}% used` : contextTokens(used) + ' tokens'}
        </strong>
        <span className="text-xs text-muted-foreground">
          {contextTokens(used)} / {limit ? contextTokens(limit) : 'Limit unknown'}
        </span>
      </div>
      {limit ? (
        <div
          role="img"
          aria-label="Context token composition"
          className="my-2 flex h-1.5 overflow-hidden rounded-full bg-muted"
        >
          {sections.map((section) => (
            <span
              key={section.id}
              className={cn('h-full', COLORS[section.id] ?? 'bg-stone-400')}
              style={{
                width: `${Math.max(0, Math.min(100, (section.tokens_estimated / Math.max(limit, used, context?.prompt_breakdown?.tokens_estimated ?? 0)) * 100))}%`,
              }}
            />
          ))}
        </div>
      ) : null}
      <p className="mb-2 text-[11px] leading-4 text-muted-foreground">
        {estimated ? 'Estimated usage' : 'Provider-reported usage'} · Last request
        {context?.usage_recorded_at
          ? ` at ${new Date(context.usage_recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
          : ''}
      </p>
      <div aria-label="Context sections" className="grid gap-0.5 text-xs tabular-nums">
        {sections.map((section) => (
          <details key={section.id} className="group" open={undefined}>
            <summary
              tabIndex={section.items.length ? 0 : -1}
              aria-disabled={!section.items.length}
              onClick={(event) => {
                if (!section.items.length) event.preventDefault();
              }}
              className={cn(
                GRID,
                'min-h-7 list-none rounded py-1 [&::-webkit-details-marker]:hidden',
                section.items.length ? 'cursor-pointer hover:bg-muted/50' : 'pointer-events-none',
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden="true"
                  className={cn('size-2 shrink-0 rounded-sm', COLORS[section.id] ?? 'bg-stone-400')}
                />
                <span className="min-w-0 break-words">{section.label}</span>
                {section.items.length ? (
                  <ChevronRightIcon
                    aria-hidden="true"
                    className="size-3 shrink-0 text-muted-foreground group-open:rotate-90"
                  />
                ) : null}
              </span>
              <span className="text-right text-muted-foreground">
                {context?.prompt_breakdown ? '≈' : ''}
                {contextTokens(section.tokens_estimated)}
              </span>
              <span className="text-right">{contextPercent(section.tokens_estimated, limit)}</span>
            </summary>
            {section.items.length ? (
              <ul
                aria-label={`${section.label} details`}
                className="mb-2 ml-4 border-l pl-3 text-muted-foreground"
              >
                <Contributors items={section.items} />
              </ul>
            ) : null}
          </details>
        ))}
        {limit ? (
          <>
            <div className={cn(GRID, 'mt-1 border-t pt-2 text-muted-foreground')}>
              <span>Compaction buffer</span>
              <span className="text-right">{contextTokens(reserve)}</span>
              <span className="text-right">{contextPercent(reserve, limit)}</span>
            </div>
            <div className={cn(GRID, 'py-1 text-muted-foreground')}>
              <span>Free space</span>
              <span className="text-right">{contextTokens(free)}</span>
              <span className="text-right">{contextPercent(free, limit)}</span>
            </div>
          </>
        ) : null}
      </div>
      {!context?.prompt_breakdown && !compact ? (
        <p className="mt-2 text-[11px] text-muted-foreground">No section data yet.</p>
      ) : null}
      {context?.cache_tokens_measured && used ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Prompt cache: {contextTokens(cacheRead)} reused ({contextPercent(cacheRead, used)})
          {context.cache_write_tokens
            ? ` · ${contextTokens(context.cache_write_tokens)} written`
            : ''}
        </p>
      ) : null}
    </section>
  );
}

function Contributors({ items }: { items: Array<{ label: string; tokens_estimated: number }> }) {
  const [shown, setShown] = useState(8);
  return (
    <>
      {items.slice(0, shown).map((item, index) => (
        <li key={index} className="flex items-baseline justify-between gap-3 py-1">
          <span className="min-w-0 break-words">{item.label}</span>
          <span className="shrink-0">≈{contextTokens(item.tokens_estimated)}</span>
        </li>
      ))}
      {items.length > shown ? (
        <li>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-0 text-xs"
            onClick={() => setShown(shown + 8)}
          >
            Show more ({items.length - shown})
          </Button>
        </li>
      ) : null}
    </>
  );
}
