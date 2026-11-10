import { managedBootStage, STARTUP_STEP_OF } from '@/lib/desktop-boot-stage';
import type { ManagedBackendStatus } from '@/tauri/managed-backend';
import { LocalStartupSteps } from './local-startup-steps';
import { useStartupLog } from './use-startup-log';

/** The local service's startup steps and its actual package output while waiting. */
export function LocalStartupProgress({
  active,
  status,
}: {
  active: boolean;
  status?: ManagedBackendStatus;
}) {
  const log = useStartupLog(true, active);
  const stage = status?.kind === 'ready' ? 'opening_workspace' : managedBootStage(status);
  return <LocalStartupSteps current={STARTUP_STEP_OF[stage]} failed={!active} log={log} />;
}
