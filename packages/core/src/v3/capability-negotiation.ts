import { capabilitiesSchema } from './schemas.js';
import { PROTOCOL_VERSION } from './protocol-versions.js';
import { TransportError } from './transport.js';

/** Decode negotiation without exposing schema internals as the connection message. */
export function decodeCapabilities(value: unknown) {
  const result = capabilitiesSchema.safeParse(value);
  if (result.success) return result.data;
  throw new TransportError(
    `This service returned an incompatible GACT capabilities response. Update the agent, check the service address, and ensure any proxy forwards X-GACT-Version: ${PROTOCOL_VERSION}.`,
    undefined,
    'incompatible_capabilities',
    { expected_version: PROTOCOL_VERSION, path: '/v1/capabilities', issues: result.error.issues },
  );
}
