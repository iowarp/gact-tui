/**
 * View-model / pure logic for Doctor Page: state shaping and helpers, no DOM. Key export `CapabilityGapRow`.
 */
import type { HealthSnapshot } from '@clio/core';
import { healthTone, lspTone, type DoctorTone } from '../../statusTones.js';

export type { DoctorTone };

export interface CapabilityGapRow {
  name: string;
  status: string;
  category: string;
  description: string;
  advertised: boolean;
}

export function capabilityGapRows(
  capabilityGaps: Record<string, Record<string, unknown>> = {},
): CapabilityGapRow[] {
  return Object.entries(capabilityGaps).map(([name, details]) => ({
    name,
    status: (details.status as string) ?? 'unknown',
    category: (details.category as string) ?? '',
    description: (details.description as string) ?? '',
    advertised: details.advertised === true,
  }));
}

export function overallHealthStatus(data?: HealthSnapshot): string {
  return data?.overall_status ?? (data?.healthy ? 'healthy' : 'unknown');
}

export function overallHealthMeaning(overallStatus: string): string {
  switch (overallStatus) {
    case 'healthy':
    case 'ready':
      return 'All reported integrations are ready.';
    case 'degraded':
      return 'Some integrations need attention.';
    case 'unavailable':
      return 'Backend health checks are unavailable.';
    default:
      return 'Backend reported an unknown health state.';
  }
}

export function healthStatusTone(status: string): DoctorTone {
  return healthTone(status);
}

export function lspStatusTone(status?: string): DoctorTone {
  return lspTone(status);
}

export function healthStatusColor(overall: string): string {
  if (overall === 'healthy' || overall === 'ready') return 'var(--color-success)';
  if (overall === 'degraded') return 'var(--color-warning)';
  if (overall === 'unavailable') return 'var(--color-error)';
  return 'var(--color-heading)';
}

export function humanUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}
