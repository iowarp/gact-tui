import type { ManagedBackendStatus } from '@/tauri/managed-backend';

export type DesktopBootStage =
  | 'checking_existing'
  | 'starting_service'
  | 'installing_runtime'
  | 'opening_workspace';

export function managedBootStage(status?: ManagedBackendStatus): DesktopBootStage {
  if (status?.kind === 'needs_install') return 'installing_runtime';
  if (status?.kind === 'starting') return status.detail;
  return 'checking_existing';
}
