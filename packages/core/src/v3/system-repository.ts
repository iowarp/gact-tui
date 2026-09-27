import { z } from 'zod';
import { InfrastructureRepository } from './infrastructure-repository.js';
import { spotterAvailabilitySchema, type SpotterAvailability } from './spotter-domain.js';

/**
 * The latest published CLIO release, as the connected server reports it (see
 * clio-agent's `GET /v1/system/latest-release`). The browser cannot fetch a
 * GitHub release asset directly -- GitHub sends no CORS headers on it -- so
 * the server does that fetch and hands back just the version panel's answer.
 *
 * `version` is absent -- never a guess -- whenever `degradation` is set: no
 * manifest reachable, or one with nothing usable in it.
 */
export interface LatestRelease {
  version: string | null;
  source: string;
  checked_at: string;
  degradation: { reason: string; message: string } | null;
}

export const latestReleaseSchema = z.object({
  version: z.string().nullable(),
  source: z.string(),
  checked_at: z.string(),
  degradation: z.object({ reason: z.string(), message: z.string() }).nullable(),
});

/** System-wide (connection-scoped, not session-scoped) read-only surfaces. */
export class SystemRepository extends InfrastructureRepository {
  public latestRelease(signal?: AbortSignal): Promise<LatestRelease> {
    return this.transport.request({
      method: 'GET',
      path: '/v1/system/latest-release',
      decode: (value) => latestReleaseSchema.parse(value),
      signal,
    });
  }

  /** Whether SPOTTER review can be armed for this session (or workspace), and why not. */
  public spotterAvailability(
    scope: { sessionId?: string; workspaceId?: string },
    signal?: AbortSignal,
  ): Promise<SpotterAvailability> {
    const query = new URLSearchParams();
    if (scope.sessionId) query.set('session_id', scope.sessionId);
    if (scope.workspaceId) query.set('workspace_id', scope.workspaceId);
    const encoded = query.toString();
    const suffix = encoded ? `?${encoded}` : '';
    return this.transport.request({
      method: 'GET',
      path: `/v1/spotter/availability${suffix}`,
      decode: (value) => spotterAvailabilitySchema.parse(value),
      signal,
    });
  }
}
