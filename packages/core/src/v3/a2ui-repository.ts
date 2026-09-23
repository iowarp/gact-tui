import { z } from 'zod';
import {
  a2uiCapabilitiesResponseSchema,
  a2uiCatalogRowListSchema,
  mergeA2uiClientMetadata,
} from './a2ui/index.js';
import type { A2uiCapabilitiesResponse, A2uiCatalogRow } from './a2ui/index.js';
import { PresentationRepository } from './presentation-repository.js';

/**
 * The A2UI transport doors (`docs/gact/a2ui-binding.md`): posting a client
 * action/error and reading the session's catalog registry source. Split out
 * of `repository.ts` (`ClioRepository`'s mixin chain) purely for file size —
 * these are `ClioRepository`'s own public methods either way.
 */
export class A2uiRepository extends PresentationRepository {
  public a2uiAction(
    sessionId: string,
    message: unknown,
    correlation?: { run_id?: string; message_id?: string; part_id?: string },
    signal?: AbortSignal,
  ): Promise<{ status: string }> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/a2ui/actions`,
      body: {
        message,
        correlation,
        metadata: mergeA2uiClientMetadata(sessionId, undefined, { includeDataModel: true }),
      },
      decode: (value) => z.object({ status: z.string() }).passthrough().parse(value),
      signal,
    });
  }

  /**
   * The client's registry source (`docs/gact/a2ui-binding.md`, S2/S6): every
   * installed catalog, with `producible`/`file`/`instructions` scoped to this
   * session's active blueprint.
   */
  public a2uiCatalogs(sessionId: string, signal?: AbortSignal): Promise<A2uiCatalogRow[]> {
    return this.transport.request({
      method: 'GET',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/a2ui/catalogs`,
      decode: (value) => a2uiCatalogRowListSchema.parse((value as { catalogs?: unknown }).catalogs),
      signal,
    });
  }

  /**
   * The negotiation the server itself uses to pick a catalog
   * (`docs/gact/a2ui-binding.md`): `agent.v0.9.supportedCatalogIds` is the
   * producible set, preference-ordered — the active blueprint's own pack
   * catalogs first, then the builtins — used to order the client's own
   * `a2uiClientCapabilities` advertisement the same way.
   */
  public a2uiCapabilities(
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<A2uiCapabilitiesResponse> {
    return this.transport.request({
      method: 'GET',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/a2ui/capabilities`,
      decode: (value) => a2uiCapabilitiesResponseSchema.parse(value),
      signal,
    });
  }
}
