import { z } from 'zod';
import {
  connectorListSchema,
  connectorSchema,
  type Connector,
  type ConnectorCreateInput,
  type ConnectorScope,
  type ConnectorValues,
} from './connector-domain.js';
import { McpRepository } from './mcp-repository.js';

const connectorPath = (id: string) => `/v1/connectors/${encodeURIComponent(id)}`;

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
   * service's credentials) and shown as an image, never inserted into the page.
   */
  public connectorLogo(id: string, signal?: AbortSignal): Promise<string> {
    return this.transport.request({
      method: 'GET',
      path: `${connectorPath(id)}/logo`,
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

  public enableConnector(
    id: string,
    scope: ConnectorScope,
    signal?: AbortSignal,
  ): Promise<Connector> {
    return this.transport.request({
      method: 'POST',
      path: `${connectorPath(id)}/enable`,
      body: { scope },
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
}
