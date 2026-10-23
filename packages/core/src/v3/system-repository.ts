import { z } from 'zod';
import { sessionSchema } from './schemas.js';
export const fleetSettingsSchema = z.object({
  revision: z.string(),
  search: z.object({ provider_id: z.string(), model_id: z.string() }).nullable().optional(),
  judges: z.object({
    goals: z.object({ provider_id: z.string(), model_id: z.string() }).nullable(),
    variants: z.object({ provider_id: z.string(), model_id: z.string() }).nullable(),
    permissions: z.object({ provider_id: z.string(), model_id: z.string() }).nullable(),
    memory_extract: z
      .object({ provider_id: z.string(), model_id: z.string() })
      .nullable()
      .optional(),
    memory_consolidate: z
      .object({ provider_id: z.string(), model_id: z.string() })
      .nullable()
      .optional(),
  }),
});
import { InfrastructureRepository } from './infrastructure-repository.js';
import { spotterAvailabilitySchema, type SpotterAvailability } from './spotter-domain.js';
import {
  runtimeSettingsSchema,
  type RuntimeSettings,
  type UpdateRuntimeSettings,
} from './runtime-settings-domain.js';

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

/** System-wide surfaces scoped to the connected service. */
export class SystemRepository extends InfrastructureRepository {
  public searchFilePassage(workspaceId: string, path: string, line: number, signal?: AbortSignal) {
    return this.transport.request({
      method: 'GET',
      path: `/v1/workspaces/${encodeURIComponent(workspaceId)}/files/passage?${new URLSearchParams({ path, line: String(line) })}`,
      signal,
      decode: (value) =>
        z
          .object({
            text: z.string(),
            start_line: z.number().int().positive(),
            truncated: z.boolean(),
            next_line: z.number().int().positive().nullable(),
          })
          .parse(value),
    });
  }
  public openSearchSession(
    input: { workspace_id: string; parent_session_id?: string },
    signal?: AbortSignal,
  ) {
    return this.transport.request({
      method: 'POST',
      path: '/v1/search/sessions',
      body: input,
      signal,
      decode: (value) => sessionSchema.parse(value),
    });
  }
  public fleetSettings(signal?: AbortSignal) {
    return this.transport.request({
      method: 'GET',
      path: '/v1/settings/fleet',
      signal,
      decode: (value) => fleetSettingsSchema.parse(value),
    });
  }

  public updateFleetSettings(input: z.input<typeof fleetSettingsSchema>, signal?: AbortSignal) {
    return this.transport.request({
      method: 'PATCH',
      path: '/v1/settings/fleet',
      body: input,
      signal,
      decode: (value) => fleetSettingsSchema.parse(value),
    });
  }

  public runtimeSettings(signal?: AbortSignal): Promise<RuntimeSettings> {
    return this.transport.request({
      method: 'GET',
      path: '/v1/settings/runtime',
      decode: (value) => runtimeSettingsSchema.parse(value),
      signal,
    });
  }

  public updateRuntimeSettings(
    input: UpdateRuntimeSettings,
    signal?: AbortSignal,
  ): Promise<RuntimeSettings> {
    return this.transport.request({
      method: 'PATCH',
      path: '/v1/settings/runtime',
      body: input,
      decode: (value) => runtimeSettingsSchema.parse(value),
      signal,
    });
  }

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
