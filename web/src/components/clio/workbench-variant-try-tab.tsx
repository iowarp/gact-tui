import type { Message } from '@clio/core/v3';
import { GitForkIcon, ListTreeIcon } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { MessageResponse } from '@/components/ai-elements/message';
import { Reasoning, ReasoningContent, ReasoningTrigger } from '@/components/ai-elements/reasoning';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { variantRunView, type VariantTabView } from '@/lib/variant-runs';
import { setShownVariantTry, variantTryState } from '@/lib/variant-try-tabs';
import { useLiveStore } from '@/store/live-store';
import { HarnessInjection } from './conversation-harness-injection';
import { FrameBar, FrameCrumbs } from './primitives/frame-bar';
import { StateView } from './primitives/state-view';
import { VariantTrySteps } from './variant-try-steps';
import type { WorkbenchTab } from './workbench-shared';
import { t, ph, plural } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';

const NO_INTERACTIONS = [] as const;

function TryActivity({ tab }: { tab: VariantTabView }) {
  if (tab.activity.length === 0) return null;
  return (
    <Collapsible>
      <CollapsibleTrigger className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
        <ListTreeIcon aria-hidden="true" className="size-3.5" />
        {plural(tab.activity.length, { one: '# step', other: '# steps' })}
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

/** One try's own line: what it was given, its thinking, its text and its steps. */
function TryBody({ tab, sessionId }: { tab: VariantTabView; sessionId: string }) {
  return (
    <div className="mx-auto flex w-full max-w-[760px] min-w-0 flex-col gap-3 px-4 py-3">
      {tab.forkedFromLabel ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <GitForkIcon aria-hidden="true" className="size-3.5" />
          {t`Refined from ${ph({ forkedFromLabel: tab.forkedFromLabel })}`}
        </p>
      ) : null}
      {tab.injections.map((block) => (
        <HarnessInjection block={block} key={block.id} />
      ))}
      {tab.thinking ? (
        <Reasoning className="mb-0" defaultOpen={false}>
          <ReasoningTrigger className="min-h-6" />
          <ReasoningContent className="mt-1 leading-5">{tab.thinking}</ReasoningContent>
        </Reasoning>
      ) : null}
      {tab.error ? (
        <Alert variant="destructive">
          <AlertTitle>{t`${ph({ label: tab.label })} failed`}</AlertTitle>
          <AlertDescription>{tab.error}</AlertDescription>
        </Alert>
      ) : null}
      {tab.text ? (
        <div className="min-w-0 text-sm" data-slot="variant-try-text">
          <MessageResponse>{tab.text}</MessageResponse>
        </div>
      ) : tab.state === 'running' ? (
        <p className="text-sm text-muted-foreground">{t`Writing ${ph({ label: tab.label })}…`}</p>
      ) : tab.state !== 'failed' ? (
        <p className="text-sm text-muted-foreground">{t`${ph({ label: tab.label })} produced no text.`}</p>
      ) : null}
      <TryActivity tab={tab} />
      <VariantTrySteps advice={tab.advice} sessionId={sessionId} steps={tab.steps} />
      {tab.comment ? (
        <p className="text-xs text-muted-foreground">
          <Trans>
            Your comment: <span className="text-foreground">{tab.comment}</span>
          </Trans>
        </p>
      ) : null}
    </div>
  );
}

/**
 * A variant run's try as a workbench tab (conversation-states "Variant pick":
 * the tries are workbench tabs, the card only picks). Showing it tells the
 * run's pick card which try it is about.
 */
export function WorkbenchVariantTryTab({
  tab,
}: {
  tab: Extract<WorkbenchTab, { kind: 'variant-try' }>;
}) {
  const run = useLiveStore((state) => state.entities.variant_runs[tab.variantsId]);
  const allMessages = useLiveStore((state) => state.entities.messages);
  const conversation = useLiveStore((state) => state.entities.sessions[tab.sessionId]?.title);
  const messages = useMemo(
    () =>
      Object.values(allMessages).filter(
        (message): message is Message => message.session_id === tab.sessionId,
      ),
    [allMessages, tab.sessionId],
  );
  const view = useMemo(
    () => (run ? variantRunView(run, NO_INTERACTIONS, messages) : undefined),
    [messages, run],
  );
  const shown = view?.tabs.find((item) => item.tryIndex === tab.tryIndex);
  useEffect(() => setShownVariantTry(tab.variantsId, tab.tryIndex), [tab.tryIndex, tab.variantsId]);
  const name = shown?.label ?? tab.label;
  const facts: string[] = shown
    ? [
        variantTryState(shown) ?? '',
        shown.selected ? 'selected' : '',
        shown.tokens !== undefined
          ? plural(shown.tokens, { one: '# token', other: '# tokens' })
          : '',
      ].filter(Boolean)
    : [];
  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-slot="variant-try-tab">
      <FrameBar
        label={t`${name} actions`}
        what={
          facts.length ? (
            <>
              {facts.map((fact) => (
                <span className="tabular-nums" key={fact}>
                  {fact}
                </span>
              ))}
            </>
          ) : undefined
        }
        where={
          <FrameCrumbs
            parts={conversation ? [{ label: conversation }, { label: name }] : [{ label: name }]}
          />
        }
      />
      {shown && view ? (
        <div className="clio-scrollbar min-h-0 flex-1 overflow-y-auto">
          <TryBody sessionId={view.sessionId} tab={shown} />
        </div>
      ) : (
        <StateView
          className="min-h-0 flex-1"
          detail={t`Its run is no longer in this conversation.`}
          kind="empty"
          size="viewer"
          title={t`${ph({ label: tab.label })} is not available`}
        />
      )}
    </div>
  );
}
