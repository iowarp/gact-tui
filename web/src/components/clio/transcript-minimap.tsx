import type { Message } from '@clio/core/v3';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ListTreeIcon } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';
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
        <PopoverContent align="start" className="w-72 p-2" side="right">
          <p className="px-2 pb-2 text-xs font-medium text-muted-foreground">Transcript outline</p>
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {messages.map((message, index) => (
              <Button
                className="h-auto w-full justify-start px-2 py-1.5 text-left"
                key={message.id}
                onClick={() => onJump(index)}
                variant={index === activeIndex ? 'secondary' : 'ghost'}
              >
                <span className="truncate">{messagePreview(message)}</span>
              </Button>
            ))}
          </div>
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

function MinimapRail({
  activeIndex,
  messages,
  onActiveIndexChange,
  onJump,
  scrollTargetRef,
  useScrollspy,
}: Omit<ClioTranscriptMinimapProps, 'visible'>) {
  const railRef = useRef<HTMLDivElement>(null);
  // TanStack Virtual intentionally returns non-memoizable functions; this component owns them.
  // oxlint-disable-next-line react/incompatible-library
  const virtualizer = useVirtualizer({
    count: messages.length,
    estimateSize: () => 11,
    getScrollElement: () => railRef.current,
    overscan: 10,
  });
  const rows = virtualizer.getVirtualItems();
  const firstRow = rows[0];
  const lastRow = rows.at(-1);
  const rangeKey = `${firstRow?.index ?? -1}:${firstRow?.start ?? -1}:${lastRow?.index ?? -1}:${lastRow?.end ?? -1}`;
  useLayoutEffect(() => {
    if (activeIndex < 0) return;
    const rail = railRef.current;
    if (!rail || virtualizer.getTotalSize() <= rail.clientHeight) return;
    const offset = virtualizer.getOffsetForIndex(activeIndex, 'center')?.[0];
    if (offset !== undefined && Math.abs(rail.scrollTop - offset) >= 1) rail.scrollTop = offset;
  }, [activeIndex, rangeKey, virtualizer]);
  const content = (
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
                className="absolute left-0 flex h-2 w-full items-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
              <p className="text-xs font-medium capitalize text-muted-foreground">{message.role}</p>
              <p className="mt-1 line-clamp-3 text-sm">{messagePreview(message)}</p>
            </HoverCardContent>
          </HoverCard>
        );
      })}
    </div>
  );
  return (
    <aside
      aria-label="Transcript minimap"
      className="absolute inset-y-3 left-1 z-10 w-3 rounded-full bg-background/80 py-1 shadow-sm backdrop-blur-sm"
    >
      <div
        className="h-full overflow-y-auto px-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        ref={railRef}
      >
        {useScrollspy ? (
          <Scrollspy
            className="w-full"
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
