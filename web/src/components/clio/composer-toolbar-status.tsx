/** The toolbar's one-line wait status before the submit square. */
export function ComposerToolbarStatus({
  connecting,
  held,
  preparing,
}: {
  connecting: boolean;
  held: boolean;
  preparing: boolean;
}) {
  const text = connecting
    ? held
      ? 'Sends when connected'
      : 'Connecting…'
    : preparing
      ? 'Preparing views…'
      : undefined;
  if (!text) return null;
  // A narrow composer keeps room for the model chip: the held send reads as
  // "Connecting…" there, with the full wording in the title and for screen readers.
  const short = held && connecting ? 'Connecting…' : undefined;
  return (
    <span
      className="shrink-0 px-1 text-[12px] whitespace-nowrap text-muted-foreground"
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
