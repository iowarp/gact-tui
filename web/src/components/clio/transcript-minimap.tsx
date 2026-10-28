import type { AttentionAvailable, Message } from '@clio/core/v3';
import { useVirtualizer } from '@tanstack/react-virtual';
import { BookmarkIcon, ListTreeIcon } from 'lucide-react';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { handleScrollableRegionKeys } from '@/lib/scrollable-region-keys';
import {
  transcriptMessagePreviews,
  type TranscriptMessagePreview as Preview,
} from '@/lib/transcript-message-preview';
import { type AttentionMinimapMark, attentionMinimapMarks } from '@/lib/attention-minimap-marks';
import { formatSharePercent } from '@/lib/attention-text';
import { magnifyRows } from '@/lib/minimap-magnify';
import { cn } from '@/lib/utils';
import { TranscriptMessagePreview } from './transcript-message-preview';

interface ClioTranscriptMinimapProps {
  activeIndex: number;
  /** While attention mode is shown: landmarks turn into heat marks. */
  attention?: AttentionAvailable;
  messages: readonly Message[];
  onJump: (index: number) => void;
  visible: boolean;
  /** Hover length bounded by the conversation's available left margin. */
  maxMarkerWidth?: number;
  markedMessageIds?: ReadonlySet<string>;
  markingMessageId?: string;
  onMarkMessage?: (messageId: string, marked: boolean) => Promise<void>;
}

type NavigationProps = Omit<ClioTranscriptMinimapProps, 'visible'> & {
  previews: ReadonlyMap<string, Preview>;
};

export function ClioTranscriptMinimap({
  activeIndex,
  attention,
  messages,
  onJump,
  visible,
  maxMarkerWidth = 24,
  ...marks
}: ClioTranscriptMinimapProps) {
  const previews = useMemo(() => transcriptMessagePreviews(messages), [messages]);
  if (!visible) {
    return (
      <TranscriptOutline
        activeIndex={activeIndex}
        messages={messages}
        onJump={onJump}
        previews={previews}
        {...marks}
      />
    );
  }
  return (
    <MinimapRail
      activeIndex={activeIndex}
      attention={attention}
      messages={messages}
      onJump={onJump}
      maxMarkerWidth={maxMarkerWidth}
      previews={previews}
      {...marks}
    />
  );
}

