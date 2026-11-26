import { ChevronRightIcon } from 'lucide-react';
import { useId, useState } from 'react';
import type { DeclaredChoiceContext } from '@/lib/declared-choices';
import { cn } from '@/lib/utils';
import { AskSection } from './ask-card';
import { t } from '@lingui/core/macro';

/**
 * What the answers cover, said once beside them. On an approval it is the caveat to read
 * before deciding, always open in the attention box.
 */
export function ChoiceNote({
  context,
  boxed = false,
}: {
  context: DeclaredChoiceContext;
  boxed?: boolean;
}) {
  if (!context.note) return null;
  return (
    <AskSection
      className={cn(
        'text-meta',
        boxed
          ? 'mt-2 rounded-md border border-warning/35 bg-warning/10 px-2.5 py-1.5 text-foreground/90'
          : 'text-muted-foreground',
      )}
      data-slot="question-choice-note"
    >
      {context.note}
    </AskSection>
  );
}

/**
 * Why an answer is advised and what that rests on, closed until asked for. It opens in
 * place and never scrolls inside the card, so the answers stay where they were.
 */
export function ChoiceEvidence({ context }: { context: DeclaredChoiceContext }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  if (!context.detail && !context.evidence.length) return null;
  return (
    <AskSection className="text-meta" data-slot="question-choice-evidence">
      <button
        aria-controls={id}
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <ChevronRightIcon
          aria-hidden
          className={cn(
            'size-3.5 shrink-0 transition-transform motion-reduce:transition-none',
            open && 'rotate-90',
          )}
        />
        {context.evidence.length ? t`Evidence (${context.evidence.length})` : t`Evidence`}
      </button>
      {open ? (
        <div className="mt-1 space-y-1 ps-[1.125rem] text-foreground/85" id={id}>
          {context.detail ? <p className="break-words">{context.detail}</p> : null}
          {context.evidence.length ? (
            <ul className="space-y-0.5 text-muted-foreground">
              {context.evidence.map((line, index) => (
                <li className="break-words" key={`${index}-${line}`}>
                  {line}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </AskSection>
  );
}
