import type { DocumentWorkingCopy } from '@clio/core/v3';
import { ShieldCheckIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { editorLabel } from './document-launch';
import { ClioStatus } from './status';

/** The document's working copy: its status and the conflict/close decisions. */
export function WorkingCopyStatus({
  copy,
  closePending,
  resolvePending,
  onClose,
  onResolve,
}: {
  copy?: DocumentWorkingCopy;
  closePending: boolean;
  resolvePending: boolean;
  onClose: () => void;
  onResolve: (resolution: 'keep-current' | 'use-working-copy') => void;
}) {
  if (!copy) return null;
  return (
    <Alert
      variant={copy.status === 'conflict' || copy.status === 'error' ? 'destructive' : 'default'}
    >
      <AlertTitle className="flex flex-wrap items-center gap-2">
        Working copy <ClioStatus label={copy.status} value={workingCopyStatusValue(copy.status)} />
      </AlertTitle>
      <AlertDescription>
        Head version {copy.head_version}. Stable saves checkpoint into immutable artifact history.
      </AlertDescription>
      <div className="mt-3 flex flex-wrap gap-2">
        {copy.status === 'conflict' ? (
          <>
            <Button disabled={resolvePending} onClick={() => onResolve('keep-current')} size="sm">
              Keep current artifact
            </Button>
            <Button
              disabled={resolvePending}
              onClick={() => onResolve('use-working-copy')}
              size="sm"
              variant="destructive"
            >
              Use working copy
            </Button>
          </>
        ) : copy.status === 'active' ? (
          <Button disabled={closePending} onClick={onClose} size="sm" variant="outline">
            Close working copy
          </Button>
        ) : null}
      </div>
    </Alert>
  );
}

/** The immutable-document guarantees and the embedded editors' health. */
export function DocumentPolicy({
  editorHealth,
  workingCopy,
}: {
  editorHealth?: { editors: Array<{ provider: string; healthy: boolean; error?: string }> };
  workingCopy?: DocumentWorkingCopy;
}) {
  return (
    <Alert>
      <ShieldCheckIcon aria-hidden="true" />
      <AlertTitle>Immutable document boundary</AlertTitle>
      <AlertDescription className="grid gap-3">
        <ul className="list-disc space-y-2 pl-5">
          <li>The original artifact is canonical; PDF renditions are derived.</li>
          <li>Reviews bind to one version and checksum, so stale anchors are rejected.</li>
          <li>Stable working-copy saves mint or deduplicate immutable revisions.</li>
          <li>Embedded editors receive short-lived access to one working copy, not credentials.</li>
        </ul>
        {editorHealth?.editors.map((editor) => (
          <ClioStatus
            detail={editor.error}
            key={editor.provider}
            label={`${editorLabel(editor.provider)} ${editor.healthy ? 'available' : 'unavailable'}`}
            value={editor.healthy ? 'healthy' : 'unavailable'}
          />
        ))}
        {workingCopy ? (
          <p className="font-mono text-[0.625rem]">
            Working copy {workingCopy.id}, head version {workingCopy.head_version}
          </p>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

function workingCopyStatusValue(status: DocumentWorkingCopy['status']) {
  if (status === 'active') return 'healthy' as const;
  if (status === 'closed') return 'completed' as const;
  if (status === 'conflict') return 'degraded' as const;
  if (status === 'missing') return 'unavailable' as const;
  return 'failed' as const;
}
