import type { FormEvent } from 'react';
import { Input } from '@/components/ui/input';
import { AskButton, AskRow, AskRows, AskSection } from './ask-card';
import { plainQuestionText } from './question-card-model';
import { t } from '@lingui/core/macro';

export interface QuestionChoice {
  value: string;
  label: string;
  description?: string;
}

/**
 * How a row answers: `answer` sends it at once (↵ picks the first), `pick`
 * chooses one for a later submit, `multi` toggles several.
 */
export type QuestionChoiceMode = 'answer' | 'pick' | 'multi';

/** The options of one question as numbered 30px rows with their line of detail. */
export function QuestionChoiceRows({
  choices,
  mode,
  selected = [],
  disabled,
  label,
  onChoose,
}: {
  choices: readonly QuestionChoice[];
  mode: QuestionChoiceMode;
  selected?: readonly string[];
  disabled?: boolean;
  /** The question, naming the group. */
  label: string;
  onChoose: (value: string) => void;
}) {
  return (
    <AskRows aria-label={plainQuestionText(label)} role={mode === 'pick' ? 'radiogroup' : 'group'}>
      {choices.map((choice, index) => {
        const checked = selected.includes(choice.value);
        const text = plainQuestionText(choice.label);
        const detail = choice.description ? plainQuestionText(choice.description) : undefined;
        return (
          <AskRow
            aria-checked={mode === 'answer' ? undefined : checked}
            // Only the number key leads the row; a chosen row ends in the check column.
            detail={detail}
            disabled={disabled}
            highlighted={mode === 'answer' && index === 0}
            key={choice.value}
            label={text}
            number={index + 1}
            onClick={() => onChoose(choice.value)}
            role={mode === 'answer' ? undefined : mode === 'pick' ? 'radio' : 'checkbox'}
            title={detail ? `${text}: ${detail}` : text}
          />
        );
      })}
    </AskRows>
  );
}

/** A written answer in the card: one 34px field and Send. */
export function QuestionWriteIn({
  id,
  value,
  onChange,
  onSubmit,
  disabled,
  placeholder = t`Type your answer`,
  label = t`Your response`,
  enterKey,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  disabled?: boolean;
  placeholder?: string;
  label?: string;
  /** Show ↵ on Send: the field is the card's only answer. */
  enterKey?: boolean;
}) {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (value.trim() && !disabled) onSubmit?.();
  };
  return (
    <AskSection className="mt-2">
      <form
        className="flex min-w-0 items-center gap-1.5 @max-[420px]/ask:flex-col @max-[420px]/ask:items-stretch"
        onSubmit={submit}
      >
        <Input
          aria-label={label}
          className="h-[34px] min-w-0 flex-1 rounded-[7px] border-input text-menu md:text-menu"
          disabled={disabled}
          id={id}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          value={value}
        />
        {onSubmit ? (
          <AskButton
            aria-label={t`Send response`}
            className="h-[34px]"
            disabled={disabled || !value.trim()}
            // i18n-ignore: key name
            hint={enterKey ? 'Enter' : undefined}
            primary
            type="submit"
          >
            {t`Send`}
          </AskButton>
        ) : null}
      </form>
    </AskSection>
  );
}
