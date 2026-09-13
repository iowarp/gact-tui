import type { ToolInvocation, ToolPresentationBlock } from '@clio/core/v3';
import { ChevronRightIcon, CircleAlertIcon, MessageSquareIcon, SearchIcon } from 'lucide-react';
import { GroundedMessageResponse } from './grounded-message-response';
import { BoundedResult } from './bounded-result';
import { PresentationLink } from './presentation-link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { BlockBody, PagedBlock } from './tool-result-primitives';

export function ResourceSearchResults({
  block,
  resource,
  lines,
}: {
  block: ToolPresentationBlock;
  resource: ToolPresentationBlock;
  lines: number;
}) {
  const matches = (block.text ?? '')
    .split('\n')
    .map((text) => {
      const match = /^(\d+):\s*(.*)$/u.exec(text);
      return match ? { line: match[1], text: match[2] } : undefined;
    })
    .filter((match): match is { line: string; text: string } => Boolean(match));
  const title = `Matches in ${resource.label || 'workspace resource'}`;
  return (
    <div
      className="min-w-0 overflow-hidden rounded-md border bg-muted/40"
      data-slot="tool-result-panel"
    >
      <div className="flex items-center gap-1.5 border-b px-2 py-1.5 text-xs font-medium text-muted-foreground">
        <SearchIcon aria-hidden="true" className="size-3.5 shrink-0" />
        <span>{title}</span>
      </div>
      {matches.length ? (
        <BoundedResult lines={Math.min(lines, 3)} unit="items" title={title}>
          <ul className="divide-y">
            {matches.map((match) => (
              <li className="grid min-w-0 grid-cols-[auto_1fr] gap-2 px-2 py-1.5" key={match.line}>
                <PresentationLink
                  block={{
                    ...resource,
                    id: `${resource.id}-line-${match.line}`,
                    label: `Line ${match.line}`,
                  }}
                  compact
                />
                <code className="min-w-0 whitespace-pre-wrap break-words text-xs leading-5">
                  {match.text}
                </code>
              </li>
            ))}
          </ul>
        </BoundedResult>
      ) : (
        <p className="px-2 py-1.5 text-sm text-muted-foreground">
          {block.text || 'No matching passages'}
        </p>
      )}
    </div>
  );
}

interface MemoryExcerpt {
  id: string;
  role: string;
  text: string;
  session?: ToolPresentationBlock;
}

function compactExcerpt(text: string): string {
  return text.replace(/\*\*/gu, '').replace(/\s+/gu, ' ').trim();
}

