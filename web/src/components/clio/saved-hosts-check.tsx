import { useSyncExternalStore } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { vocab } from '@/lib/brand-vocabulary';
import { infrastructureRecovery, onInfrastructureRecovery } from '@/tauri/ssh-recovery-progress';

function subscribe(changed: () => void): () => void {
  return onInfrastructureRecovery(changed);
}

/** The progress as text (stable for React when unchanged), or undefined when idle. */
function read(): string | undefined {
  const progress = infrastructureRecovery();
  return progress ? `${progress.done}/${progress.total}` : undefined;
}

/**
 * The desktop's check of its saved SSH hosts, while it runs: the remote
 * agents found there join the list as each host answers.
 */
export function SavedHostsCheck() {
  const progress = useSyncExternalStore(subscribe, read, () => undefined);
  if (!progress) return null;
  return (
    <p className="m-0 flex items-center gap-2 text-xs text-muted-foreground" role="status">
      <Spinner aria-hidden="true" className="size-3" />
      Checking saved {vocab.agent} installs {progress}
    </p>
  );
}
