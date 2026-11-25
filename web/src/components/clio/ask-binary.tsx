import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AskButton, AskOptions } from './ask-card';
import { t } from '@lingui/core/macro';

export interface BinaryAnswer {
  /** The ask's own word for it: Yes, Approve, Allow once, Open link, Continue… */
  label: ReactNode;
  /** What a screen reader hears when the label is short ("This session"). */
  name?: string;
  title?: string;
  disabled?: boolean;
  /** Sends the answer; while its promise runs, this button reads "Sending…". */
  onChoose: () => unknown;
}

/**
 * Every two-answer ask (yes/no, approve/decline, allow/deny, accept/reject, a link's consent,
 * a connector's offer) answers on these buttons: pressing one sends it. There is no radio
 * list and no separate Send. A permission's lasting scopes are further ways to accept, after
 * the first; they do not make it a different kind of ask.
 */
export function BinaryAsk({
  label,
  accept,
  alternatives = [],
  decline,
  unavailable = [],
  disabled,
  enterAccepts = false,
  variant = 'card',
  className,
  children,
}: {
  /** The group's accessible name: the question or "Decision". */
  label: string;
  accept?: BinaryAnswer;
  alternatives?: readonly BinaryAnswer[];
  decline?: BinaryAnswer;
  /** Answers the server offers that this client cannot give yet, shown disabled. */
  unavailable?: readonly { label: string; title?: string }[];
  disabled?: boolean;
  /**
   * Enter also accepts. Off where the card shows nothing beyond the question, so no stray
   * keypress gives a consent the person did not choose; 1 still picks it.
   */
  enterAccepts?: boolean;
  /** `row`: the small pair under an attention-center row. */
  variant?: 'card' | 'row';
  className?: string;
  /** Trailing content in the same row (a join mode, what an offer brings). */
  children?: ReactNode;
}) {
  const [sending, setSending] = useState<number>();
  const answers = [...(accept ? [accept] : []), ...alternatives];
  const busy = disabled || sending !== undefined;
  const choose = (answer: BinaryAnswer, index: number) => {
    const result = answer.onChoose();
    if (!(result instanceof Promise)) return;
    setSending(index);
    void result.catch(() => undefined).finally(() => setSending(undefined));
  };
  const text = (answer: BinaryAnswer, index: number) =>
    sending === index ? t`Sending…` : answer.label;
  const declineIndex = answers.length;

  if (variant === 'row') {
    return (
      <div
        aria-label={label}
        className={cn('flex items-center gap-1.5 text-label', className)}
        data-slot="binary-ask"
        role="group"
      >
        {answers.map((answer, index) => (
          <Button
            aria-label={answer.name}
            className="h-6 min-w-[58px] rounded-[6px] px-3 text-label font-semibold"
            disabled={busy || answer.disabled}
            key={index}
            onClick={() => choose(answer, index)}
            size="xs"
            title={answer.title}
            variant={index === 0 ? 'default' : 'secondary'}
          >
            {text(answer, index)}
          </Button>
        ))}
        {decline ? (
          <Button
            aria-label={decline.name}
            className="h-6 min-w-[58px] rounded-[6px] px-3 text-label font-normal"
            disabled={busy || decline.disabled}
            onClick={() => choose(decline, declineIndex)}
            size="xs"
            title={decline.title}
            variant="secondary"
          >
            {text(decline, declineIndex)}
          </Button>
        ) : null}
        {children}
      </div>
    );
  }

  return (
    <AskOptions aria-label={label} className={className} data-slot="binary-ask">
      {answers.map((answer, index) => (
        <AskButton
          aria-label={answer.name}
          disabled={busy || answer.disabled}
          // i18n-ignore: key name
          hint={index === 0 && enterAccepts && !answer.disabled ? 'Enter' : undefined}
          key={index}
          number={index + 1}
          onClick={() => choose(answer, index)}
          primary={index === 0}
          title={answer.title}
        >
          {text(answer, index)}
        </AskButton>
      ))}
      {unavailable.map((option) => (
        <AskButton disabled key={option.label} title={option.title}>
          {option.label}
        </AskButton>
      ))}
      {decline ? (
        <AskButton
          aria-label={decline.name}
          disabled={busy || decline.disabled}
          // i18n-ignore: key name
          hint="Escape"
          onClick={() => choose(decline, declineIndex)}
          title={decline.title}
        >
          {text(decline, declineIndex)}
        </AskButton>
      ) : null}
      {children}
    </AskOptions>
  );
}
