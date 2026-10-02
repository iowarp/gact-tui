import { CheckIcon, GitForkIcon, ListTreeIcon, UserRoundCheckIcon } from 'lucide-react';
import { useState } from 'react';
import { MessageResponse } from '@/components/ai-elements/message';
import { Reasoning, ReasoningContent, ReasoningTrigger } from '@/components/ai-elements/reasoning';
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from '@/components/reui/frame';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import type { VariantRunView, VariantTabView } from '@/lib/variant-runs';
import { HarnessInjection } from './conversation-message-blocks';
import { respondFromControl } from './interaction-control';
import { ResponseErrorNotice } from './pending-interaction-notices';
import { VariantTrySteps } from './variant-try-steps';

export type VariantPick = (candidateId: string, comment: string) => Promise<void>;

function formatScore(score: number): string {
  return score.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/** The tab's status words: never a colour or a dot alone. */
function TabBadges({ tab }: { tab: VariantTabView }) {
  return (
    <>
      {tab.state === 'running' ? (
        <Badge variant="secondary">
          <Spinner aria-hidden="true" data-icon="inline-start" />
          Running
        </Badge>
      ) : null}
      {tab.state === 'failed' ? <Badge variant="destructive">Failed</Badge> : null}
      {tab.score !== undefined ? (
        <Badge variant="outline">Score {formatScore(tab.score)}</Badge>
      ) : null}
      {tab.userPick ? (
        <Badge variant="outline">
          <UserRoundCheckIcon data-icon="inline-start" />
          Your pick
        </Badge>
      ) : null}
      {tab.selected ? (
        <Badge>
          <CheckIcon data-icon="inline-start" />
          Selected
        </Badge>
      ) : null}
    </>
  );
}

function TryActivity({ tab }: { tab: VariantTabView }) {
  if (tab.activity.length === 0) return null;
  return (
    <Collapsible>
      <CollapsibleTrigger className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
        <ListTreeIcon aria-hidden="true" className="size-3.5" />
        {tab.activity.length === 1 ? '1 step' : `${tab.activity.length} steps`}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ol className="mt-1 space-y-0.5 border-l pl-3 text-xs text-muted-foreground">
          {tab.activity.map((row, index) => (
            <li key={`${row.event_type}:${index}`}>{row.summary || row.event_type}</li>
          ))}
        </ol>
      </CollapsibleContent>
    </Collapsible>
  );
}

function PickPanel({
  tab,
  refinable,
  onPick,
}: {
  tab: VariantTabView;
  refinable: boolean;
  onPick: VariantPick;
}) {
  const [comment, setComment] = useState('');
  const [responding, setResponding] = useState(false);
  const [error, setError] = useState<Error>();
  if (!tab.candidateId) return null;
  const candidateId = tab.candidateId;
  const trimmed = comment.trim();
  const pick = async () => {
    if (responding) return;
    setResponding(true);
    setError(undefined);
    try {
      await onPick(candidateId, trimmed);
    } catch (failure) {
      setError(failure instanceof Error ? failure : new Error(String(failure)));
      throw failure;
    } finally {
      setResponding(false);
    }
  };
  const commentId = `variant-comment-${candidateId}`;
  return (
    <div className="flex flex-col gap-2 border-t pt-3" data-slot="variant-pick">
      <ResponseErrorNotice error={error} />
      {refinable ? (
        <Field>
          <FieldLabel htmlFor={commentId}>Comment for {tab.label} (optional)</FieldLabel>
          <Textarea
            disabled={responding}
            id={commentId}
            onChange={(event) => setComment(event.target.value)}
            placeholder="What should change?"
            rows={2}
            value={comment}
          />
          <FieldDescription>
            With a comment, this draft is refined into another try; without one, it is accepted.
          </FieldDescription>
        </Field>
      ) : null}
      <Button
        className="self-start"
        disabled={responding}
        onClick={() => respondFromControl(pick())}
        size="sm"
        type="button"
      >
        {responding ? <Spinner aria-hidden="true" data-icon="inline-start" /> : null}
        {trimmed && refinable ? `Refine ${tab.label}` : `Pick ${tab.label}`}
      </Button>
    </div>
  );
}

function TryPanel({
  tab,
  refinable,
  sessionId,
  onPick,
}: {
  tab: VariantTabView;
  refinable: boolean;
  sessionId: string;
  onPick?: VariantPick;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {tab.forkedFromLabel ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <GitForkIcon aria-hidden="true" className="size-3.5" />
          Refined from {tab.forkedFromLabel}
        </p>
      ) : null}
      {tab.injections.map((block) => (
        <HarnessInjection block={block} key={block.id} />
      ))}
      {tab.thinking ? (
        <Reasoning className="mb-0" isStreaming={tab.state === 'running' && !tab.text}>
          <ReasoningTrigger className="min-h-6" />
          <ReasoningContent className="mt-1 leading-5">{tab.thinking}</ReasoningContent>
        </Reasoning>
      ) : null}
      {tab.error ? (
        <Alert variant="destructive">
          <AlertTitle>{tab.label} failed</AlertTitle>
          <AlertDescription>{tab.error}</AlertDescription>
        </Alert>
      ) : null}
      {tab.text ? (
        <div className="min-w-0 text-sm" data-slot="variant-try-text">
          <MessageResponse>{tab.text}</MessageResponse>
        </div>
      ) : tab.state === 'running' ? (
        <p className="text-sm text-muted-foreground">Writing {tab.label}…</p>
      ) : tab.state !== 'failed' ? (
        <p className="text-sm text-muted-foreground">{tab.label} produced no text.</p>
      ) : null}
      <TryActivity tab={tab} />
      <VariantTrySteps advice={tab.advice} sessionId={sessionId} steps={tab.steps} />
      {tab.tokens !== undefined ? (
        <p className="text-xs text-muted-foreground">{tab.tokens.toLocaleString()} tokens</p>
      ) : null}
      {tab.comment ? (
        <p className="text-xs text-muted-foreground">
          Your comment: <span className="text-foreground">{tab.comment}</span>
        </p>
      ) : null}
      {onPick ? <PickPanel onPick={onPick} refinable={refinable} tab={tab} /> : null}
    </div>
  );
}