function TranscriptOutline({
  activeIndex,
  messages,
  onJump,
  previews,
  markedOnly = false,
  inRail = false,
  ...marks
}: NavigationProps & { markedOnly?: boolean; inRail?: boolean }) {
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [onlyMarked, setOnlyMarked] = useState(markedOnly);
  const count = messages.filter((message) => marks.markedMessageIds?.has(message.id)).length;
  const label = markedOnly ? 'Marked messages' : 'Transcript outline';
  return (
    <Popover open={outlineOpen} onOpenChange={setOutlineOpen}>
      <PopoverTrigger asChild>
        <Button
          aria-label={markedOnly ? `Open marked messages (${count})` : 'Open transcript outline'}
          className={cn(
            'z-10 rounded-full',
            inRail ? 'mb-1 size-6 shrink-0' : 'absolute top-2 -left-0.5',
          )}
          size="icon-xs"
          variant="outline"
        >
          {markedOnly ? (
            <BookmarkIcon aria-hidden="true" className="size-3" fill="currentColor" />
          ) : (
            <ListTreeIcon aria-hidden="true" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label={label}
        className={cn(
          'flex w-80 min-w-64 max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] flex-col resize overflow-hidden p-2',
          onlyMarked ? 'min-h-24' : 'h-80 min-h-48',
        )}
        style={onlyMarked ? { height: Math.min(320, 40 + 72 * count) } : undefined}
        side="right"
      >
        <div className="mb-1 flex shrink-0 items-center justify-between px-2">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          {!markedOnly ? (
            <Button
              aria-pressed={onlyMarked}
              onClick={() => setOnlyMarked(!onlyMarked)}
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
            >
              Marked ({count})
            </Button>
          ) : null}
        </div>
        <TranscriptOutlineList
          activeIndex={activeIndex}
          messages={messages}
          previews={previews}
          onlyMarked={onlyMarked}
          {...marks}
          onJump={(index) => {
            setOutlineOpen(false);
            onJump(index);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function TranscriptOutlineList({
  activeIndex,
  messages,
  onJump,
  previews,
  onlyMarked,
  ...marks
}: NavigationProps & { onlyMarked: boolean }) {
  const listRef = useRef<HTMLDivElement>(null);
  const indices = useMemo(
    () =>
      messages.flatMap((message, index) =>
        onlyMarked && !marks.markedMessageIds?.has(message.id) ? [] : [index],
      ),
    [messages, onlyMarked, marks.markedMessageIds],
  );
  // TanStack Virtual intentionally returns non-memoizable functions; this component owns them.
  // oxlint-disable-next-line react/incompatible-library
  const virtualizer = useVirtualizer({
    count: indices.length,
    estimateSize: () => 72,
    getItemKey: (index) => messages[indices[index] ?? -1]?.id ?? index,
    getScrollElement: () => listRef.current,
    overscan: 6,
  });
  useLayoutEffect(() => {
    const position = indices.indexOf(activeIndex);
    if (position >= 0) virtualizer.scrollToIndex(position, { align: 'center' });
  }, [activeIndex, indices, virtualizer]);
  return (
    <div
      className="clio-scrollbar min-h-0 flex-1 overflow-y-auto"
      data-slot="transcript-outline-list"
      ref={listRef}
    >
      {indices.length === 0 ? (
        <p className="px-2 py-4 text-sm text-muted-foreground">
          No marked messages yet. Use the bookmark beside a message or in its rail preview.
        </p>
      ) : null}
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((row) => {
          const index = indices[row.index] ?? -1;
          const message = messages[index];
          if (!message) return null;
          return (
            <div
              className="absolute top-0 left-0 w-full pr-1"
              data-index={row.index}
              key={row.key}
              style={{ height: row.size, transform: `translateY(${row.start}px)` }}
            >
              <TranscriptOutlineItem
                active={index === activeIndex}
                index={index}
                message={message}
                onJump={onJump}
                previews={previews}
                {...marks}
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
  previews,
  markedMessageIds,
  markingMessageId,
  onMarkMessage,
}: Pick<NavigationProps, 'previews' | 'markedMessageIds' | 'markingMessageId' | 'onMarkMessage'> & {
  active: boolean;
  index: number;
  message: Message;
  onJump: (index: number) => void;
}) {
  const preview = previews.get(message.id)!;
  const marked = markedMessageIds?.has(message.id) ?? false;
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
      <div className="grid h-full rounded-md">
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
          <p className="flex min-w-0 items-center gap-1 text-left text-xs font-semibold">
            {marked ? <BookmarkIcon className="size-3 shrink-0" fill="currentColor" /> : null}
            <span className="truncate">{preview.title}</span>
          </p>
          {preview.body ? (
            <p className="line-clamp-2 text-left text-xs leading-4 text-muted-foreground">
              {preview.body}
            </p>
          ) : null}
        </div>
      </div>
      <HoverCardContent
        align="start"
        aria-label={`${message.role} message ${index + 1} preview`}
        className="w-72 max-w-[calc(100vw-2rem)] p-3"
        role="region"
        side="right"
      >
        <TranscriptMessagePreview
          preview={preview}
          marked={marked}
          pending={markingMessageId !== undefined}
          onMark={onMarkMessage ? (value) => onMarkMessage(message.id, value) : undefined}
        />
      </HoverCardContent>
    </HoverCard>
  );
}

function MinimapRail({
  activeIndex,
  attention,
  messages,
  onJump,
  maxMarkerWidth = 24,
  previews,
  ...marks
}: NavigationProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const [pointerY, setPointerY] = useState<number | null>(null);
  const heat = new Map<number, AttentionMinimapMark>(
    attentionMinimapMarks(attention, messages).map((mark) => [mark.messageIndex, mark]),
  );
  const lastRevealedActiveIndexRef = useRef<number | null>(null);
  // TanStack Virtual intentionally returns non-memoizable functions; this component owns them.
  // oxlint-disable-next-line react/incompatible-library
  const virtualizer = useVirtualizer({
    count: messages.length,
    estimateSize: () => ROW_HEIGHT,
    getScrollElement: () => railRef.current,
    overscan: 10,
  });
  const rows = virtualizer.getVirtualItems();
  const placed = magnifyRows(
    rows.map((row) => row.start),
    ROW_HEIGHT,
    pointerY,
  );
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
      <div
        className="relative w-full"
        onPointerLeave={() => setPointerY(null)}
        onPointerMove={(event) =>
          setPointerY(event.clientY - event.currentTarget.getBoundingClientRect().top)
        }
        style={{ height: virtualizer.getTotalSize() }}
      >
        {rows.map((row, position) => {
          const message = messages[row.index];
          if (!message) return null;
          const mark = heat.get(row.index);
          const look = attention ? heatLook(mark) : landmarkLook(message);
          const restingWidth = look.base * Math.min(1.5, maxMarkerWidth / 24);
          const active = row.index === activeIndex;
          const marked = marks.markedMessageIds?.has(message.id) ?? false;
          const lift = placed[position]?.lift ?? 0;
          const activeWidth = Math.min(maxMarkerWidth * 0.5, restingWidth * 1.5);
          const baseWidth = active ? Math.max(restingWidth, activeWidth) : restingWidth;
          return (
            <HoverCard key={message.id} openDelay={120}>
              <HoverCardTrigger asChild>
                <button
                  aria-label={`Jump to ${message.role} message ${row.index + 1}`}
                  aria-current={active ? 'location' : undefined}
                  className="group absolute left-0 flex w-full items-center outline-none"
                  onClick={() => onJump(row.index)}
                  style={{
                    height: placed[position]?.height ?? ROW_HEIGHT,
                    transform: `translateY(${placed[position]?.y ?? row.start}px)`,
                    transition: 'transform 120ms ease-out, height 120ms ease-out',
                  }}
                  type="button"
                >
                  <span
                    className={cn(
                      'rounded-full transition-[width,height,opacity] duration-150 ease-out group-focus-visible:opacity-100',
                      marked && !attention ? 'bg-foreground' : look.color,
                      marked && 'ring-1 ring-foreground/30',
                    )}
                    data-heat={mark?.heated ? mark.bucket : undefined}
                    data-slot="transcript-minimap-landmark"
                    data-marked={marked || undefined}
                    style={{
                      height: (active ? 4 : 3) + 2 * lift,
                      opacity: active || marked ? 1 : look.opacity + (1 - look.opacity) * lift,
                      width: Math.max(
                        marked ? Math.min(maxMarkerWidth, 15) : 0,
                        baseWidth + (maxMarkerWidth - baseWidth) * lift,
                      ),
                    }}
                  />
                </button>
              </HoverCardTrigger>
              <HoverCardContent
                align="start"
                aria-label={`${message.role} message ${row.index + 1} preview`}
                className="w-72 max-w-[calc(100vw-2rem)] p-3"
                role="region"
                side="right"
              >
                <TranscriptMessagePreview
                  preview={previews.get(message.id)!}
                  marked={marked}
                  pending={marks.markingMessageId !== undefined}
                  onMark={
                    marks.onMarkMessage
                      ? (value) => marks.onMarkMessage!(message.id, value)
                      : undefined
                  }
                />
                {mark ? (
                  <p
                    className={cn(
                      'mt-1 text-xs',
                      mark.heated ? 'text-chart-5' : 'text-muted-foreground',
                    )}
                  >
                    {formatSharePercent(mark.conversationShare)} of the attention on the
                    conversation
                  </p>
                ) : null}
              </HoverCardContent>
            </HoverCard>
          );
        })}
      </div>
    </div>
  );
  return (
    <aside
      aria-label="Transcript minimap"
      className="absolute inset-y-3 left-1 z-10 flex flex-col items-start"
      style={{ width: maxMarkerWidth + 4 }}
    >
      {messages.some((message) => marks.markedMessageIds?.has(message.id)) ? (
        <TranscriptOutline
          activeIndex={activeIndex}
          messages={messages}
          onJump={onJump}
          previews={previews}
          markedOnly
          inRail
          {...marks}
        />
      ) : null}
      <div
        aria-label="Browse transcript landmarks"
        className="min-h-0 w-full flex-1 overflow-y-auto overscroll-y-contain px-0.5 outline-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        data-slot="transcript-minimap-scroll-area"
        onKeyDown={handleScrollableRegionKeys}
        onWheel={(event) => event.stopPropagation()}
        ref={railRef}
        tabIndex={0}
      >
        {content}
      </div>
    </aside>
  );
}

const ROW_HEIGHT = 11;

interface LandmarkLook {
  color: string;
  /** Resting length (px). */
  base: number;
  /** Resting opacity. */
  opacity: number;
}

/**
 * Attention mode: heated messages are red, longer and stronger with their
 * share of the attention; the rest fade back so the heat stands out.
 */
// Resting lengths stay short so heat marks grow on approach like any landmark.
const HEAT_LOOKS: readonly LandmarkLook[] = [
  { color: 'bg-chart-5', base: 6, opacity: 0.55 },
  { color: 'bg-chart-5', base: 9, opacity: 0.7 },
  { color: 'bg-chart-5', base: 12, opacity: 0.85 },
  { color: 'bg-chart-5', base: 15, opacity: 1 },
];

function heatLook(mark: AttentionMinimapMark | undefined): LandmarkLook {
  if (!mark?.heated) return { color: 'bg-muted-foreground', base: 5, opacity: 0.25 };
  return HEAT_LOOKS[mark.bucket] ?? HEAT_LOOKS[0]!;
}

function landmarkLook(message: Message): LandmarkLook {
  const look = (color: string, base: number): LandmarkLook => ({ color, base, opacity: 0.6 });
  if (message.blocks.some((block) => block.type === 'error')) return look('bg-destructive', 12);
  if (message.blocks.some((block) => block.type === 'a2ui')) return look('bg-category-2', 10);
  if (message.blocks.some((block) => block.type === 'artifact')) return look('bg-category-11', 10);
  if (message.blocks.some((block) => block.type === 'action_card')) {
    return look('bg-chart-2', 10);
  }
  if (
    message.blocks.some((block) => ['reasoning', 'task', 'tool', 'subagent'].includes(block.type))
  ) {
    return look('bg-category-5', 8);
  }
  return message.role === 'user' ? look('bg-primary', 12) : look('bg-muted-foreground', 10);
}
