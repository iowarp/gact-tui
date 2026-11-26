import type { PendingInteraction } from '@clio/core/v3';
import { BoxesIcon, ClipboardPenLineIcon, MessageCircleQuestionIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { vocab } from '@/lib/brand-vocabulary';
import { EditIcon } from '@/lib/icon-vocabulary';
import { cn } from '@/lib/utils';
import { jobFromInteraction, withPlannedNode } from '@/lib/job-snapshot';
import { trailingCommand } from '@/lib/literal-command-text';
import { AskCode } from './ask-code';
import { AskCard, AskDetails, AskFooter, AskHint, AskSection, type AskCardProps } from './ask-card';
import { pendingInteractionDomId } from './interaction-control';
import { JobCard } from './job-card';
import { OwnerAttribution } from './pending-interaction-notices';
import {
  plainQuestionText,
  questionPrompt,
  useComposerAnswer,
  withoutOwnerPrefix,
  withoutRepeatedTitle,
} from './question-card-model';
import { QuestionMarkdown } from './question-markdown';
import { QuestionPromptText } from './question-prompt';
import { t, ph } from '@lingui/core/macro';

const TITLE_LIMIT = 120;

/** A short question is the title; a long one keeps a short title and reads in full below. */
function splitQuestion(text: string, fallback: string | undefined) {
  const trimmed = text.trim();
  const [first = '', ...rest] = trimmed.split(/\r?\n/u);
  if (first.trim().length <= TITLE_LIMIT)
    return { title: plainQuestionText(first), body: rest.join('\n').trim() || undefined };
  const label =
    fallback &&
    // The core's English "Question" only names the kind; the reader's language says who asks.
    fallback.trim().toLowerCase() !== 'question' &&
    fallback.trim() !== trimmed &&
    fallback.length <= TITLE_LIMIT &&
    !fallback.includes('\n')
      ? plainQuestionText(fallback)
      : t`${ph({ agent: vocab.agent })} asks`;
  return { title: label, body: trimmed };
}

/** The program a command runs, as its node is named: `cmd.exe /c echo hi` reads cmd.exe. */
function commandName(command: string | undefined): string | undefined {
  const first = command
    ?.trim()
    .split(/\s+/u)[0]
    ?.replace(/^["']|["']$/gu, '');
  return first ? first.split(/[\\/]/u).pop() || undefined : undefined;
}

const ICONS = {
  mcp_task_input: ClipboardPenLineIcon,
  a2ui: BoxesIcon,
} as const;

export interface QuestionCardProps extends Omit<AskCardProps, 'kind' | 'icon' | 'title'> {
  interaction: PendingInteraction;
  ownerLabel?: string;
  showOwner?: boolean;
  /** Show a long question in full instead of its first lines and Show more. */
  showFullPrompt?: boolean;
  /** The question asked, when it is not the interaction's own prompt (a bundle page). */
  heading?: string;
  /** Extra classes for a long question's block. */
  promptClassName?: string;
}

/** The one frame every question shares: the question as title, who asks, then the answer. */
export function QuestionCard({
  interaction,
  ownerLabel,
  showOwner = false,
  showFullPrompt,
  heading,
  promptClassName,
  children,
  ...props
}: QuestionCardProps) {
  const { title: rawTitle, body } = splitQuestion(
    heading ?? questionPrompt(interaction),
    interaction.title,
  );
  // Who asks is said once, by its attribution: "Relay: Where should…" reads "Where should…".
  const title = withoutOwnerPrefix(rawTitle, interaction);
  const recorded = jobFromInteraction(interaction.payload);
  // The command an ask quotes at its end, when the job carries no script of its own.
  const tail = body && !recorded?.script?.text ? trailingCommand(body) : undefined;
  // Every run approval draws its job's nodes, a one-node command included; the job card
  // says the site, so no separate site line.
  const job = recorded
    ? withPlannedNode(recorded, recorded.label?.trim() || commandName(tail?.command) || t`Job`)
    : null;
  const prompt = withoutRepeatedTitle((tail ? tail.prose : body) ?? '', title);
  return (
    <AskCard
      data-interaction-kind={interaction.kind}
      icon={ICONS[interaction.kind as keyof typeof ICONS] ?? MessageCircleQuestionIcon}
      id={pendingInteractionDomId(interaction.id)}
      kind="question"
      owner={
        showOwner ? (
          <OwnerAttribution interaction={interaction} ownerLabel={ownerLabel} show />
        ) : undefined
      }
      title={title}
      titleText={title}
      wrapTitle
      {...props}
    >
      {job ? (
        <AskSection className="mt-1" data-slot="question-job">
          <JobCard
            fallback={
              prompt ? (
                <div className="text-foreground/85 [&_.text-sm]:text-menu">
                  <QuestionMarkdown>{prompt}</QuestionMarkdown>
                </div>
              ) : undefined
            }
            job={job}
          />
        </AskSection>
      ) : prompt ? (
        <AskSection
          // The question and every answer stay in view: a long explanation shows its first
          // lines and opens the rest in place. It never scrolls inside the card.
          className={cn('mt-1 shrink-0 text-foreground/85 [&_.text-sm]:text-menu', promptClassName)}
          data-slot="question-prompt"
        >
          {showFullPrompt ? (
            <QuestionMarkdown>{prompt}</QuestionMarkdown>
          ) : (
            <QuestionPromptText>{prompt}</QuestionPromptText>
          )}
        </AskSection>
      ) : null}
      {tail ? (
        <AskCode
          code={tail.command}
          label={t`Command to run`}
          meta={tail.digest ? t`sha256 ${ph({ digest: tail.digest })}` : undefined}
          wrapToggle
        />
      ) : null}
      {interaction.routing_state === 'agent_elicitation_fallback_to_human' ? (
        <AskSection className="mt-1 text-meta text-muted-foreground">
          {t`The specialist could not answer this, so it needs you.`}
        </AskSection>
      ) : null}
      {children}
      {interaction.routing_state === 'agent_elicitation_fallback_to_human' &&
      interaction.fallback_detail ? (
        <AskDetails>
          <code className="font-mono break-all">{interaction.fallback_detail}</code>
        </AskDetails>
      ) : null}
    </AskCard>
  );
}

/** The quiet hints under a question: answer in the composer, and Esc to dismiss or decline. */
export function QuestionFooter({
  interaction,
  allowsComposer,
  composerOnly,
  disabled,
  onDismiss,
  onDecline,
  children,
}: {
  interaction: PendingInteraction;
  /** The question takes a written answer the composer can carry. */
  allowsComposer?: boolean;
  /** The written answer is the only answer (no choices to pick instead). */
  composerOnly?: boolean;
  disabled?: boolean;
  onDismiss?: () => void;
  /** Says no to an MCP form ask without answering it. */
  onDecline?: () => void;
  children?: ReactNode;
}) {
  const composer = useComposerAnswer(interaction);
  const showComposer = allowsComposer && composer.available;
  if (!showComposer && !onDismiss && !onDecline && !children) return null;
  return (
    <AskFooter>
      {children}
      {showComposer ? (
        composer.answering ? (
          <span className="inline-flex min-w-0 items-center gap-1.5" data-slot="question-answering">
            <EditIcon aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="min-w-0 whitespace-normal">
              {t`Type your answer in the message box below`}
            </span>
          </span>
        ) : (
          <AskHint disabled={disabled} onClick={composer.start}>
            <EditIcon aria-hidden="true" className="mr-1.5 inline size-3.5 align-[-3px]" />
            {composerOnly ? t`Type your answer below` : t`Or type your own answer below`}
          </AskHint>
        )
      ) : null}
      {onDismiss ? (
        <AskHint
          aria-label={t`Dismiss question`}
          askKey="Escape"
          disabled={disabled}
          onClick={onDismiss}
        >
          {t`Dismiss`}
        </AskHint>
      ) : onDecline ? (
        <AskHint askKey="Escape" disabled={disabled} onClick={onDecline}>
          {t`Decline`}
        </AskHint>
      ) : null}
    </AskFooter>
  );
}
