import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Spinner } from '@/components/ui/spinner';
import type { ManagedBackendStatus } from '@/tauri/managed-backend';

const stages = {
  checking_existing: 'Checking the local service',
  installing_runtime: 'Preparing the local runtime and packages',
  starting_service: 'Starting the local service',
};

/** Show the native startup stage and its actual package output while waiting. */
export function LocalStartupProgress({
  active,
  status,
}: {
  active: boolean;
  status?: ManagedBackendStatus;
}) {
  const [log, setLog] = useState('');
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    let disposed = false;
    let reading = false;
    const started = Date.now();
    const read = async () => {
      if (reading) return;
      reading = true;
      try {
        const text = await invoke<string>('read_logs');
        if (!disposed) setLog(text.slice(-6000));
      } catch {
        // A missing boot log must not replace the supervisor's real failure.
      } finally {
        reading = false;
      }
    };
    void read();
    const timer = active
      ? window.setInterval(() => {
          setElapsed(Math.floor((Date.now() - started) / 1000));
          void read();
        }, 1000)
      : undefined;
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [active]);
  const label =
    status?.kind === 'ready'
      ? 'Opening the workspace'
      : status?.kind === 'starting'
        ? stages[status.detail]
        : 'Preparing the local service';
  const line = log
    .split('\n')
    .filter((item) => item.trim() && !item.startsWith('==='))
    .at(-1);
  return (
    <div className="min-w-0 rounded-lg border bg-muted/30 p-3 text-sm">
      {active ? (
        <div aria-live="polite" role="status" className="flex items-center gap-2">
          <Spinner aria-hidden="true" className="size-4 shrink-0" />
          <span className="flex-1">{label}</span>
          <span className="text-xs tabular-nums text-muted-foreground">{elapsed}s</span>
        </div>
      ) : null}
      {line ? <p className="mt-2 break-words text-xs text-muted-foreground">{line}</p> : null}
      {log ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs">Startup details</summary>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs">
            {log}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
