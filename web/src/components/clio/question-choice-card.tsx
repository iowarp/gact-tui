import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CloseIcon, EditIcon } from '@/lib/icon-vocabulary';
import { cn } from '@/lib/utils';
import { QuestionMarkdown } from './question-markdown';

// Choice-card presentation adapted from https://reui.io/components/questionnaire/c-questionnaire-1.
// Existing Radix controls and CLIO's draft/response owners retain interaction semantics.
/** REUI questionnaire choice presentation over CLIO's existing controlled answers. */
export function QuestionChoiceCard({
  id,
  label,
  description,
  control,
  selected,
  disabled,
  comment,
  onCommentChange,
  onCommentOpen,
  children,
}: {
  id: string;
  label: string;
  description?: string;
  control: ReactNode;
  selected: boolean;
  disabled?: boolean;
  comment?: string;
  onCommentChange?: (value: string) => void;
  onCommentOpen?: () => void;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(Boolean(comment));
  const expanded = selected && open;
  return (
    <div
      data-slot="question-choice-card"
      data-selected={selected || undefined}
      className={cn(
        'relative min-w-0 rounded-xl border bg-card transition-colors hover:bg-muted/40 focus-within:ring-2 focus-within:ring-ring/40',
        selected && 'border-primary/60 bg-primary/5',
        disabled && 'opacity-60',
      )}
    >
      <Label
        htmlFor={id}
        className={cn(
          'flex w-full min-w-0 cursor-pointer items-start gap-3 px-3.5 py-3',
          onCommentChange && 'pr-12',
          disabled && 'cursor-default',
        )}
      >
        <span className="mt-0.5 shrink-0">{control}</span>
        <span className="min-w-0 flex-1 space-y-1">
          <span className="block text-sm font-medium leading-snug">
            <QuestionMarkdown>{label}</QuestionMarkdown>
          </span>
          {description ? (
            <span className="block text-sm font-normal leading-snug text-muted-foreground">
              <QuestionMarkdown>{description}</QuestionMarkdown>
            </span>
          ) : null}
        </span>
      </Label>
      {onCommentChange ? (
        <Button
          aria-expanded={expanded}
          aria-controls={expanded ? `${id}-comment` : undefined}
          aria-label={`${expanded ? 'Hide' : 'Add'} comment on ${label}`}
          title={`${expanded ? 'Hide' : comment ? 'Edit' : 'Add'} details`}
          className={cn(
            'absolute right-2 top-2.5 text-muted-foreground',
            comment && 'text-primary',
          )}
          disabled={disabled}
          size="icon-sm"
          variant="ghost"
          onClick={() => {
            if (expanded) setOpen(false);
            else {
              onCommentOpen?.();
              setOpen(true);
            }
          }}
        >
          {expanded ? <CloseIcon aria-hidden="true" /> : <EditIcon aria-hidden="true" />}
        </Button>
      ) : null}
      {expanded && onCommentChange ? (
        <div className="grid min-w-0 gap-1.5 px-3.5 pb-3 sm:pl-10">
          <Label htmlFor={`${id}-comment`} className="text-xs font-normal text-muted-foreground">
            Additional details (optional)
          </Label>
          <Textarea
            id={`${id}-comment`}
            aria-label={`Comment on ${label}`}
            className="min-h-16 resize-y field-sizing-fixed bg-background"
            disabled={disabled}
            placeholder="Add context for the agent"
            rows={2}
            value={comment ?? ''}
            onChange={(event) => onCommentChange(event.target.value)}
          />
        </div>
      ) : null}
      {children}
    </div>
  );
}
