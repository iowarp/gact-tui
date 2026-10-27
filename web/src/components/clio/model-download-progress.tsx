import type { ModelAcquisition } from '@clio/core/v3';
import { formatBytes } from '@/lib/format';

/** A determinate byte bar only when the target reports a total, with its current phase beside it. */
export function ModelDownloadProgress({ model }: { model: ModelAcquisition }) {
  const active = model.state === 'queued' || model.state === 'running';
  const total = model.bytes_total && model.bytes_total > 0 ? model.bytes_total : undefined;
  const percent = total ? Math.min(100, Math.round((model.bytes_done / total) * 100)) : undefined;
  return (
    <div className="space-y-2" role="status">
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className={model.error ? 'text-destructive' : undefined}>
          {model.error || model.phase}
        </span>
        {total ? (
          <span className="tabular-nums">
            {formatBytes(model.bytes_done)} of {formatBytes(total)} ({percent}%)
          </span>
        ) : active ? (
          <span>{model.bytes_done > 0 ? formatBytes(model.bytes_done) : 'Preparing download'}</span>
        ) : null}
      </div>
      {active || model.state === 'ready' ? (
        <progress
          className="h-1.5 w-full accent-primary"
          aria-label={`Downloaded bytes for ${model.repository}`}
          max={total ?? 1}
          value={model.state === 'ready' ? (total ?? 1) : total ? model.bytes_done : undefined}
        />
      ) : null}
    </div>
  );
}