export function MemoryExcerptItem({ excerpt, index }: { excerpt: MemoryExcerpt; index: number }) {
  const label = excerpt.session?.label || `Excerpt ${index + 1}`;
  return (
    <Collapsible className="group/memory">
      <div className="flex min-w-0 items-center gap-1.5 px-1.5 py-1">
        <CollapsibleTrigger asChild>
          <Button
            aria-label={`Toggle ${label} ${excerpt.role} excerpt`}
            className="shrink-0"
            size="icon-sm"
            variant="ghost"
          >
            <ChevronRightIcon
              aria-hidden="true"
              className="shrink-0 transition-transform group-data-[state=open]/memory:rotate-90"
            />
          </Button>
        </CollapsibleTrigger>
        {excerpt.session ? (
          <PresentationLink block={excerpt.session} compact />
        ) : (
          <span className="shrink-0 text-sm font-medium">{label}</span>
        )}
        <Badge className="shrink-0 font-normal" variant="secondary">
          {excerpt.role}
        </Badge>
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {compactExcerpt(excerpt.text)}
        </span>
      </div>
      <CollapsibleContent>
        <div className="border-t bg-background/60 px-2 py-1.5">
          <GroundedMessageResponse
            className="min-w-0 max-w-full text-sm leading-5 [overflow-wrap:anywhere]"
            controls={{ table: false }}
          >
            {excerpt.text}
          </GroundedMessageResponse>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function MemoryExcerptPanel({
  excerpts,
  title,
  icon: Icon = MessageSquareIcon,
}: {
  excerpts: readonly MemoryExcerpt[];
  title: string;
  icon?: typeof MessageSquareIcon;
}) {
  return (
    <div
      className="min-w-0 overflow-hidden rounded-md border bg-muted/40"
      data-slot="tool-result-panel"
    >
      <div className="flex items-center gap-1.5 border-b px-2 py-1.5 text-xs font-medium text-muted-foreground">
        <Icon aria-hidden="true" className="shrink-0" />
        <span>{title}</span>
      </div>
      {excerpts.length ? (
        <BoundedResult lines={3} title={title} unit="items">
          <ul aria-label={title} className="divide-y">
            {excerpts.map((excerpt, index) => (
              <li key={excerpt.id}>
                <MemoryExcerptItem excerpt={excerpt} index={index} />
              </li>
            ))}
          </ul>
        </BoundedResult>
      ) : (
        <p className="px-2 py-1.5 text-sm text-muted-foreground">No retained excerpts</p>
      )}
    </div>
  );
}

function memorySearchExcerpts(blocks: readonly ToolPresentationBlock[]): MemoryExcerpt[] {
  const excerpts: MemoryExcerpt[] = [];
  for (let index = 0; index < blocks.length; index++) {
    const session = blocks[index];
    const detail = blocks[index + 1];
    if (session.type !== 'link' || session.target !== 'session' || detail?.type !== 'text') continue;
    excerpts.push({
      id: detail.id,
      role: detail.label || 'Memory',
      session,
      text: detail.text ?? '',
    });
    index++;
  }
  return excerpts;
}

export function MemorySearchResults({
  blocks,
  summary,
}: {
  blocks: readonly ToolPresentationBlock[];
  summary: string;
}) {
  const title = summary.replace(/^(\d+\s+matches?)\s+in\s+(\d+\s+sessions?)$/iu, '$1 across $2');
  return <MemoryExcerptPanel excerpts={memorySearchExcerpts(blocks)} icon={SearchIcon} title={title} />;
}

export function MemorySessionSummary({
  blocks,
  summary,
}: {
  blocks: readonly ToolPresentationBlock[];
  summary: string;
}) {
  const messageCount = /^(\d+\s+messages?)/imu.exec(summary)?.[1] || 'Session summary';
  const status = /^Status:\s*(.+)$/imu.exec(summary)?.[1];
  const excerpts = blocks
    .filter((block) => block.type === 'text' && block.text)
    .map((block) => ({
      id: block.id,
      role: block.label || 'Memory',
      text: block.text ?? '',
    }));
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center gap-2 px-0.5 text-xs text-muted-foreground">
        <MessageSquareIcon aria-hidden="true" className="shrink-0" />
        <span>{messageCount}</span>
        {status ? <Badge variant="secondary">{status}</Badge> : null}
      </div>
      <MemoryExcerptPanel excerpts={excerpts} title="Recent session excerpts" />
    </div>
  );
}

function titleCase(value: unknown, fallback: string) {
  if (typeof value !== 'string' || !value) return fallback;
  return `${value[0].toUpperCase()}${value.slice(1).replaceAll('_', ' ')}`;
}

export function ResourceFacts({ blocks }: { blocks: ToolPresentationBlock[] }) {
  const identity = blocks.find((block) => block.id === 'identity' || block.type === 'text');
  const values = (identity?.text ?? '').split('\n');
  const labels = ['Format', 'Size', 'Revision', 'Upload', 'Conversion'];
  const facts = labels.map((label, index) => ({
    label,
    value: (values[index] || 'Unavailable').replace(new RegExp(`^${label}\\s+`, 'iu'), ''),
  }));
  return (
    <div
      className="min-w-0 overflow-hidden rounded-md border bg-border"
      data-slot="tool-result-panel"
    >
      <dl className="grid grid-cols-2 gap-px sm:grid-cols-5">
        {facts.map((fact) => (
          <div className="min-w-0 bg-muted/90 px-2 py-1.5" key={fact.label}>
            <dt className="text-xs text-muted-foreground">{fact.label}</dt>
            <dd className="break-words text-sm font-medium" title={fact.value}>
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function ResourceStructureResult({
  blocks,
  tool,
}: {
  blocks: ToolPresentationBlock[];
  tool: ToolInvocation;
}) {
  const outline = blocks.find((block) => block.id === 'outline');
  if (outline?.text) {
    const counts = outline.text.split('\n').map((line) => {
      const [label, value] = line.split(':', 2);
      return { label, value: Number(value?.trim() || 0) };
    });
    return (
      <div
        className="min-w-0 overflow-hidden rounded-md border bg-muted/40"
        data-slot="tool-result-panel"
      >
        <p className="border-b px-2 py-1.5 text-xs font-medium text-muted-foreground">
          Document structure
        </p>
        <dl className="grid grid-cols-4 divide-x">
          {counts.map(({ label, value }) => (
            <div className="px-2 py-1.5 text-center" key={label}>
              <dd className="text-sm font-semibold tabular-nums">{value}</dd>
              <dt className="text-xs text-muted-foreground">{label}</dt>
            </div>
          ))}
        </dl>
      </div>
    );
  }
  const node = blocks.find((block) => block.id === 'node');
  if (!node?.text) return null;
  const input = asRecord(tool.input);
  const collection = typeof input?.collection === 'string' ? input.collection : 'node';
  const index = typeof input?.index === 'number' ? input.index : undefined;
  const singular = collection.endsWith('s') ? collection.slice(0, -1) : collection;
  const path = index === undefined ? undefined : `#/${collection}/${index}`;
  return (
    <div
      className="min-w-0 overflow-hidden rounded-md border bg-muted/40"
      data-slot="tool-result-panel"
    >
      <div className="flex min-w-0 items-center justify-between gap-2 border-b px-2 py-1.5">
        <p className="truncate text-xs font-medium text-muted-foreground">
          {titleCase(singular, 'Structure')} node
        </p>
        <code className="shrink-0 text-xs text-muted-foreground">
          {collection}
          {index === undefined ? '' : `[${index}]`}
        </code>
      </div>
      <p className="px-2 py-1.5 text-sm font-medium [overflow-wrap:anywhere]">{node.text}</p>
      {path ? (
        <p className="border-t px-2 py-1 text-xs text-muted-foreground">Path {path}</p>
      ) : null}
    </div>
  );
}

export function ResourceConversionResult({ blocks }: { blocks: ToolPresentationBlock[] }) {
  const status = blocks.find((block) => block.id === 'processing' || block.type === 'text');
  if (!status?.text) return null;
  return (
    <div
      className="flex min-w-0 items-center justify-between gap-3 rounded-md border bg-muted/40 px-2 py-1.5"
      data-slot="tool-result-panel"
    >
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">Conversion status</p>
        <p className="truncate text-sm font-medium">{status.text}</p>
      </div>
    </div>
  );
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** The default (non-link/item/check/terminal) result panel for one block. */
export function DefaultBlockPanel({
  block,
  lines,
  running,
}: {
  block: ToolPresentationBlock;
  lines: number;
  running: boolean;
}) {
  return (
    <div
      className={cn(
        'min-w-0 overflow-hidden rounded-md border',
        block.severity === 'error'
          ? 'border-destructive/40 bg-destructive/5'
          : block.severity === 'warning'
            ? 'border-warning/40 bg-warning/5'
            : 'bg-muted/40',
      )}
      data-slot="tool-result-panel"
    >
      {block.label ? (
        <p
          className={cn(
            'flex items-center gap-1 break-words px-2 pt-1 text-xs font-medium',
            block.severity === 'error' ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {block.severity === 'error' ? (
            <CircleAlertIcon aria-hidden="true" className="size-3.5 shrink-0" />
          ) : null}
          {block.label}
        </p>
      ) : null}
      {block.content_ref && !running ? (
        <PagedBlock block={block} lines={lines} />
      ) : (
        <BoundedResult
          lines={lines}
          running={running}
          separateViewer={block.type === 'media'}
          fullContent={
            block.type === 'media' ? (
              <BlockBody block={block} text={block.text ?? ''} full />
            ) : undefined
          }
        >
          <BlockBody block={block} text={block.text ?? ''} />
        </BoundedResult>
      )}
    </div>
  );
}
