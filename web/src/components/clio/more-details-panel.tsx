import type { Message, Session } from '@clio/core/v3';
import { EyeIcon, MessageSquareQuoteIcon, QuoteIcon, SendIcon } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { useLiveSessionTranscript } from '@/hooks/use-live-session-transcript';
import type { AgentAnswerTextSelection } from '@/lib/selection-actions';
import { isSessionActive } from '@/lib/session-state';
import { ClioConversation } from './conversation';
import { ClioStatus } from './status';

export interface ClioMoreDetailsPanelProps {
  workspaceId: string;
  side?: Session;
  selection?: AgentAnswerTextSelection;
  opening: boolean;
  onAsk: (text: string) => Promise<void>;
  onClose: () => void;
  /** Attach an aside answer to the main composer as a quote. */
  onAddToChat: (text: string) => void;
}

/** An answer's final prose: its last text block (earlier ones narrate the work). */
function answerText(message: Message): string {
  const texts = message.blocks.flatMap((block) => (block.type === 'text' ? [block.text] : []));
  return (texts.at(-1) ?? '').trim();
}

/**
 * The "More details" side panel: a read-only side conversation about a
 * selected passage. It shows only what was asked and answered in the aside
 * (the copied parent history it reasons over is not repeated), accepts
 * follow-up questions, and offers the latest answer to the main chat. Nothing
 * here reaches the main transcript unless the person adds it.
 */
export function ClioMoreDetailsPanel({
  workspaceId,
  side,
  selection,
  opening,
  onAsk,
  onClose,
  onAddToChat,
}: ClioMoreDetailsPanelProps) {
  const [draft, setDraft] = useState('');
  const [asking, setAsking] = useState(false);
  const { entities, messages, transcript } = useLiveSessionTranscript(
    workspaceId,
    side?.id,
    'aside',
  );
  // The aside carries the parent's history as context; its own exchange is
  // what was created after it opened.
  const exchange = useMemo(
    () => (side ? messages.filter((message) => message.created_at >= side.created_at) : []),
    [messages, side],
  );
  // A turn is live in the aside: follow-ups wait for it (the service runs one
  // turn per session), and the header says so.
  const answering = Boolean(
    side && isSessionActive(entities.sessions[side.id]?.state ?? 'completed'),
  );
  const latestAnswer = [...exchange].reverse().find((message) => message.role === 'assistant');
  const latestAnswerText = latestAnswer ? answerText(latestAnswer) : '';
  const open = Boolean(selection);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !side) return;
    setAsking(true);
    try {
      await onAsk(text);
      setDraft('');
    } finally {
      setAsking(false);
    }
  };

  return (
    // Non-modal: the conversation stays readable and selectable beside the
    // panel; only the close button (or Escape) dismisses it.
    <Sheet modal={false} onOpenChange={(next) => (next ? undefined : onClose())} open={open}>
      <SheetContent
        className="w-full gap-0 p-0 data-[side=right]:sm:max-w-lg"
        onInteractOutside={(event) => event.preventDefault()}
        side="right"
      >
        <SheetHeader className="border-b pr-12">
          <div className="flex items-center gap-2">
            <SheetTitle>More details</SheetTitle>
            {answering ? <ClioStatus label="Answering" value="running" /> : null}
          </div>
          <SheetDescription className="flex items-center gap-1.5 text-xs">
            <EyeIcon aria-hidden="true" className="size-3.5 shrink-0" />
            Read-only side conversation. It can read this session but never changes it.
          </SheetDescription>
        </SheetHeader>
        {selection ? (
          <div className="mx-4 mt-3 flex min-w-0 items-start gap-2 rounded-lg border bg-muted/40 px-3 py-2">
            <QuoteIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-muted-foreground">Selected text</p>
              <p className="line-clamp-3 break-words text-xs leading-5">{selection.text}</p>
            </div>
          </div>
        ) : null}
        <div className="min-h-0 flex-1" data-slot="more-details-conversation">
          {side ? (
            <ClioConversation
              actionLifecycles={entities.a2ui_action_lifecycles}
              artifacts={entities.artifacts}
              error={transcript.error?.message}
              loading={transcript.isPending}
              messages={exchange}
              subagents={entities.subagents}
              surfaces={entities.surfaces}
              tasks={entities.tasks}
              tools={entities.tools}
              workspaceId={workspaceId}
            />
          ) : (
            <p className="p-6 text-center text-sm text-muted-foreground" role="status">
              {opening ? 'Opening a side conversation…' : 'The side conversation is not open.'}
            </p>
          )}
        </div>
        <form className="grid gap-2 border-t p-3" onSubmit={(event) => void submit(event)}>
          <Textarea
            aria-label="Ask a follow-up question"
            className="min-h-16 resize-none text-sm"
            disabled={!side}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Ask a follow-up about this passage…"
            value={draft}
          />
          <div className="flex items-center justify-between gap-2">
            <Button
              disabled={!latestAnswerText || answering}
              onClick={() => onAddToChat(latestAnswerText)}
              size="sm"
              type="button"
              variant="outline"
            >
              <MessageSquareQuoteIcon aria-hidden="true" />
              Add answer to chat
            </Button>
            <Button
              disabled={!side || asking || answering || !draft.trim()}
              size="sm"
              type="submit"
            >
              <SendIcon aria-hidden="true" />
              Ask
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
