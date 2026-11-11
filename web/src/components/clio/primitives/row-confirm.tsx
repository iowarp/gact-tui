import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

/** 26px row buttons, the slot height every Settings list shares. */
const CONFIRM_BUTTON = 'h-[1.625rem] px-2.5 text-xs';

/**
 * The ItemRow `confirm` cell for remove, disconnect and delete: the question in
 * red, then Keep (focused) and the solid action. Esc keeps. While `onConfirm`'s
 * promise runs both buttons wait; a rejection leaves the question up so the
 * person can try again (the caller reports the error).
 */
export function RowConfirm({
  question,
  action,
  busyAction,
  onKeep,
  onConfirm,
}: {
  question: string;
  action: string;
  /** The action's label while it runs ("Disconnecting…"). */
  busyAction?: string;
  onKeep: () => void;
  onConfirm: () => unknown;
}) {
  const keep = useRef<HTMLButtonElement>(null);
  const cell = useRef<HTMLSpanElement>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => keep.current?.focus(), []);
  // Focus stays put: Keep hands it back to the row the question replaced.
  const stay = () => {
    const row = cell.current?.closest<HTMLElement>('[tabindex="0"]');
    onKeep();
    row?.focus();
  };
  const confirm = () => {
    const result = onConfirm();
    if (!(result instanceof Promise)) return;
    setBusy(true);
    result.then(
      () => setBusy(false),
      () => setBusy(false),
    );
  };
  return (
    <span
      aria-label={question}
      className="flex min-w-0 items-center justify-end gap-2"
      data-escape-scope=""
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        if (!busy) stay();
      }}
      ref={cell}
      role="group"
    >
      <span
        className="min-w-0 truncate text-[12.5px] text-destructive"
        role="alert"
        title={question}
      >
        {question}
      </span>
      <Button
        className={CONFIRM_BUTTON}
        disabled={busy}
        onClick={stay}
        ref={keep}
        size="sm"
        type="button"
        variant="ghost"
      >
        Keep
      </Button>
      <Button
        aria-busy={busy || undefined}
        className={CONFIRM_BUTTON}
        disabled={busy}
        onClick={confirm}
        size="sm"
        type="button"
        variant="destructive"
      >
        {busy && busyAction ? busyAction : action}
      </Button>
    </span>
  );
}
