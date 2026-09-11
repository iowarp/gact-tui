import type { ContextFile, ContextFrame, ContextSnapshot, Message } from '@clio/core/v3';
import { BotIcon, ChevronDownIcon, FileTextIcon, HistoryIcon, SparklesIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  Context as AIContext,
  ContextContent,
  ContextContentBody,
  ContextContentHeader,
  ContextTrigger,
} from '@/components/ai-elements/context';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import type { ClioContextTarget } from '@/lib/context-targets';
import { cn } from '@/lib/utils';
import { ClioInteractiveRow } from './interactive-row';
import { humanizeProtocolValue } from './presentation-labels';

interface ClioContextCanvasPanelProps {
  compactPending?: boolean;
  context?: ContextSnapshot;
  error?: string;
  files: readonly ContextFile[];
  frames: readonly ContextFrame[];
  messages?: readonly Message[];
  onCompact?: () => Promise<unknown>;
  onOpenFile?: (path: string) => void;
  onTargetChange?: (targetId: string) => void;
  onUpdatePreferences?: (input: {
    automatic_compaction?: boolean;
    autocompact_pct?: number;
  }) => Promise<unknown>;
  preferencesPending?: boolean;
  selectedTargetId?: string;
  targets?: readonly ClioContextTarget[];
}

const CATEGORY_STYLES = [
  'bg-cyan-400',
  'bg-violet-400',
  'bg-orange-400',
  'bg-emerald-400',
  'bg-sky-400',
  'bg-rose-400',
] as const;

