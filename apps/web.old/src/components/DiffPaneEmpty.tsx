/**
 * UI component: Diff Pane Empty. Exports `DiffPaneEmpty`.
 */
export function DiffPaneEmpty(props: { raw: string }) {
  return (
    <div class="diffpane__nohunks">
      <p>Diff has no parseable hunks. Raw payload:</p>
      <pre>{props.raw || '(empty)'}</pre>
    </div>
  );
}
