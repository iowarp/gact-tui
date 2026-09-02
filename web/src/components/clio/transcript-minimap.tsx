import type { Message } from '@clio/core/v3';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ListTreeIcon } from 'lucide-react';
import { lazy, Suspense, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { truncate } from '@/lib/format';
import { TRANSCRIPT_PREVIEW_TRUNCATE_CHARS } from '@/lib/runtime-limits';
import { cn } from '@/lib/utils';

// Same lazy split the transcript itself uses: a minimap must not pull the
// markdown renderer into the first paint just to draw landmarks.
const MarkdownText = lazy(() =>
  import('@/components/ai-elements/markdown').then((module) => ({ default: module.MarkdownText })),
);

function PreviewMarkdown({ className, children }: { className?: string; children: string }) {
  return (
    <Suspense fallback={<p className={className}>{children}</p>}>
      <MarkdownText className={className} controls={false} mode="static">
        {children}
      </MarkdownText>
    </Suspense>
  );
}

interface ClioTranscriptMinimapProps {
  activeIndex: number;
  messages: readonly Message[];
  onJump: (index: number) => void;
  visible: boolean;
}

export function ClioTranscriptMinimap({
  activeIndex,
  messages,
  onJump,
  visible,
}: ClioTranscriptMinimapProps) {
  if (!visible) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            aria-label="Open transcript outline"
            className="absolute top-2 left-2 z-10 rounded-full"
            size="icon-sm"
            variant="outline"
          >
            <ListTreeIcon aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          aria-label="Transcript outline"
          className="h-80 min-h-48 w-80 min-w-64 max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] resize overflow-hidden p-2"
          side="right"
        >
          <p className="shrink-0 px-2 text-xs font-medium text-muted-foreground">
            Transcript outline
          </p>
          <TranscriptOutlineList activeIndex={activeIndex} messages={messages} onJump={onJump} />
        </PopoverContent>
      </Popover>
    );
  }
  return <MinimapRail activeIndex={activeIndex} messages={messages} onJump={onJump} />;
}