export function ClioContextCanvasPanel({
  compactPending,
  context,
  error,
  files,
  frames,
  messages = [],
  onCompact,
  onOpenFile,
  onTargetChange,
  onUpdatePreferences,
  preferencesPending,
  selectedTargetId,
  targets = [],
}: ClioContextCanvasPanelProps) {
  const latest = frames.at(-1);
  const serverReading = context?.used_tokens ?? context?.live_tokens ?? 0;
  const retainedSummaryTokens = compactedSummaryTokens(messages);
  const reading = serverReading || retainedSummaryTokens;
  const summaryEstimateActive = retainedSummaryTokens > 0 && !serverReading;
  const activeContextItems =
    context?.live_block_count || (retainedSummaryTokens && !serverReading ? 1 : 0);
  const limit = context?.limit_tokens ?? 0;
  const canCompact = Boolean(onCompact && context?.live_block_count);
  const automaticCompaction = context?.autocompact_enabled ?? true;
  const serverThreshold = Math.round((context?.autocompact_pct ?? 0.85) * 100);
  const [thresholdDraft, setThresholdDraft] = useState({
    targetId: selectedTargetId,
    serverValue: serverThreshold,
    value: serverThreshold,
  });
  const threshold =
    thresholdDraft.targetId === selectedTargetId && thresholdDraft.serverValue === serverThreshold
      ? thresholdDraft.value
      : serverThreshold;
  const setThreshold = (value: number) =>
    setThresholdDraft({ targetId: selectedTargetId, serverValue: serverThreshold, value });
  const categories = useMemo(
    () => contextCategories(context, serverReading ? 0 : retainedSummaryTokens),
    [context, retainedSummaryTokens, serverReading],
  );
  const selectedTarget = targets.find((target) => target.id === selectedTargetId);

  return (
    <div className="grid min-w-0 gap-5">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Live context unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <section aria-labelledby="context-composition-heading" className="grid min-w-0 gap-4">
        <div className="flex min-w-0 items-center gap-2">
          <Select onValueChange={onTargetChange} value={selectedTargetId}>
            <SelectTrigger
              aria-label="Context agent"
              className="w-fit min-w-52 max-w-full border-0 bg-muted/40 shadow-none"
            >
              <BotIcon aria-hidden="true" className="size-3.5 text-primary" />
              <span className="truncate">
                {selectedTarget ? contextTargetLabel(selectedTarget) : 'Select agent context'}
              </span>
            </SelectTrigger>
            <SelectContent>
              {targets.map((target) => (
                <SelectItem key={target.id} value={target.id}>
                  <span className="grid min-w-0">
                    <span className="truncate">{contextTargetLabel(target)}</span>
                    {contextTargetLabel(target) === target.detail ? null : (
                      <span className="truncate text-xs text-muted-foreground">
                        {target.detail}
                      </span>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {limit > 0 ? (
            <AIContext maxTokens={limit} usedTokens={reading}>
              <ContextTrigger
                aria-label={
                  summaryEstimateActive ? 'Show estimated context usage' : 'Show exact context usage'
                }
                className="size-8 p-0"
              />
              <ContextContent align="end">
                <ContextContentHeader />
                <ContextContentBody className="text-xs text-muted-foreground">
                  {activeContextItems
                    ? `${activeContextItems.toLocaleString()} active context ${activeContextItems === 1 ? 'item' : 'items'}`
                    : 'No active context items'}
                  {summaryEstimateActive ? (
                    <span className="mt-1 block">
                      Compacted summary tokens are estimated from the retained text.
                    </span>
                  ) : null}
                </ContextContentBody>
              </ContextContent>
            </AIContext>
          ) : null}
        </div>

        {limit > 0 ? (
          <div className="grid gap-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h3 className="text-sm font-medium" id="context-composition-heading">
                  Context composition
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatTokens(reading)} of {formatTokens(limit)} tokens
                </p>
              </div>
              <span className="font-mono text-sm font-medium">
                {formatPercentage(reading, limit)}
              </span>
            </div>
            <ContextCompositionBar
              categories={categories}
              limit={limit}
              threshold={automaticCompaction ? threshold : undefined}
            />
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {categories.map((category, index) => (
                <div
                  className="flex min-w-36 flex-1 items-center gap-2 text-xs"
                  key={category.name}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'size-2 shrink-0 rounded-sm',
                      CATEGORY_STYLES[index % CATEGORY_STYLES.length],
                    )}
                  />
                  <span className="min-w-0 flex-1 capitalize">
                    {category.name.replaceAll('_', ' ')}
                  </span>
                  <span className="shrink-0 font-mono text-muted-foreground">
                    {formatTokens(category.tokens)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
            Context composition is unavailable from this service.
          </p>
        )}
      </section>

      {context ? (
        <section className="grid gap-3 border-t pt-4" aria-labelledby="automatic-context-heading">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-sm font-medium" id="automatic-context-heading">
                Automatic compaction
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Summarize this agent before its context window fills.
              </p>
            </div>
            <Switch
              aria-label="Automatic compaction"
              checked={automaticCompaction}
              disabled={!onUpdatePreferences || preferencesPending}
              onCheckedChange={(checked) =>
                void onUpdatePreferences?.({ automatic_compaction: checked })
              }
            />
          </div>
          <div
            className={cn(
              'grid grid-cols-[minmax(0,1fr)_3rem] items-center gap-3 transition-opacity',
              !automaticCompaction && 'opacity-45',
            )}
          >
            <Slider
              aria-label="Automatic compaction threshold"
              disabled={!automaticCompaction || !onUpdatePreferences || preferencesPending}
              max={95}
              min={50}
              onValueChange={(value) => setThreshold(value[0] ?? threshold)}
              onValueCommit={(value) => {
                const committed = value[0];
                if (committed !== undefined && committed !== serverThreshold) {
                  void onUpdatePreferences?.({ autocompact_pct: committed / 100 });
                }
              }}
              step={5}
              value={[threshold]}
            />
            <span className="text-right font-mono text-xs">{threshold}%</span>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                className="w-fit"
                disabled={!canCompact || compactPending}
                size="sm"
                variant="outline"
              >
                <SparklesIcon aria-hidden="true" />
                {compactPending ? 'Compacting…' : 'Compact now'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Compact this agent&apos;s working context?</AlertDialogTitle>
                <AlertDialogDescription>
                  The service will replace active context items with one faithful summary. The
                  transcript and saved snapshots remain available.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => void onCompact?.()}>
                  Compact now
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </section>
      ) : null}

      <ContextResources files={files} frame={latest} onOpenFile={onOpenFile} />
    </div>
  );
}

function ContextCompositionBar({
  categories,
  limit,
  threshold,
}: {
  categories: readonly ContextCategory[];
  limit: number;
  threshold?: number;
}) {
  return (
    <div
      aria-label="Context token composition"
      className="relative flex h-3 overflow-hidden rounded-full bg-muted"
      role="img"
    >
      {categories.map((category, index) => (
        <span
          className={cn('h-full min-w-px', CATEGORY_STYLES[index % CATEGORY_STYLES.length])}
          key={category.name}
          style={{ width: `${Math.min(100, (category.tokens / limit) * 100)}%` }}
          title={`${category.name.replaceAll('_', ' ')}, ${category.tokens.toLocaleString()} tokens`}
        />
      ))}
      {threshold !== undefined ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 w-px bg-foreground/80 shadow-[0_0_0_1px_var(--background)]"
          style={{ left: `${threshold}%` }}
          title={`Automatic compaction at ${threshold}%`}
        />
      ) : null}
    </div>
  );
}

function ContextResources({
  files,
  frame,
  onOpenFile,
}: {
  files: readonly ContextFile[];
  frame?: ContextFrame;
  onOpenFile?: (path: string) => void;
}) {
  return (
    <div className="grid gap-2 border-t pt-3">
      <ResourceDisclosure
        count={frame?.items.length ?? 0}
        icon={<HistoryIcon aria-hidden="true" />}
        label="Latest context snapshot"
      >
        {frame ? (
          <div className="grid gap-1.5 pt-2">
            <div className="flex flex-wrap gap-x-4 gap-y-1 px-2 text-xs text-muted-foreground">
              <span>{frame.items.length.toLocaleString()} context items</span>
              <span>{formatTokens(frame.tokens_estimated)} tokens</span>
              <time dateTime={frame.updated_at}>{formatTimestamp(frame.updated_at)}</time>
            </div>
            {frame.items.slice(0, 8).map((item, index) => {
              const title = contextItemTitle(item);
              const detail = contextItemDetail(item);
              return item.path && onOpenFile ? (
                <ClioInteractiveRow
                  className="min-h-0 px-2 py-1.5"
                  key={`${item.source_id ?? item.path}:${index}`}
                  onClick={() => onOpenFile(item.path!)}
                  role="button"
                >
                  <p className="truncate text-xs font-medium">{title}</p>
                  <p className="text-[11px] leading-4 text-muted-foreground">{detail}</p>
                </ClioInteractiveRow>
              ) : (
                <div className="min-w-0 px-2 py-1" key={`${title}:${index}`}>
                  <p className="truncate text-xs font-medium">{title}</p>
                  <p className="text-[11px] leading-4 text-muted-foreground">{detail}</p>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="pt-2 text-xs text-muted-foreground">
            No context snapshot is available for this agent.
          </p>
        )}
      </ResourceDisclosure>

      <ResourceDisclosure
        count={files.length}
        icon={<FileTextIcon aria-hidden="true" />}
        label="Files in context"
      >
        <div className="grid gap-1 pt-2">
          {files.length ? (
            files.map((file) => (
              <ClioInteractiveRow
                className="min-h-0 px-2 py-1.5"
                key={file.path}
                onClick={onOpenFile ? () => onOpenFile(file.path) : undefined}
                role={onOpenFile ? 'button' : undefined}
              >
                <p className="truncate text-xs font-medium">{file.display_path}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {file.mode === 'edit' ? 'Editable' : file.mode === 'pin' ? 'Pinned' : 'Read only'}
                </p>
              </ClioInteractiveRow>
            ))
          ) : (
            <p className="text-xs text-muted-foreground">
              No files are attached to this agent&apos;s context.
            </p>
          )}
        </div>
      </ResourceDisclosure>
    </div>
  );
}

function contextItemTitle(item: ContextFrame['items'][number]): string {
  if (item.display_path || item.path) return item.display_path ?? item.path ?? 'File';
  if (item.role === 'user') return 'User request';
  if (item.role === 'assistant') return 'Assistant response';
  return item.kind.replaceAll('_', ' ');
}

function contextItemDetail(item: ContextFrame['items'][number]): string {
  const inclusion = item.included ? 'Included in model context' : 'Excluded from model context';
  const tokens = `${formatTokens(item.tokens_estimated)} tokens`;
  return item.reason
    ? `${inclusion}, ${tokens}, source: ${humanizeProtocolValue(item.reason)}`
    : `${inclusion}, ${tokens}`;
}

function contextTargetLabel(target: ClioContextTarget): string {
  return target.detail === 'Main agent' && /^main$/iu.test(target.label)
    ? 'Main agent'
    : target.label;
}

function ResourceDisclosure({
  children,
  count,
  icon,
  label,
}: {
  children: React.ReactNode;
  count: number;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button className="h-8 w-full justify-start px-2" variant="ghost">
          {icon}
          <span>{label}</span>
          <span className="ml-auto font-mono text-xs text-muted-foreground">{count}</span>
          <ChevronDownIcon aria-hidden="true" className="size-3.5" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  );
}

interface ContextCategory {
  name: string;
  tokens: number;
}

function contextCategories(
  context: ContextSnapshot | undefined,
  retainedSummaryTokens: number,
): ContextCategory[] {
  const categories = { ...(context?.categories ?? {}) };
  if (retainedSummaryTokens > 0) {
    categories.compacted_summary_estimate = retainedSummaryTokens;
  }
  return Object.entries(categories)
    .filter(([, tokens]) => tokens > 0)
    .sort((left, right) => right[1] - left[1])
    .map(([name, tokens]) => ({ name, tokens }));
}

function compactedSummaryTokens(messages: readonly Message[]): number {
  const characters = messages.reduce(
    (total, message) =>
      total +
      message.blocks.reduce(
        (messageTotal, block) =>
          messageTotal + (block.type === 'compaction' ? block.summary.length : 0),
        0,
      ),
    0,
  );
  return characters ? Math.max(1, Math.ceil(characters / 4)) : 0;
}

function formatPercentage(used: number, limit: number): string {
  if (!limit) return 'Unavailable';
  const percentage = (used / limit) * 100;
  return percentage > 0 && percentage < 1 ? '<1%' : `${Math.round(percentage)}%`;
}

function formatTokens(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 1,
    notation: 'compact',
  }).format(value);
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
