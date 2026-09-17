import { z } from 'zod';

/**
 * `GET /v1/sessions/{sid}/a2ui/capabilities` (`docs/gact/a2ui-binding.md`):
 * the server's own negotiation state. Only `agent` is required here — the
 * ordering signal the client's own advertisement follows
 * (`orderSupportedCatalogIds` below); `client`/`selection` are read
 * permissively since this module never needs to interpret them.
 */
const a2uiVersionCapabilitiesSchema = z.object({
  supportedCatalogIds: z.array(z.string()),
  acceptsInlineCatalogs: z.boolean().optional(),
});

export const a2uiCapabilitiesResponseSchema = z
  .object({
    agent: z.object({ 'v0.9': a2uiVersionCapabilitiesSchema }).passthrough(),
    client: z.unknown().optional().nullable(),
    selection: z.unknown().optional(),
  })
  .passthrough();

export type A2uiCapabilitiesResponse = z.infer<typeof a2uiCapabilitiesResponseSchema>;

/**
 * Orders a resolved id list to match the server's own preference order
 * (owner decision, adversarial S6 review): the active blueprint's pack
 * catalogs first, then the builtins, exactly as
 * `agent.v0.9.supportedCatalogIds` lists them — NOT the raw
 * `GET .../a2ui/catalogs` row order, which is builtins-first. An id the
 * server didn't mention (a stale/unresolvable row) is appended at the end in
 * its original resolved order, never dropped silently.
 */
export function orderSupportedCatalogIds(
  resolvedIds: readonly string[],
  preferenceOrder: readonly string[],
): string[] {
  const rank = new Map(preferenceOrder.map((id, index) => [id, index]));
  const known = resolvedIds.filter((id) => rank.has(id));
  const unknown = resolvedIds.filter((id) => !rank.has(id));
  known.sort((a, b) => rank.get(a)! - rank.get(b)!);
  return [...known, ...unknown];
}
