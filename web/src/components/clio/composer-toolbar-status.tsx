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
      : 'Connectingâ€¦'
    : preparing
      ? 'Preparing viewsâ€¦'
      : undefined;
  if (!text) return null;
  return (
    <span
      className="shrink-0 px-1 text-[12px] whitespace-nowrap text-muted-foreground"
      role="status"
    >
      {text}
    </span>
  );
}
