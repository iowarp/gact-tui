import { TransportError } from '@clio/core/v3';

/**
 * Keeps a request on the connection's own origin.
 *
 * Request paths can come from the service's data (an artifact's `fetch_path`,
 * an imported session), and `new URL(path, endpoint)` lets an absolute URL
 * replace the host. The transports add the connection's bearer token to every
 * request, so a path that resolves to another origin is refused before anything
 * is sent.
 */
export function sameOriginUrl(endpoint: string, url: string, path: string): string {
  if (new URL(url).origin !== new URL(endpoint).origin) {
    throw new TransportError(
      `The service named an address outside itself (${path}); the request was not sent`,
      undefined,
      'path_outside_endpoint',
    );
  }
  return url;
}
