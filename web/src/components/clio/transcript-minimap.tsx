import type { Message } from '@clio/core/v3';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ListTreeIcon } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { MarkdownText } from '@/components/ai-elements/markdown';
import { Button } from '@/components/ui/button';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Scrollspy } from '@/components/reui/scrollspy';
import { cn } from '@/lib/utils';

interface ClioTranscriptMinimapProps {
  activeIndex: number;
  messages: readonly Message[];
  onActiveIndexChange: (index: number) => void;
  onJump: (index: number) => void;
  scrollTargetRef: React.RefObject<HTMLDivElement | null>;
  useScrollspy: boolean;
  visible: boolean;
}

export function ClioTranscriptMinimap({
  activeIndex,
  messages,
  onActiveIndexChange,
  onJump,
  scrollTargetRef,
  useScrollspy,
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
  return (
    <MinimapRail
      activeIndex={activeIndex}
      messages={messages}
      onActiveIndexChange={onActiveIndexChange}
      onJump={onJump}
      scrollTargetRef={scrollTargetRef}
      useScrollspy={useScrollspy}
    />
  );
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
          <MarkdownText
            className="overflow-hidden text-left text-sm text-ellipsis whitespace-nowrap! [&_*]:m-0 [&_br]:hidden [&_pre]:inline [&>*]:inline"
            controls={false}
            mode="static"
          >
            {preview}
          </MarkdownText>
        </div>
      </div>
      <HoverCardContent
        align="start"
        aria-label={`Full ${message.role} message ${index + 1}`}
        className="max-h-80 w-96 max-w-[calc(100vw-2rem)] overflow-y-auto"
        role="region"
        side="right"
      >
        <p className="mb-2 text-xs font-medium capitalize text-muted-foreground">{message.role}</p>
        <MarkdownText className="text-sm leading-5" controls={false} mode="static">
          {preview}
        </MarkdownText>
      </HoverCardContent>
    </HoverCard>
  );
}

function MinimapRail({
  activeIndex,
  messages,
  onActiveIndexChange,
  onJump,
  scrollTargetRef,
  useScrollspy,
}: Omit<ClioTranscriptMinimapProps, 'visible'>) {
  const railRef = useRef<HTMLDivElement>(null);
  const [railViewportHeight, setRailViewportHeight] = useState(0);
  const estimatedContentHeight = messages.length * 11;
  const edgePadding =
    railViewportHeight > 0 && estimatedContentHeight > railViewportHeight
      ? Math.max(0, (railViewportHeight - 8) / 2)
      : 0;
  // TanStack Virtual intentionally returns non-memoizable functions; this component owns them.
  // oxlint-disable-next-line react/incompatible-library
  const virtualizer = useVirtualizer({
    count: messages.length,
    estimateSize: () => 11,
    getScrollElement: () => railRef.current,
    overscan: 10,
    paddingEnd: edgePadding,
    paddingStart: edgePadding,
  });
  const rows = virtualizer.getVirtualItems();
  useLayoutEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const updateHeight = () => {
      const nextHeight = Math.round(rail.clientHeight);
      setRailViewportHeight((current) => (current === nextHeight ? current : nextHeight));
    };
    updateHeight();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateHeight);
    observer.observe(rail);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    if (activeIndex < 0) return;
    const rail = railRef.current;
    if (!rail || virtualizer.getTotalSize() <= rail.clientHeight) return;
    virtualizer.scrollToIndex(activeIndex, { align: 'center' });
  }, [activeIndex, edgePadding, virtualizer]);
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
                  className="absolute left-0 flex h-[11px] w-full items-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  data-scrollspy-anchor={useScrollspy ? `message-${message.id}` : undefined}
                  onClick={() => onJump(row.index)}
                  style={{ transform: `translateY(${row.start}px)` }}
                  type="button"
                >
                  <span
                    className={cn(
                      'rounded-full',
                      row.index === activeIndex ? 'h-1' : 'h-0.5',
                      landmarkClass(message),
                    )}
                  />
                </button>
              </HoverCardTrigger>
              <HoverCardContent align="start" className="w-72" side="right">
                <p className="text-xs font-medium capitalize text-muted-foreground">
                  {message.role}
                </p>
                <p className="mt-1 line-clamp-3 text-sm">{messagePreview(message)}</p>
              </HoverCardContent>
            </HoverCard>
          );
        })}
      </div>
    </div>
  );
  return (
    <aside aria-label="Transcript minimap" className="absolute inset-y-3 left-1 z-10 w-3">
      <div
        className="h-full overflow-y-auto px-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        ref={railRef}
      >
        {useScrollspy ? (
          <Scrollspy
            className="h-full w-full"
            history={false}
            navigate={false}
            onUpdate={(sectionId) => {
              const messageId = sectionId.replace(/^message-/, '');
              const index = messages.findIndex((message) => message.id === messageId);
              if (index >= 0) onActiveIndexChange(index);
            }}
            smooth={false}
            targetRef={scrollTargetRef}
            refreshKey={`${messages.length}:${rows[0]?.index ?? -1}:${rows.at(-1)?.index ?? -1}`}
          >
            {content}
          </Scrollspy>
        ) : (
          content
        )}
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

function messagePreview(message: Message): string {
  const text = message.blocks
    .filter((block) => block.type === 'text' || block.type === 'reasoning')
    .map((block) => block.text)
    .join(' ')
    .replaceAll(/\s+/g, ' ')
    .trim();
  return text || `${message.role} activity`;
}
