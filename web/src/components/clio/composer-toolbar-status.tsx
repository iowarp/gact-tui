import { WifiOffIcon } from 'lucide-react';
import { t } from '@lingui/core/macro';

/** The toolbar's one-line wait status before the submit square. */
export function ComposerToolbarStatus({
  connecting,
  held,
  offline = false,
  preparing,
  sending = false,
}: {
  connecting: boolean;
  held: boolean;
  offline?: boolean;
  preparing: boolean;
  /** The service hasn't yet taken a send that went out. */
  sending?: boolean;
}) {
  if (offline) {
    // The sidebar line already says the service can't be reached; the toolbar
    // only explains a held send. Never colour alone: icon and word together.
    if (!held) return null;
    return (
      <span
        className="flex shrink-0 items-center gap-1 px-1 text-meta whitespace-nowrap text-muted-foreground"
        role="status"
        title={t`Sends when the service is reachable again. Your message stays here.`}
      >
        <WifiOffIcon
          aria-hidden="true"
          className="size-3.5 shrink-0 @max-[440px]/composer:hidden"
        />
        <span className="@max-[440px]/composer:sr-only">{t`Sends when reconnected`}</span>
        <span aria-hidden="true" className="hidden @max-[440px]/composer:inline">
          {t`Waiting`}
        </span>
      </span>
    );
  }
  const preparingViews = !connecting && !sending && preparing;
  const text = connecting
    ? held
      ? t`Sends when connected`
      : t`Connecting…`
    : sending
      ? t`Sending…`
      : preparing
        ? t`Preparing views…`
        : undefined;
  if (!text) return null;
  // A narrow composer keeps room for the model chip: the longer waits read shorter
  // there, with the full wording in the title and for screen readers.
  const short = held && connecting ? t`Connecting…` : preparingViews ? t`Preparing…` : undefined;
  return (
    <span
      className="shrink-0 px-1 text-meta whitespace-nowrap text-muted-foreground"
      role="status"
      title={short ? text : undefined}
    >
      <span className={short ? '@max-[440px]/composer:sr-only' : undefined}>{text}</span>
      {short ? (
        <span aria-hidden="true" className="hidden @max-[440px]/composer:inline">
          {short}
        </span>
      ) : null}
    </span>
  );
}