/**
 * A BestOfN / Refine run as tabs, one per try: each streams live while the
 * tries run in parallel, shows its score or the user's pick, and -- while the
 * run waits for the user -- carries the pick action and, for Refine, a comment
 * box. With no pick waiting it is the read-only record of the run.
 */
export function VariantTabsBlock({ view, onPick }: { view: VariantRunView; onPick?: VariantPick }) {
  const [active, setActive] = useState(String(view.defaultTab));
  // A new pick question or a selection moves the reader to the tab it is
  // about; a try merely finishing never pulls them off the tab they chose.
  const focusKey = `${view.pick?.interaction.id ?? ''}:${view.tabs.find((tab) => tab.selected)?.tryIndex ?? ''}`;
  const [shownFocusKey, setShownFocusKey] = useState(focusKey);
  if (shownFocusKey !== focusKey) {
    setShownFocusKey(focusKey);
    setActive(String(view.defaultTab));
  }
  const current = view.tabs.some((tab) => String(tab.tryIndex) === active)
    ? active
    : String(view.defaultTab);
  const canPick = Boolean(onPick && view.pick);
  return (
    <Frame
      aria-label={view.title}
      className="min-w-0 self-stretch"
      data-slot="variant-tabs"
      data-variants-id={view.variantsId}
      dense
      role="group"
      spacing="sm"
    >
      <FrameHeader className="flex-row flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <FrameTitle>{view.title}</FrameTitle>
        <FrameDescription>{view.method}</FrameDescription>
        <span className="ml-auto text-xs font-medium text-muted-foreground" role="status">
          {view.status}
        </span>
      </FrameHeader>
      <FramePanel className="min-w-0">
        {view.pick?.prompt ? (
          <p className="mb-2 text-sm text-foreground">{view.pick.prompt}</p>
        ) : null}
        <Tabs onValueChange={setActive} value={current}>
          <TabsList
            aria-label="Tries"
            className="clio-scrollbar h-auto w-full max-w-full justify-start overflow-x-auto"
            variant="line"
          >
            {view.tabs.map((tab) => (
              <TabsTrigger
                className="h-auto flex-none gap-1.5 py-1"
                key={tab.tryIndex}
                value={String(tab.tryIndex)}
              >
                <span>{tab.label}</span>
                <TabBadges tab={tab} />
              </TabsTrigger>
            ))}
          </TabsList>
          {view.tabs.map((tab) => (
            <TabsContent className="min-w-0 pt-2" key={tab.tryIndex} value={String(tab.tryIndex)}>
              <TryPanel
                onPick={canPick ? onPick : undefined}
                refinable={view.refinable}
                sessionId={view.sessionId}
                tab={tab}
              />
            </TabsContent>
          ))}
        </Tabs>
      </FramePanel>
    </Frame>
  );
}
