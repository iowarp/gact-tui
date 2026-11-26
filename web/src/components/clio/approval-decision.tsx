import { useId, useRef, useState, type ReactNode } from 'react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { EditIcon } from '@/lib/icon-vocabulary';
import { cn } from '@/lib/utils';
import { AskButton, AskSection } from './ask-card';
import { askKeyAttributes } from './ask-card-keys';
import { respondFromControl } from './interaction-control';
import { MenuRow } from './primitives/menu-row';
import { SplitButton } from './primitives/split-button';
import { t } from '@lingui/core/macro';

export interface ApprovalScope {
  /** What the face reads ("Approve once"); the first scope is the face. */
  label: string;
  /** The menu row's words ("Approve for this session"). */
  name?: string;
  onApprove: (comment: string) => Promise<void> | void;
}

export interface ApprovalDecisionProps {
  /** The ways to approve the source can enforce, narrowest first. */
  scopes: readonly ApprovalScope[];
  /** Says no; a comment written with it is the feedback. */
  onDecline?: (comment: string) => Promise<void> | void;
  declineLabel?: string;
  /** Ways the server offers that this client cannot say yet, shown unavailable in the menu. */
  unavailable?: readonly { label: string; title: string }[];
  /** What approving spends, where Approve's own description would go. */
  cost?: ReactNode;
  /** The notes and evidence, read after the cost and before the comment. */
  context?: ReactNode;
  disabled?: boolean;
  /** The bar's name for a screen reader. */
  label: string;
}

/**
 * The approval decision (spec rev 4, B3/B4): the cost strip, the ✎ comment, and the
 * right-aligned [Decline] [Approve once ▾] bar. Nothing is preselected and Enter never
 * approves; wider scopes are the chevron's rows. A comment goes with either answer, so a
 * comment the person wrote and then declined is the decline's feedback. The bar stays in
 * view while the card's facts scroll.
 */
export function ApprovalDecision({
  scopes,
  onDecline,
  declineLabel = t({ message: 'Decline', context: 'answer to an ask' }),
  unavailable = [],
  cost,
  context,
  disabled,
  label,
}: ApprovalDecisionProps) {
  const fieldId = useId();
  const [commenting, setCommenting] = useState(false);
  const [comment, setComment] = useState('');
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const note = comment.trim();
  const [face, ...wider] = scopes;
  const approve = (scope: ApprovalScope) =>
    respondFromControl(Promise.resolve(scope.onApprove(note)));
  const decline = onDecline
    ? () => respondFromControl(Promise.resolve(onDecline(note)))
    : undefined;
  const menu = wider.length > 0 || unavailable.length > 0;
  return (
    <>
      {cost ? (
        <AskSection
          className="mt-2 shrink-0 text-menu text-foreground/85"
          data-slot="approval-cost"
        >
          {cost}
        </AskSection>
      ) : null}
      {context}
      <AskSection className="mt-2 shrink-0 text-meta" data-slot="approval-comment">
        {commenting ? (
          <Textarea
            aria-label={t`Comment`}
            className="min-h-14 resize-y text-menu"
            disabled={disabled}
            id={fieldId}
            onChange={(event) => setComment(event.target.value)}
            // Esc in an empty field closes it; it never declines from inside a sentence.
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return;
              event.stopPropagation();
              if (!comment) setCommenting(false);
            }}
            placeholder={t`A note for the agent. Declining sends it as the reason.`}
            ref={fieldRef}
            value={comment}
          />
        ) : (
          <button
            aria-controls={fieldId}
            aria-expanded={false}
            className="inline-flex items-center gap-1.5 rounded-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            disabled={disabled}
            onClick={() => {
              setCommenting(true);
              requestAnimationFrame(() => fieldRef.current?.focus());
            }}
            type="button"
          >
            <EditIcon aria-hidden="true" className="size-3.5 shrink-0" />
            {t`Add a comment`}
          </button>
        )}
      </AskSection>
      <AskSection
        aria-label={label}
        className={cn(
          // Outside the scrolling facts and pinned at the card's foot, so the answer never
          // scrolls away (U12). Stacked when narrow, Approve first.
          'sticky bottom-0 z-[1] mt-2.5 flex flex-none flex-wrap items-center justify-end gap-1.5 bg-card',
          '@max-[420px]/ask:flex-col-reverse @max-[420px]/ask:items-stretch',
        )}
        data-slot="approval-decision"
        role="group"
      >
        {decline ? (
          <AskButton {...askKeyAttributes(['Escape'])} disabled={disabled} onClick={decline}>
            {note ? t`Decline with comment` : declineLabel}
          </AskButton>
        ) : null}
        {face ? (
          menu ? (
            <SplitButton
              className="@max-[420px]/ask:w-full [&>[data-slot=split-chevron]]:h-7"
              disabled={disabled}
              faceProps={{
                'aria-label': face.name ?? face.label,
                className: 'h-7 px-2.5 text-menu font-medium @max-[420px]/ask:flex-1',
              }}
              label={face.label}
              menuClassName="min-w-56"
              menuLabel={t`More ways to approve`}
              onClick={() => approve(face)}
              variant="default"
            >
              {wider.map((scope) => (
                <DropdownMenuItem key={scope.label} onSelect={() => approve(scope)}>
                  <MenuRow label={scope.name ?? scope.label} />
                </DropdownMenuItem>
              ))}
              {unavailable.map((row) => (
                <DropdownMenuItem disabled key={row.label} title={row.title}>
                  <MenuRow description={row.title} label={row.label} muted wrapDescription />
                </DropdownMenuItem>
              ))}
            </SplitButton>
          ) : (
            <AskButton
              aria-label={face.name ?? face.label}
              disabled={disabled}
              onClick={() => approve(face)}
              primary
            >
              {face.label}
            </AskButton>
          )
        ) : null}
      </AskSection>
    </>
  );
}
