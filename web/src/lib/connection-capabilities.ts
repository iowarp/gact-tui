import { TransportError, type CapabilityNegotiation, type ClioRepository } from '@clio/core/v3';

/** Identify a missing service at negotiation, without relabelling later API errors. */
export async function connectionCapabilities(
  repository: Pick<ClioRepository, 'capabilities'>,
  endpoint: string,
): Promise<CapabilityNegotiation> {
  try {
    return await repository.capabilities();
  } catch (error) {
    if (!(error instanceof TransportError) || error.status !== 404) throw error;
    throw new TransportError(
      'No agent service was found at this address. Check the service address; it can differ from the web page address.',
      error.status,
      'agent_service_not_found',
      { endpoint, message: error.message, code: error.code, details: error.details },
    );
  }
}
