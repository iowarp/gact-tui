import { z } from 'zod';

/**
 * CLIO content references an A2UI media/artifact component may carry
 * (`artifact:` / `resource:` URIs, or a bare `artifact_…` / `res_…` id).
 *
 * A reference is not a URL the browser can load: the viewer may be connected
 * to a remote CLIO, the scheme means nothing to `<img src>`, and the bytes sit
 * behind the service's bearer. Every reference is therefore resolved by the
 * service (`GET /v1/sessions/{sid}/references/resolve`) into metadata plus a
 * service-relative `fetch_path`, whose bytes the client reads through its
 * authenticated transport and renders from a `blob:` URL.
 */
const BARE_REFERENCE_ID = /^(?:artifact|res)_[A-Za-z0-9]+$/u;

/** Whether `value` is a CLIO reference the service must resolve (vs. an external URL). */
export function isClioReference(value: string): boolean {
  const trimmed = value.trim();
  if (BARE_REFERENCE_ID.test(trimmed)) return true;
  const scheme = trimmed.slice(0, trimmed.indexOf(':') + 1).toLowerCase();
  return scheme === 'artifact:' || scheme === 'resource:';
}

/** Whether `value` is a bare `artifact_…` / `res_…` id (no scheme). */
export function isBareClioReferenceId(value: string): boolean {
  return BARE_REFERENCE_ID.test(value.trim());
}

export const a2uiReferenceResolutionSchema = z
  .object({
    uri: z.string(),
    kind: z.enum(['artifact', 'resource']),
    workspace_id: z.string(),
    name: z.string(),
    media_type: z.string(),
    size_bytes: z.number().nullable().optional(),
    fetch_path: z.string().startsWith('/v1/'),
    artifact_id: z.string().optional(),
    resource_id: z.string().optional(),
    version: z.number().optional(),
    custody: z.string().optional(),
    state: z.string().optional(),
  })
  .passthrough();

/** The service's answer for one reference: what it is and where its bytes are read. */
export type A2uiReferenceResolution = z.infer<typeof a2uiReferenceResolutionSchema>;
