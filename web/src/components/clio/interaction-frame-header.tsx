import type { PendingInteraction } from '@clio/core/v3';
import { BoxesIcon, ClipboardPenLineIcon, MessageCircleQuestionIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { vocab } from '@/lib/brand-vocabulary';
import { EditIcon } from '@/lib/icon-vocabulary';
import { cn } from '@/lib/utils';
import { AskCard, AskDetails, AskFooter, AskHint, AskSection, type AskCardProps } from './ask-card';
import { pendingInteractionDomId } from './interaction-control';
import { OwnerAttribution } from './pending-interaction-notices';
import { plainQuestionText, questionPrompt, useComposerAnswer } from './question-card-model';
import { QuestionMarkdown } from './question-markdown';

const TITLE_LIMIT = 120;

/** A short question is the title; a long one keeps a short title and reads in full below. */
function splitQuestion(text: string, fallback: string | undefined) {
  const trimmed = text.trim();
  const [first = '', ...rest] = trimmed.split(/\r?\n/u);
  if (first.trim().length <= TITLE_LIMIT)
    return { title: plainQuestionText(first), body: rest.join('\n').trim() || undefined };
  const label =
    fallback &&
    fallback.trim() !== trimmed &&
    fallback.length <= TITLE_LIMIT &&
    !fallback.includes('\n')
      ? plainQuestionText(fallback)
      : `${vocab.agent} asks`;
  return { title: label, body: trimmed };
}

const ICONS = {
  mcp_task_input: ClipboardPenLineIcon,
  a2ui: BoxesIcon,
} as const;

export interface QuestionCardProps extends Omit<AskCardProps, 'kind' | 'icon' | 'title'> {
  interaction: PendingInteraction;
  ownerLabel?: string;
  showOwner?: boolean;
  /** Show a long question in full instead of in a short scrolling block. */
  showFullPrompt?: boolean;
  /** The question asked, when it is not the interaction's own prompt (a bundle page). */
  heading?: string;
  /** Extra classes for a long question's scrolling block. */
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
  const { title, body } = splitQuestion(heading ?? questionPrompt(interaction), interaction.title);
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
      {body ? (
        <AskSection
          className={cn(
            'mt-1 text-foreground/85 [&_.text-sm]:text-menu',
            !showFullPrompt && 'clio-scrollbar max-h-28 overflow-y-auto pr-1',
            promptClassName,
          )}
          data-slot="question-prompt"
        >
          <QuestionMarkdown>{body}</QuestionMarkdown>
        </AskSection>
      ) : null}
      {interaction.routing_state === 'agent_elicitation_fallback_to_human' ? (
        <AskSection className="mt-1 text-meta text-muted-foreground">
          The specialist could not answer this, so it needs you.
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

/** The quiet hints under a question: answer in the composer, and Esc to dismiss. */
export function QuestionFooter({
  interaction,
  allowsComposer,
  composerOnly,
  disabled,
  onDismiss,
  children,
}: {
  interaction: PendingInteraction;
  /** The question takes a written answer the composer can carry. */
  allowsComposer?: boolean;
  /** The written answer is the only answer (no choices to pick instead). */
  composerOnly?: boolean;
  disabled?: boolean;
  onDismiss?: () => void;
  children?: ReactNode;
}) {
  const composer = useComposerAnswer(interaction);
  const showComposer = allowsComposer && composer.available;
  if (!showComposer && !onDismiss && !children) return null;
  return (
    <AskFooter>
      {children}
      {showComposer ? (
        composer.answering ? (
          <span className="inline-flex min-w-0 items-center gap-1.5" data-slot="question-answering">
            <EditIcon aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="truncate">Type your answer in the message box below</span>
          </span>
        ) : (
          <AskHint disabled={disabled} onClick={composer.start}>
            <EditIcon aria-hidden="true" className="mr-1.5 inline size-3.5 align-[-3px]" />
            {composerOnly ? 'Type your answer below' : 'Or type your own answer below'}
          </AskHint>
        )
      ) : null}
      {onDismiss ? (
        <AskHint
          aria-label="Dismiss question"
          askKey="Escape"
          disabled={disabled}
          onClick={onDismiss}
        >
          Dismiss
        </AskHint>
      ) : null}
    </AskFooter>
  );
}
