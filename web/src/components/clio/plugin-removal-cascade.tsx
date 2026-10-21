import type { RemovalPreview } from '@clio/core/v3';
import { Badge } from '@/components/ui/badge';
import { removalPreviewReason } from '@/lib/plugin-presentation';

export interface PluginRemovalCascadeProps {
  /** The plugin the person asked to remove. */
  plugin: string;
  preview?: RemovalPreview;
  previewPending: boolean;
  previewError?: string;
}

/**
 * Removing a plugin removes every plugin that requires it, and a pack once
 * none of its members remain. This is the cascade the service computed, shown
 * in the plugin-change dialog before anything changes.
 */
export function PluginRemovalCascade({
  plugin,
  preview,
  previewPending,
  previewError,
}: PluginRemovalCascadeProps) {
  const dependents = (preview?.removes ?? []).filter((row) => row.id !== plugin);
  const tools = preview?.tools_removed ?? [];
  return (
    <div className="space-y-3" aria-live="polite">
      {previewPending ? <p role="status">Checking what depends on {plugin}…</p> : null}
      {previewError ? (
        <p role="alert" className="text-destructive">
          The removal could not be previewed: {previewError}
        </p>
      ) : null}
      {preview && dependents.length ? (
        <section aria-label="Plugins that leave too" className="space-y-2">
          <p className="font-medium">
            {dependents.length === 1
              ? 'One more plugin leaves'
              : `${dependents.length} more plugins leave`}{' '}
            with {plugin}:
          </p>
          <ul className="grid gap-1.5">
            {dependents.map((row) => (
              <li className="flex flex-wrap items-center gap-2" key={row.id}>
                <span className="font-medium">{row.id}</span>
                <span className="text-xs text-muted-foreground">
                  {removalPreviewReason(row.reason)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {preview && !dependents.length ? <p>No other plugin depends on {plugin}.</p> : null}
      {preview && tools.length ? (
        <section aria-label="Tools that leave" className="space-y-1.5">
          <p className="text-muted-foreground">
            {tools.length === 1
              ? 'This tool is no longer available:'
              : `These ${tools.length} tools are no longer available:`}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {tools.map((tool) => (
              <Badge key={tool} variant="outline" className="font-mono">
                {tool}
              </Badge>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
