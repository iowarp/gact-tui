/**
 * Persistent backend registry — Wave 2.
 *
 * A "backend" is a single GACT-conformant endpoint the user has
 * registered with CLIO Desktop / Web. The first entry is the bundled
 * local sidecar (URL + bearer minted by the Tauri supervisor); any
 * subsequent entries are added via /settings/backends/add-remote (or
 * the SSH tunnel wizard on desktop).
 *
 * The public module stays as a barrel so web, desktop, and tests can keep
 * importing from `@clio/core` while the implementation remains split by
 * responsibility.
 */

export * from './backend_types.js';
export * from './backend_persistence.js';
export * from './backend_reducers.js';
