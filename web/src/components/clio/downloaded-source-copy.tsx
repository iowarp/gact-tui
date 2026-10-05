import type { ConnectedSourceState } from '@clio/core/v3';
import { Button } from '@/components/ui/button';
import { vocab } from '@/lib/brand-vocabulary';

/** Explain and confirm removal of a workspace copy without removing its originals. */
export function DownloadedSourceCopy({
  source,
  active,
  pending,
  confirmed,
  onConfirm,
  onKeep,
  onRemove,
}: {
  source: ConnectedSourceState;
  active: boolean;
  pending: boolean;
  confirmed: boolean;
  onConfirm: () => void;
  onKeep: () => void;
  onRemove: () => void;
}) {
  return (
    <details className="rounded-md border p-3">
      <summary className="cursor-pointer text-sm">Downloaded copy</summary>
      <p className="mt-2 break-all text-xs text-muted-foreground">{source.local_path}</p>
      <div className="mt-3">
        {!confirmed ? (
          <Button size="sm" variant="outline" disabled={active} onClick={onConfirm}>
            Remove workspace copy
          </Button>
        ) : (
          <div className="space-y-2">
            <p className="text-sm">
              Remove this {vocab.agent} copy
              {source.download_access === 'editable'
                ? ' and any unsaved local edits'
                : ' from workspace Files'}
              ? Your original files and copies already used in messages are kept.
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" disabled={pending} onClick={onRemove}>
                Remove copy
              </Button>
              <Button size="sm" variant="ghost" onClick={onKeep}>
                Keep copy
              </Button>
            </div>
          </div>
        )}
      </div>
    </details>
  );
}
