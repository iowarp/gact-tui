import type { ReactNode } from 'react';
import { Icon, type IconName } from '../../kit';

/**
 * Shared shapes used by every settings detail pane: the title+lede header,
 * the dashed empty-state box, and the loading/error inline states. Pulling
 * these out once keeps each page file to just its own real content instead
 * of re-deriving prototype geometry per page.
 */

export function PageHeader({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <div className="settings__head2">
      <h2 className="settings__title">{title}</h2>
      {subtitle ? <p className="settings__lede">{subtitle}</p> : null}
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: ReactNode }) {
  return (
    <div className="settings__empty" data-testid="settings-empty">
      <span className="settings__emptytitle">{title}</span>
      <span className="settings__emptybody">{body}</span>
    </div>
  );
}

export function LoadingNote() {
  return (
    <p className="settings__note" role="status">
      Loading…
    </p>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <p className="settings__note settings__note--error" role="alert">
      {message}
    </p>
  );
}

/** Uppercase, letter-spaced key text — the prototype's KV-row key styling,
 * applied inline so the shared KvGrid primitive stays untouched. */
export function KvKey({ children }: { children: ReactNode }) {
  return <span style={{ textTransform: 'uppercase', letterSpacing: '.08em' }}>{children}</span>;
}

export type FetchState<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: T };

/** A control the prototype shows but nothing on either side backs yet.
 * Rendered rather than hidden (Rail.tsx's convention: a gap stays visible in
 * the product), disabled with the reason as its title. */
export function DegradedButton({
  label,
  reason,
  primary,
}: {
  label: string;
  reason: string;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      className={primary ? 'settings__btn settings__btn--primary' : 'settings__btn'}
      disabled
      title={reason}
    >
      {label}
    </button>
  );
}

/** Icon-only sibling of DegradedButton — the row-trailing detach/disconnect
 * glyphs the prototype uses instead of text buttons. */
export function DegradedIconButton({
  icon,
  label,
  reason,
}: {
  icon: IconName;
  label: string;
  reason: string;
}) {
  return (
    <button
      type="button"
      className="settings__iconbtn"
      disabled
      aria-label={label}
      title={reason}
    >
      <Icon name={icon} size={11} />
    </button>
  );
}
