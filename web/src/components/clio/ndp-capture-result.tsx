import { Link } from 'react-router-dom';
import type { NDPEndpointCapture } from '@clio/core/v3';
import { useConnectionSettings } from '@/providers/connection-provider';
import { connectionScope } from '@/lib/connection-scope';
import { plural, t } from '@lingui/core/macro';

function readerState(capture: NDPEndpointCapture): string | null {
  if (
    typeof capture.preview !== 'string' ||
    capture.preview_truncated ||
    !(
      capture.operation_id?.includes('/streams') ||
      capture.operation_id?.startsWith('SDK streaming_v2.')
    )
  )
    return null;
  try {
    const response: unknown = JSON.parse(capture.preview);
    if (response && typeof response === 'object' && 'state' in response) {
      return response.state === 'ready' || response.state === 'active'
        ? t`Stream reader ready. Checkpoint saved.`
        : response.state === 'stopped'
          ? t`Stream reader stopped. Checkpoint preserved.`
          : null;
    }
  } catch {
    // A partial or non-JSON preview cannot establish the reader's state.
  }
  return null;
}

export function NDPCaptureResult({
  capture,
  workspaceId,
}: {
  capture: NDPEndpointCapture;
  workspaceId: string;
}) {
  const { settings } = useConnectionSettings();
  return (
    <div aria-label={t`Saved endpoint data`} className="space-y-2 text-sm">
      <p role="status">
        {capture.continuation
          ? plural(capture.continuation.count, {
              one: '# stream record captured. Continuation checkpoint saved.',
              other: '# stream records captured. Continuation checkpoint saved.',
            })
          : (readerState(capture) ?? t`Endpoint response saved.`)}
        <span className="block text-muted-foreground">
          {plural(capture.bytes_received, { one: '# byte retained', other: '# bytes retained' })}
        </span>
      </p>
      <details>
        <summary className="cursor-pointer text-muted-foreground">{t`Response preview`}</summary>
        <pre className="max-h-44 overflow-auto rounded-md bg-muted/50 p-3 text-xs">
          {capture.preview}
        </pre>
      </details>
      {capture.workspace_path ? (
        <Link
          className="underline"
          to={`/workspaces/${encodeURIComponent(workspaceId)}/new`}
          state={{
            globalSearchResource: {
              scope: connectionScope(settings),
              request: { kind: 'workspace-file', path: capture.workspace_path },
            },
          }}
        >
          {t`Open saved data`}
        </Link>
      ) : null}
      {capture.materialization?.state === 'failed' ? (
        <p role="alert" className="text-destructive">
          {capture.materialization.reason}
        </p>
      ) : null}
    </div>
  );
}
