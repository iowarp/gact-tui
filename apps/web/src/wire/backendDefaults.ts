/**
 * Single source of truth for the default clio backend URL.
 *
 * Port story (see apps/README.md "Backend ports & default host"):
 *   - 17800 = clio — the shipped product backend this UI talks to.
 *   - 7777  = the emulator / gact TUI dev default — a DIFFERENT server.
 *     Changing the TUI's dev default is an owner decision, not made here.
 *
 * Host split (INTENTIONAL — do not collapse to one host): the loopback-IP
 * form `127.0.0.1` and the hostname form `localhost` are both in use and are
 * NOT interchangeable across call sites. The connect form and fixture seeds
 * probe the IP form; the pure-web splash probe and the remote-backend wizard
 * prefill use the hostname form; the pure-web candidate list
 * (routes/splashBackend.ts) probes BOTH forms in order. Tests pin both forms
 * (ConnectScreenModel.test.ts, SplashBackend.test.ts), so this module keeps
 * each site's existing host rather than flipping everything to one.
 */

/** Default clio backend — loopback-IP host form (`127.0.0.1`). */
export const DEFAULT_BACKEND_URL = 'http://127.0.0.1:17800';

/** Default clio backend — hostname host form (`localhost`); see host-split note. */
export const DEFAULT_BACKEND_URL_LOCALHOST = 'http://localhost:17800';

/** Human-readable `host:port` for display / hint copy. */
export const DEFAULT_BACKEND_DISPLAY = 'localhost:17800';
