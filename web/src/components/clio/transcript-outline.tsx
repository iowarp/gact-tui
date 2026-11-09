import type { Message } from '@clio/core/v3';
import { useVirtualizer } from '@tanstack/react-virtual';
import { BookmarkIcon, ListTreeIcon } from 'lucide-react';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  transcriptMessagePreviews,
  type TranscriptMessagePreview as Preview,
} from '@/lib/transcript-message-preview';
import { cn } from '@/lib/utils';
import { ListRow } from './primitives/list-row';
import { TranscriptMessagePreview } from './transcript-message-preview';

interface ClioTranscriptOutlineProps {
  activeIndex: number;
  messages: readonly Message[];
  onJump: (index: number) => void;
  markedMessageIds?: ReadonlySet<string>;
  markingMessageId?: string;
  onMarkMessage?: (messageId: string, marked: boolean) => Promise<void>;
}

type NavigationProps = ClioTranscriptOutlineProps & {
  previews: ReadonlyMap<string, Preview>;
};

/**
 * The transcript outline: one small button at the conversation's top left
 * opening a list of every message, filterable to marked ones. The spec has no
 * landmark strip beside the transcript, so this is the transcript's only index.
 */
export function ClioTranscriptOutline({
  activeIndex,
  messages,
  onJump,
  ...marks
}: ClioTranscriptOutlineProps) {
  const previews = useMemo(() => transcriptMessagePreviews(messages), [messages]);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [onlyMarked, setOnlyMarked] = useState(false);
  const count = messages.filter((message) => marks.markedMessageIds?.has(message.id)).length;
  const label = 'Transcript outline';
  return (
    <Popover open={outlineOpen} onOpenChange={setOutlineOpen}>
      <PopoverTrigger asChild>
        <Button
          aria-label="Open transcript outline"
          className="absolute top-2 -left-0.5 z-10 rounded-full"
          size="icon-xs"
          title="Transcript outline"
          variant="outline"
        >
          <ListTreeIcon aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label={label}
        className={cn(
          'flex w-80 min-w-64 max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] flex-col resize overflow-hidden p-2',
          onlyMarked ? 'min-h-24' : 'h-80 min-h-48',
        )}
        style={onlyMarked ? { height: Math.min(320, 40 + OUTLINE_ROW_HEIGHT * count) } : undefined}
        side="right"
      >
        <div className="mb-1 flex shrink-0 items-center justify-between px-2">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <Button
            aria-pressed={onlyMarked}
            onClick={() => setOnlyMarked(!onlyMarked)}
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
          >
            Marked ({count})
          </Button>
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
  const anyMarked = indices.some((index) => marks.markedMessageIds?.has(messages[index]?.id ?? ''));
  // TanStack Virtual intentionally returns non-memoizable functions; this component owns them.
  // oxlint-disable-next-line react/incompatible-library
  const virtualizer = useVirtualizer({
    count: indices.length,
    estimateSize: () => OUTLINE_ROW_HEIGHT,
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
            <TranscriptOutlineItem
              active={index === activeIndex}
              iconColumn={anyMarked}
              index={index}
              key={row.key}
              message={message}
              onJump={onJump}
              position={row.index}
              previews={previews}
              start={row.start}
              {...marks}
            />
          );
        })}
      </div>
    </div>
  );
}

const OUTLINE_ROW_HEIGHT = 28;

/**
 * One 28px outline line: the message's name, then its muted context cut with
 * an ellipsis; the full text is the hover preview. A bookmark glyph names a
 * marked message and the current message says "Here" as well as highlighting.
 */
function TranscriptOutlineItem({
  active,
  iconColumn,
  index,
  message,
  onJump,
  position,
  previews,
  start,
  markedMessageIds,
  markingMessageId,
  onMarkMessage,
}: Pick<NavigationProps, 'previews' | 'markedMessageIds' | 'markingMessageId' | 'onMarkMessage'> & {
  active: boolean;
  /** Reserve the bookmark column on every row once any listed message is marked. */
  iconColumn: boolean;
  index: number;
  message: Message;
  onJump: (index: number) => void;
  /** Virtual row index and offset. */
  position: number;
  start: number;
}) {
  const preview = previews.get(message.id)!;
  const marked = markedMessageIds?.has(message.id) ?? false;
  const previewDismissedRef = useRef(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const jump = () => {
    previewDismissedRef.current = true;
    setPreviewOpen(false);
    onJump(index);
  };
  return (
    <HoverCard
      onOpenChange={(open) => {
        if (open && previewDismissedRef.current) return;
        setPreviewOpen(open);
      }}
      open={previewOpen}
      openDelay={120}
    >
      <HoverCardTrigger asChild>
        <ListRow
          aria-current={active ? 'location' : undefined}
          aria-label={`Jump to ${message.role} message ${index + 1}${marked ? ', marked' : ''}`}
          className="absolute top-0 right-1 left-0 cursor-pointer text-[12.5px] text-foreground"
          data-index={position}
          data-slot="transcript-outline-row"
          description={preview.body ? preview.body.replaceAll(/\s+/gu, ' ') : undefined}
          icon={
            iconColumn ? (
              marked ? (
                <BookmarkIcon className="size-3.5" fill="currentColor" />
              ) : (
                <span />
              )
            ) : undefined
          }
          meta={<span className="text-[11px] text-muted-foreground">{active ? 'Here' : null}</span>}
          onClick={jump}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            jump();
          }}
          onPointerLeave={() => {
            previewDismissedRef.current = false;
          }}
          role="button"
          selected={active}
          style={{ transform: `translateY(${start}px)` }}
          tabIndex={0}
          title={preview.title}
        />
      </HoverCardTrigger>
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
