import { ChevronRightIcon, GitForkIcon, ListTreeIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { followTranscriptLink } from '@/lib/inline-question';
import type { VariantRunView, VariantTabView } from '@/lib/variant-runs';
import {
  claimVariantTriesOpen,
  openVariantTries,
  useShownVariantTry,
  variantTryState,
} from '@/lib/variant-try-tabs';
import { cn } from '@/lib/utils';
import {
  AskAnsweredRow,
  AskButton,
  AskCard,
  AskError,
  AskFooter,
  AskHint,
  AskKeyChip,
  AskOptions,
  AskSection,
} from './ask-card';
import { askKeyAttributes } from './ask-card-keys';
import { respondFromControl } from './interaction-control';
import { SPLIT_WORKBENCH_QUERY } from './workbench-shared';

export type VariantPick = (candidateId: string, comment: string) => Promise<void>;

function openTries(view: VariantRunView, tryIndex: number) {
  openVariantTries({
    sessionId: view.sessionId,
    variantsId: view.variantsId,
    tryIndex,
    tries: view.tabs.map((tab) => ({ tryIndex: tab.tryIndex, label: tab.label })),
  });
}

/** `Nov 8`: when the drafts expire; the full date and time is the hover name. */
function expiry(expiresAt: string | undefined) {
  if (!expiresAt) return undefined;
  const at = new Date(expiresAt);
  if (Number.isNaN(at.getTime())) return undefined;
  return {
    day: at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    full: at.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
  };
}

function stepCount(tab: VariantTabView): number {
  return tab.steps.length || tab.activity.length;
}

/**
 * The pick a user-judged run waits for (conversation-states "Variant pick"):
 * the tries are workbench tabs and this card only picks. It follows the try
 * the workbench shows; `[` `]` step through the others.
 */
function VariantPickCard({ view, onPick }: { view: VariantRunView; onPick: VariantPick }) {
  const pick = view.pick!;
  const shownTry = useShownVariantTry(view.variantsId);
  const candidates = view.tabs.filter((tab) => tab.candidateId);
  const current =
    candidates.find((tab) => tab.tryIndex === shownTry) ??
    candidates.find((tab) => tab.tryIndex === view.defaultTab) ??
    candidates[0];
  const [comment, setComment] = useState('');
  const [responding, setResponding] = useState(false);
  const [error, setError] = useState<Error>();
  const [criteriaOpen, setCriteriaOpen] = useState(false);
  const commentRef = useRef<HTMLInputElement>(null);

  // A new pick brings its tries into the workbench once, beside the conversation;
  // where the workbench would slide over this card, its steps and [ ] open them.
  useEffect(() => {
    if (!window.matchMedia?.(SPLIT_WORKBENCH_QUERY).matches) return;
    if (claimVariantTriesOpen(view.variantsId))
      openTries(view, current?.tryIndex ?? view.defaultTab);
    // Only the run's first pick opens them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.variantsId]);

  if (!current?.candidateId) return null;
  const candidateId = current.candidateId;
  const trimmed = comment.trim();
  const respond = (withComment: boolean) => {
    if (responding) return;
    if (withComment && !trimmed) {
      commentRef.current?.focus();
      return;
    }
    setResponding(true);
    setError(undefined);
    respondFromControl(
      onPick(candidateId, withComment ? trimmed : '')
        .catch((failure: unknown) => {
          setError(failure instanceof Error ? failure : new Error(String(failure)));
          throw failure;
        })
        .finally(() => setResponding(false)),
    );
  };
  const step = (by: number) => {
    if (candidates.length < 2) return;
    const index = candidates.indexOf(current);
    const next = candidates[(index + by + candidates.length) % candidates.length]!;
    openTries(view, next.tryIndex);
  };
  const expires = expiry(pick.expiresAt);
  const steps = stepCount(current);
  const noun = view.noun.toLowerCase();
  return (
    <AskCard
      aria-label={`Pick a ${noun}`}
      data-slot="variant-pick"
      data-variants-id={view.variantsId}
      icon={GitForkIcon}
      kind="verify"
      meta={
        <span title={expires ? `Drafts expire ${expires.full}` : undefined}>
          {view.strategy}
          {expires ? `, drafts expire ${expires.day}` : ''}
        </span>
      }
      title={`Pick a ${noun}`}
    >
      {pick.prompt ? (
        <AskSection className="text-[12.5px] text-foreground/85">{pick.prompt}</AskSection>
      ) : null}
      {view.refinable ? (
        <AskSection className="mt-2.5">
          <Input
            aria-label={`What should change in ${current.label}`}
            className="h-[34px] min-w-0 rounded-[7px] border-input text-[12.5px] md:text-[12.5px]"
            disabled={responding}
            onChange={(event) => setComment(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
              event.preventDefault();
              respond(Boolean(trimmed));
            }}
            placeholder={`What should change in ${current.label}? (optional)`}
            ref={commentRef}
            value={comment}
          />
        </AskSection>
      ) : null}
      <AskOptions aria-label={`Pick a ${noun}`}>
        <AskButton
          disabled={responding}
          hint="Enter"
          number={1}
          onClick={() => respond(false)}
          primary
        >
          Pick {current.label}
        </AskButton>
        {view.refinable ? (
          <AskButton
            disabled={responding}
            number={2}
            onClick={() => respond(true)}
            title={trimmed ? undefined : `Write what should change in ${current.label} first`}
          >
            Refine {current.label}
          </AskButton>
        ) : null}
      </AskOptions>
      <AskError error={error} />
      <AskFooter>
        {view.rubric ? (
          <AskHint aria-expanded={criteriaOpen} onClick={() => setCriteriaOpen((open) => !open)}>
            <ChevronRightIcon
              aria-hidden="true"
              className={cn(
                'mr-1.5 inline size-[13px] align-[-2px] motion-safe:transition-transform',
                criteriaOpen && 'rotate-90',
              )}
            />
            Evaluation criteria
          </AskHint>
        ) : null}
        {steps > 0 ? (
          <AskHint
            onClick={() => openTries(view, current.tryIndex)}
            title={`Open ${current.label} in the workbench`}
          >
            <ListTreeIcon aria-hidden="true" className="mr-1.5 inline size-[13px] align-[-2px]" />
            {steps === 1 ? '1 step' : `${steps} steps`}
          </AskHint>
        ) : null}
        {candidates.length > 1 ? (
          <span className="inline-flex min-w-0 items-center gap-1.5 max-md:hidden">
            <button
              {...askKeyAttributes(['['])}
              aria-label={`Previous ${noun}`}
              className="inline-flex rounded-[5px] outline-none hover:text-foreground focus-visible:[box-shadow:0_0_0_1.5px_var(--ring)]"
              onClick={() => step(-1)}
              title={`Previous ${noun}`}
              type="button"
            >
              <AskKeyChip askKey="[" />
            </button>
            <button
              {...askKeyAttributes([']'])}
              aria-label={`Next ${noun}`}
              className="inline-flex rounded-[5px] outline-none hover:text-foreground focus-visible:[box-shadow:0_0_0_1.5px_var(--ring)]"
              onClick={() => step(1)}
              title={`Next ${noun}`}
              type="button"
            >
              <AskKeyChip askKey="]" />
            </button>
            <span className="truncate">other {noun === 'draft' ? 'drafts' : 'tries'}</span>
          </span>
        ) : null}
      </AskFooter>
      {criteriaOpen && view.rubric ? (
        <AskSection
          className="text-[12px] whitespace-pre-wrap text-foreground/85"
          data-slot="variant-criteria"
        >
          {view.rubric}
        </AskSection>
      ) : null}
    </AskCard>
  );
}

/** A quiet text action at the end of a folded row. */
function RowAction({ children, onClick }: { children: string; onClick: () => void }) {
  return (
    <button
      className="shrink-0 rounded-[5px] px-1 text-[12px] text-muted-foreground outline-none hover:text-foreground focus-visible:[box-shadow:0_0_0_1.5px_var(--ring)]"
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

/**
 * A variant run at its turn. While it waits for the user it is the pick card;
 * otherwise it folds to one row (running, selected, or closed without a pick)
 * that opens its tries in the workbench.
 */
export function VariantRunRecord({ view, onPick }: { view: VariantRunView; onPick?: VariantPick }) {
  if (view.pick && !view.closed && onPick) return <VariantPickCard onPick={onPick} view={view} />;
  const selected = view.tabs.find((tab) => tab.selected);
  const shown = selected ?? view.tabs.find((tab) => tab.tryIndex === view.defaultTab);
  const noun = view.noun.toLowerCase();
  const messageId = view.closed?.supersededByMessageId;
  const link = messageId ? `#message-${encodeURIComponent(messageId)}` : undefined;
  const running = view.tabs.some((tab) => tab.state === 'running');
  return (
    <div
      className="flex min-w-0 items-center gap-1"
      data-slot="variant-run"
      data-variants-id={view.variantsId}
    >
      <AskAnsweredRow
        className="min-w-0 shrink"
        detail={
          view.closed
            ? view.closed.notice
            : selected
              ? [variantTryState(selected), selected.comment].filter(Boolean).join(', ') ||
                view.strategy
              : view.strategy
        }
        icon={GitForkIcon}
        tone={selected ? 'ok' : 'neutral'}
        verb={view.closed?.label ?? view.status}
      />
      <span className="flex-1" />
      {link ? (
        <RowAction onClick={() => followTranscriptLink(link)}>Go to your message</RowAction>
      ) : null}
      {view.tabs.length ? (
        <RowAction onClick={() => openTries(view, shown?.tryIndex ?? view.defaultTab)}>
          {running
            ? `Watch the ${noun === 'draft' ? 'drafts' : 'tries'}`
            : `Show the ${noun === 'draft' ? 'drafts' : 'tries'}`}
        </RowAction>
      ) : null}
    </div>
  );
}
