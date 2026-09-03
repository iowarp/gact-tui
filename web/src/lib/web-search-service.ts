/**
 * The single authoritative description of the CLIO Web Search deployment.
 *
 * These values are consumed from two languages: this client builds the copyable
 * `docker run` and the MCP install arguments from them, and
 * `desktop/src-tauri/src/infrastructure_setup.rs` runs the same container from
 * the desktop host. There is no build step that shares constants across that
 * boundary, so the contract is one authoritative site — this file — and a
 * pointer comment on the Rust side. Changing an image tag, a port, or the
 * clio-kit pin means changing it here and in the constants that comment names.
 *
 * A mismatch is not cosmetic: the desktop host would start a container the
 * client then fails to reach, or pin an MCP client against a server it cannot
 * speak to.
 */

/** clio-kit release the web MCP client is pinned to. */
export const WEB_MCP_VERSION = '2.10.5';

/** Container image the service runs from, tag included. */
export const WEB_SEARCH_IMAGE = 'ghcr.io/iowarp/clio-web-search:0.3.0';

/** Container name the desktop host inspects, starts, and creates. */
export const WEB_SEARCH_CONTAINER = 'clio-web-search';

/** Named volume holding the service's own state across container replacement. */
export const WEB_SEARCH_VOLUME = 'clio-web-search-data';

/** Path the volume is mounted at inside the container. */
export const WEB_SEARCH_VOLUME_PATH = '/var/lib/clio-web-search';

/** Host port the HTTP API is published on. */
export const WEB_SEARCH_HTTP_PORT = 8089;

/** Container port the HTTP API listens on. */
export const WEB_SEARCH_HTTP_CONTAINER_PORT = 8080;

/** Host port the cache is published on. */
export const WEB_SEARCH_CACHE_PORT = 8090;

/** Container port the cache listens on. */
export const WEB_SEARCH_CACHE_CONTAINER_PORT = 6379;

/** Environment variable carrying the operator's contact address. */
export const WEB_SEARCH_CONTACT_EMAIL_ENV = 'CLIO_WEB_SEARCH_CONTACT_EMAIL';

/** Where a locally deployed service answers. */
export const WEB_SEARCH_DEFAULT_LOCAL_URL = `http://127.0.0.1:${WEB_SEARCH_HTTP_PORT}`;

/** Where a service deployed on `host` answers. */
export function webSearchUrlForHost(host: string): string {
  return `http://${host}:${WEB_SEARCH_HTTP_PORT}`;
}

/** Arguments that run the pinned web MCP client against a deployed service. */
export function webSearchMcpArgs(remoteUrl: string): string[] {
  return [
    '--from',
    `clio-kit==${WEB_MCP_VERSION}`,
    'clio-kit',
    'mcp-server',
    'web',
    '--remote-url',
    remoteUrl,
  ];
}

/**
 * The `docker run` that deploys the service, for a person to copy and paste.
 *
 * Kept identical in shape to the argument vector the desktop host builds, so
 * the two paths produce the same container rather than two that merely look
 * alike.
 */
export function webSearchDeploymentCommand({
  bindAddress,
  contactEmail,
  sshProfile,
}: {
  bindAddress: string;
  contactEmail: string;
  sshProfile?: string;
}): string {
  const prefix = sshProfile ? `ssh ${sshProfile} ` : '';
  const email = contactEmail ? ` --env ${WEB_SEARCH_CONTACT_EMAIL_ENV}=${contactEmail}` : '';
  return (
    `${prefix}docker run --detach --name ${WEB_SEARCH_CONTAINER} --restart unless-stopped` +
    ` --publish ${bindAddress}:${WEB_SEARCH_HTTP_PORT}:${WEB_SEARCH_HTTP_CONTAINER_PORT}` +
    ` --publish ${bindAddress}:${WEB_SEARCH_CACHE_PORT}:${WEB_SEARCH_CACHE_CONTAINER_PORT}` +
    `${email} --volume ${WEB_SEARCH_VOLUME}:${WEB_SEARCH_VOLUME_PATH} ${WEB_SEARCH_IMAGE}`
  );
}
