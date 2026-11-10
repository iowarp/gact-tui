import { TransportError, type ClioTransport, type TransportRequest } from '@clio/core/v3';
import {
  BASIC_CATALOG_ROW,
  CLIO_WORKSPACE_CATALOG_ROW,
} from '@/test-fixtures/a2ui/v0_9_1/fixtures';

export const TOUR_PRACTICE_SESSION_ID = 'tour_practice';

const CATALOGS = new RegExp(`^/v1/sessions/${TOUR_PRACTICE_SESSION_ID}/a2ui/catalogs$`, 'u');
const CAPABILITIES = new RegExp(
  `^/v1/sessions/${TOUR_PRACTICE_SESSION_ID}/a2ui/capabilities$`,
  'u',
);

/**
 * The practice conversation's only "service": it answers the two catalog reads
 * its surfaces need and refuses everything else, so a click in the tour can
 * never reach an agent, a model or the person's real conversations.
 */
export class TourTransport implements ClioTransport {
  public async request<T>(request: TransportRequest<T>): Promise<T> {
    if (request.method === 'GET' && CATALOGS.test(request.path)) {
      return request.decode({ catalogs: [CLIO_WORKSPACE_CATALOG_ROW, BASIC_CATALOG_ROW] });
    }
    if (request.method === 'GET' && CAPABILITIES.test(request.path)) {
      return request.decode({
        agent: {
          'v0.9': {
            supportedCatalogIds: [
              CLIO_WORKSPACE_CATALOG_ROW.catalogId,
              BASIC_CATALOG_ROW.catalogId,
            ],
          },
        },
        client: null,
        selection: null,
      });
    }
    throw new TransportError(
      'The practice conversation is not connected to a service.',
      409,
      'tour_practice',
    );
  }

  public stream(): AsyncIterable<never> {
    return {
      [Symbol.asyncIterator]: () => ({
        next: async () => {
          throw new TransportError(
            'The practice conversation has no live activity.',
            409,
            'tour_practice',
          );
        },
      }),
    };
  }
}
