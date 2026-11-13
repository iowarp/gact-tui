import { CheckIcon, PencilIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { QuestionReading } from './question-tool-presentation';
import { t, ph } from '@lingui/core/macro';

/**
 * An opened "Answered" row: each question under a header bar, its options as
 * rows with the chosen ones checked, then anything typed instead. The answer
 * is the row's own argument, so it is not repeated above the question.
 */
export function QuestionAnswerReader({ reading }: { reading: QuestionReading }) {
  const many = reading.questions.length > 1;
  return (
    <div className="min-w-0 text-menu" data-slot="question-answer-reader">
      {reading.framing ? (
        <p className="border-b border-border px-2.5 py-1.5 leading-normal text-foreground/85">
          {reading.framing}
        </p>
      ) : null}
      {reading.questions.map((question, index) => {
        const last = index === reading.questions.length - 1;
        return (
          <section
            aria-label={
              many
                ? t`Question ${ph({ number: index + 1 })} of ${ph({ total: reading.questions.length })}`
                : t`Question`
            }
            className={cn(index > 0 && 'border-t border-border')}
            key={index}
          >
            <div className="flex h-[30px] items-center gap-2 border-b border-border px-2.5 text-label whitespace-nowrap text-muted-foreground">
              <b className="text-meta font-medium text-foreground/85">
                {many
                  ? t`Question ${ph({ number: index + 1 })} of ${ph({ total: reading.questions.length })}`
                  : t`Question`}
              </b>
            </div>
            <p className="px-2.5 pt-1.5 pb-1 leading-normal text-foreground">{question.prompt}</p>
            {question.options.length ? (
              <ul aria-label={t`Options`} className="grid px-1 pb-1">
                {question.options.map((option) => (
                  <li
                    className={cn(
                      'flex min-h-[26px] min-w-0 items-center gap-2 rounded-[6px] px-1.5',
                      option.chosen ? 'bg-hover text-foreground' : 'text-muted-foreground',
                    )}
                    data-chosen={option.chosen || undefined}
                    key={option.label}
                  >
                    <span className="grid size-4 shrink-0 place-items-center">
                      {option.chosen ? (
                        <CheckIcon aria-hidden="true" className="size-3.5 text-primary" />
                      ) : null}
                    </span>
                    <span className="shrink-0">{option.label}</span>
                    {option.description ? (
                      <span
                        className="min-w-0 truncate text-label text-muted-foreground"
                        title={option.description}
                      >
                        {option.description}
                      </span>
                    ) : null}
                    {option.chosen ? <span className="sr-only">{t`, your answer`}</span> : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {last && reading.written.length ? (
              <div className="mx-1 mb-1 flex min-h-[26px] min-w-0 items-start gap-2 rounded-[6px] bg-hover px-1.5 py-1 text-foreground">
                <span className="grid h-[18px] w-4 shrink-0 place-items-center">
                  <PencilIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
                </span>
                <span className="sr-only">{t`Your answer:`} </span>
                <span className="min-w-0 leading-4.5 whitespace-pre-wrap [overflow-wrap:anywhere]">
                  {reading.written.join('\n')}
                </span>
              </div>
            ) : null}
          </section>
        );
      })}
      {reading.reason ? (
        <p className="border-t border-border px-2.5 py-1.5 text-label leading-normal text-muted-foreground">
          <span className="text-foreground/85">{t`Why I’m asking`}</span> {reading.reason}
        </p>
      ) : null}
    </div>
  );
}