function TranscriptOutlineList({
  activeIndex,
  messages,
  onJump,
}: {
  activeIndex: number;
  messages: readonly Message[];
  onJump: (index: number) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  // TanStack Virtual intentionally returns non-memoizable functions; this component owns them.
  // oxlint-disable-next-line react/incompatible-library
  const virtualizer = useVirtualizer({
    count: messages.length,
    estimateSize: () => 36,
    getItemKey: (index) => messages[index]?.id ?? index,
    getScrollElement: () => listRef.current,
    overscan: 6,
  });
  useLayoutEffect(() => {
    if (activeIndex < 0) return;
    virtualizer.scrollToIndex(activeIndex, { align: 'center' });
  }, [activeIndex, virtualizer]);
  return (
    <div
      className="clio-scrollbar min-h-0 flex-1 overflow-y-auto"
      data-slot="transcript-outline-list"
      ref={listRef}
    >
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((row) => {
          const message = messages[row.index];
          if (!message) return null;
          return (
            <div
              className="absolute top-0 left-0 w-full pr-1"
              data-index={row.index}
              key={row.key}
              style={{ height: row.size, transform: `translateY(${row.start}px)` }}
            >
              <TranscriptOutlineItem
                active={row.index === activeIndex}
                index={row.index}
                message={message}
                onJump={onJump}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TranscriptOutlineItem({
  active,
  index,
  message,
  onJump,
}: {
  active: boolean;
  index: number;
  message: Message;
  onJump: (index: number) => void;
}) {
  const preview = messagePreview(message);
  const previewDismissedRef = useRef(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  return (
    <HoverCard
      onOpenChange={(open) => {
        if (open && previewDismissedRef.current) return;
        setPreviewOpen(open);
      }}
      open={previewOpen}
      openDelay={120}
    >
      <div className="grid min-h-8 rounded-md">
        <HoverCardTrigger asChild>
          <Button
            aria-current={active ? 'location' : undefined}
            aria-label={`Jump to ${message.role} message ${index + 1}`}
            className="h-full w-full [grid-area:1/1]"
            onClick={() => {
              previewDismissedRef.current = true;
              setPreviewOpen(false);
              onJump(index);
            }}
            onPointerLeave={() => {
              previewDismissedRef.current = false;
            }}
            variant={active ? 'secondary' : 'ghost'}
          />
        </HoverCardTrigger>
        <div
          aria-hidden="true"
          className="pointer-events-none overflow-hidden px-2 py-1.5 [grid-area:1/1]"
        >
          <PreviewMarkdown className="overflow-hidden text-left text-sm text-ellipsis whitespace-nowrap! [&_*]:m-0 [&_br]:hidden [&_pre]:inline [&>*]:inline">
            {preview}
          </PreviewMarkdown>
        </div>
      </div>
      <HoverCardContent
        align="start"
        aria-label={`${message.role} message ${index + 1} preview`}
        className="max-h-80 w-96 max-w-[calc(100vw-2rem)] overflow-y-auto"
        role="region"
        side="right"
      >
        <p className="mb-2 text-xs font-medium capitalize text-muted-foreground">{message.role}</p>
        <PreviewMarkdown className="text-sm leading-5">{preview}</PreviewMarkdown>
      </HoverCardContent>
    </HoverCard>
  );
}

function MinimapRail({
  activeIndex,
  messages,
  onJump,
}: Omit<ClioTranscriptMinimapProps, 'visible'>) {
  const railRef = useRef<HTMLDivElement>(null);
  const lastRevealedActiveIndexRef = useRef<number | null>(null);
  // TanStack Virtual intentionally returns non-memoizable functions; this component owns them.
  // oxlint-disable-next-line react/incompatible-library
  const virtualizer = useVirtualizer({
    count: messages.length,
    estimateSize: () => 11,
    getScrollElement: () => railRef.current,
    overscan: 10,
  });
  const rows = virtualizer.getVirtualItems();
  useLayoutEffect(() => {
    if (activeIndex < 0 || lastRevealedActiveIndexRef.current === activeIndex) return;
    const rail = railRef.current;
    if (!rail || virtualizer.getTotalSize() <= rail.clientHeight) return;
    lastRevealedActiveIndexRef.current = activeIndex;
    const align =
      activeIndex === 0 ? 'start' : activeIndex === messages.length - 1 ? 'end' : 'auto';
    virtualizer.scrollToIndex(activeIndex, { align });
  }, [activeIndex, messages.length, virtualizer]);
  const content = (
    <div className="flex min-h-full w-full items-center" data-slot="transcript-minimap-landmarks">
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {rows.map((row) => {
          const message = messages[row.index];
          if (!message) return null;
          return (
            <HoverCard key={message.id} openDelay={120}>
              <HoverCardTrigger asChild>
                <button
                  aria-label={`Jump to ${message.role} message ${row.index + 1}`}
                  aria-current={row.index === activeIndex ? 'location' : undefined}
                  className="group absolute left-0 flex h-[11px] w-full items-center outline-none"
                  onClick={() => onJump(row.index)}
                  style={{ transform: `translateY(${row.start}px)` }}
                  type="button"
                >
                  <span
                    className={cn(
                      'rounded-full transition-[width,height,opacity] duration-150 ease-out',
                      landmarkClass(message),
                      row.index === activeIndex
                        ? 'h-1 w-5 opacity-100'
                        : 'h-0.5 opacity-60 group-hover:h-1 group-hover:w-5 group-hover:opacity-100 group-focus-visible:h-1 group-focus-visible:w-5 group-focus-visible:opacity-100',
                    )}
                    data-slot="transcript-minimap-landmark"
                  />
                </button>
              </HoverCardTrigger>
              <HoverCardContent
                align="start"
                aria-label={`${message.role} message ${row.index + 1} preview`}
                className="w-72"
                role="region"
                side="right"
              >
                <p className="text-xs font-medium capitalize text-muted-foreground">
                  {message.role}
                </p>
                <PreviewMarkdown className="mt-1 line-clamp-3 text-sm">
                  {messagePreview(message)}
                </PreviewMarkdown>
              </HoverCardContent>
            </HoverCard>
          );
        })}
      </div>
    </div>
  );
  return (
    <aside aria-label="Transcript minimap" className="absolute inset-y-3 left-1 z-10 w-6">
      <div
        aria-label="Browse transcript landmarks"
        className="h-full overflow-y-auto overscroll-y-contain px-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        data-slot="transcript-minimap-scroll-area"
        onWheel={(event) => event.stopPropagation()}
        ref={railRef}
        tabIndex={0}
      >
        {content}
      </div>
    </aside>
  );
}

function landmarkClass(message: Message): string {
  if (message.blocks.some((block) => block.type === 'error')) return 'w-3 bg-destructive';
  if (message.blocks.some((block) => block.type === 'a2ui')) return 'w-2.5 bg-violet-500';
  if (message.blocks.some((block) => block.type === 'artifact')) return 'w-2.5 bg-amber-500';
  if (message.blocks.some((block) => block.type === 'action_card')) {
    return 'w-2.5 bg-orange-500';
  }
  if (
    message.blocks.some((block) => ['reasoning', 'task', 'tool', 'subagent'].includes(block.type))
  ) {
    return 'w-2 bg-cyan-500';
  }
  return message.role === 'user' ? 'w-3 bg-primary' : 'w-2.5 bg-muted-foreground';
}

/**
 * The landmark preview projects a message down to one short line, so it follows
 * a fallback chain rather than a merge: visible text first, reasoning only when
 * the message has no text at all. Joining both would present the agent's
 * thinking as message content. The string is cut here, before it reaches a
 * markdown renderer, because CSS ellipsis still pays to parse and lay out the
 * whole message.
 */
function messagePreview(message: Message): string {
  const preview =
    collapse(message.blocks.filter((block) => block.type === 'text')) ||
    collapse(message.blocks.filter((block) => block.type === 'reasoning'));
  return truncate(preview, TRANSCRIPT_PREVIEW_TRUNCATE_CHARS) || `${message.role} activity`;
}

function collapse(blocks: readonly { text: string }[]): string {
  return blocks
    .map((block) => block.text)
    .join(' ')
    .replaceAll(/\s+/gu, ' ')
    .trim();
}
