import { TransportError } from '@clio/core/v3';
import { vocab } from '@/lib/brand-vocabulary';

const RAW_HTTP = /^request failed with \d{3}\b/i;

/**
 * One human sentence for a connected-data failure. Transport status lines
 * ("Request failed with 404 Not Found") never reach the reader.
 */
export function connectedSourceErrorMessage(error: unknown): string {
  const status = error instanceof TransportError ? error.status : undefined;
  if (status === 404) return `Connected data is not available on this ${vocab.agent}.`;
  if (status === 401 || status === 403)
    return `This ${vocab.agent} did not allow access to connected data.`;
  const message = error instanceof Error ? error.message.trim() : '';
  if (!message || RAW_HTTP.test(message) || (status !== undefined && status >= 500))
    return 'Connected data could not be loaded. Try again in a moment.';
  return message;
}
