import { z } from 'zod';
import {
  a2uiCapabilitiesResponseSchema,
  decodeA2uiCatalogRows,
  mergeA2uiClientMetadata,
} from './a2ui/index.js';
import type {
  A2uiCapabilitiesResponse,
  A2uiCatalogListDecodeResult,
  A2uiReferenceResolution,
} from './a2ui/index.js';
import { resolveSessionReference, readResolvedReferenceBytes } from './a2ui/reference-transport.js';
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
  ): Promise<{ status: string; destination?: string; state?: string; delivery?: string }> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/a2ui/actions`,
      body: {
        message,
        correlation,
        metadata: mergeA2uiClientMetadata(sessionId, undefined, { includeDataModel: true }),
      },
      decode: (value) =>
        z
          .object({
            status: z.string(),
            destination: z.string().optional(),
            state: z.string().optional(),
            delivery: z.string().optional(),
          })
          .passthrough()
          .parse(value),
      signal,
    });
  }

  /**
   * The client's registry source (`docs/gact/a2ui-binding.md`, S2/S6): every
   * installed catalog, with `producible`/`file`/`instructions` scoped to this
   * session's active blueprint.
   *
   * Decodes ROW BY ROW (`decodeA2uiCatalogRows`, S1 adversarial follow-up):
   * one malformed row (a marketplace pack catalog with a schema drift) is
   * recorded in `rejected` and dropped, never thrown — the two BUILTIN
   * catalogs, and every other valid pack row, still load. Only the
   * top-level shape itself failing to decode throws (a genuine
   * `decode_failed`, `web/src/lib/a2ui/registry-failure.ts`'s
   * classification).
   */
  public a2uiCatalogs(
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<A2uiCatalogListDecodeResult> {
    return this.transport.request({
      method: 'GET',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/a2ui/catalogs`,
      decode: (value) => decodeA2uiCatalogRows((value as { catalogs?: unknown }).catalogs),
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

  /**
   * Resolves one CLIO content reference (`artifact:` / `resource:` / bare id)
   * a surface of `sessionId` carries. The service owns the URI grammar; the
   * reference travels verbatim as one percent-encoded query value.
   */
  public resolveA2uiReference(
    sessionId: string,
    uri: string,
    signal?: AbortSignal,
  ): Promise<A2uiReferenceResolution> {
    return resolveSessionReference(this.transport, sessionId, uri, signal);
  }

  /**
   * Reads a resolved reference's bytes through this repository's transport
   * (so a remote service receives its bearer). An artifact follows only the
   * server-authorized `custody_not_cas` redirect; every other failure stays typed.
   */
  public readA2uiReferenceBytes(
    resolution: A2uiReferenceResolution,
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    return readResolvedReferenceBytes(this.transport, resolution, signal);
  }
}
