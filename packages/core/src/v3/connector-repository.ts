import { z } from 'zod';
import {
  connectorListSchema,
  connectorSchema,
  type Connector,
  type ConnectorCreateInput,
  type ConnectorValues,
} from './connector-domain.js';
import { McpRepository } from './mcp-repository.js';
import { offerListSchema, type OfferList, type OfferListChoice } from './offer-list-domain.js';

const connectorPath = (id: string) => `/v1/connectors/${encodeURIComponent(id)}`;
const OFFER_LIST = '/v1/plugins/offer-list';

/** Connectors: the list with each one's state, its logo, its values, and where it applies. */
export class ConnectorRepository extends McpRepository {
  public async connectors(signal?: AbortSignal): Promise<Connector[]> {
    const result = await this.transport.request({
      method: 'GET',
      path: '/v1/connectors',
      decode: (value) => connectorListSchema.parse(value),
      signal,
    });
    return result.connectors;
  }

  /**
   * One connector as a conversation sees it: its own values over the person's defaults,
   * with each address or value row's `default_value` and `conversation`.
   */
  public sessionConnector(id: string, sessionId: string, signal?: AbortSignal): Promise<Connector> {
    return this.transport.request({
      method: 'GET',
      path: `${connectorPath(id)}?session_id=${encodeURIComponent(sessionId)}`,
      decode: (value) => connectorSchema.parse(value),
      signal,
    });
  }

  /**
   * The connector's SVG, as text. It is read through the transport (which carries the
   * service's credentials) and shown as an image, never inserted into the page. `dark`
   * reads the dark-theme variant a row names as `logo_dark_url`.
   */
  public connectorLogo(
    id: string,
    signal?: AbortSignal,
    theme: 'light' | 'dark' = 'light',
  ): Promise<string> {
    return this.transport.request({
      method: 'GET',
      path: `${connectorPath(id)}/logo${theme === 'dark' ? '?theme=dark' : ''}`,
      responseType: 'text',
      decode: (value) => z.string().parse(value),
      signal,
    });
  }

  /** Saves the card's rows; the answer comes after CLIO reconnects with them. */
  public setConnectorValues(
    id: string,
    values: ConnectorValues,
    signal?: AbortSignal,
  ): Promise<Connector> {
    return this.transport.request({
      method: 'PUT',
      path: `${connectorPath(id)}/values`,
      body: { values },
      decode: (value) => connectorSchema.parse(value),
      signal,
    });
  }

  /** Installs and readies the connector; it joins no conversation by itself. */
  public enableConnector(id: string, signal?: AbortSignal): Promise<Connector> {
    return this.transport.request({
      method: 'POST',
      path: `${connectorPath(id)}/enable`,
      decode: (value) => connectorSchema.parse(value),
      signal,
    });
  }

  public disableConnector(id: string, signal?: AbortSignal): Promise<Connector> {
    return this.transport.request({
      method: 'POST',
      path: `${connectorPath(id)}/disable`,
      decode: (value) => connectorSchema.parse(value),
      signal,
    });
  }

  /** Removes a connector added by URL or command; a catalog connector is turned off instead. */
  public removeConnector(
    id: string,
    signal?: AbortSignal,
  ): Promise<{ id: string; removed: boolean }> {
    return this.transport.request({
      method: 'DELETE',
      path: connectorPath(id),
      decode: (value) => z.object({ id: z.string(), removed: z.boolean() }).parse(value),
      signal,
    });
  }

  /** A connector for a server that has no entry: an address or a command. */
  public createConnector(input: ConnectorCreateInput, signal?: AbortSignal): Promise<Connector> {
    return this.transport.request({
      method: 'POST',
      path: '/v1/connectors',
      body: input,
      decode: (value) => connectorSchema.parse(value),
      signal,
    });
  }

  /** Every plugin and connector the agent may offer, with the person's ticks. */
  public offerList(signal?: AbortSignal): Promise<OfferList> {
    return this.transport.request({
      method: 'GET',
      path: OFFER_LIST,
      decode: (value) => offerListSchema.parse(value),
      signal,
    });
  }

  /** Saves the ticks over the default list; it applies from the next turn. */
  public saveOfferList(choice: OfferListChoice, signal?: AbortSignal): Promise<OfferList> {
    return this.transport.request({
      method: 'PUT',
      path: OFFER_LIST,
      body: choice,
      decode: (value) => offerListSchema.parse(value),
      signal,
    });
  }

  /** Back to the default list. */
  public resetOfferList(signal?: AbortSignal): Promise<OfferList> {
    return this.transport.request({
      method: 'DELETE',
      path: OFFER_LIST,
      decode: (value) => offerListSchema.parse(value),
      signal,
    });
  }
}
