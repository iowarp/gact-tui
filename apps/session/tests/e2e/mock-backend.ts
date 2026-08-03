/**
 * Minimal route-level mock backend for the P4.R boot-and-connect spec.
 *
 * Deliberately small: it serves only what a boot + connect needs
 * (`/v1/capabilities` for the handshake, `/v1/sessions` for the landing list).
 * The full fixture corpus is P5.1's visual-harness scope (gact-tui#340) —
 * this file must not grow into a second one.
 */
import type { Page, Route } from '@playwright/test';

export const MOCK_BACKEND = 'http://mock.test';

export const MOCK_SESSION_ID = 'sess_boot_0001';

/** Contract version the app requires; a mismatch is a loud refusal (P4.6b).
 *  Matches the REAL backend's value (`gact/types.py: contract_version = "0.2"`),
 *  not the `GACT v0.2` prose spelling used in docs. */
export const MOCK_CONTRACT = '0.2';

export interface MockBackendOptions {
  /** Override the advertised contract version to exercise the refusal path. */
  contract?: string;
  /** Fail every request with this status instead of serving fixtures. */
  failWithStatus?: number;
}

/** The nested Capabilities envelope the real server returns (SPEC 3.3) —
 *  capability gating reads `caps.capabilities.<flag>`, never `caps.<flag>`. */
const capabilities = (contract: string) => ({
  contract_version: contract,
  backend: {
    name: 'clio-agent-gact',
    version: '0.10.0-mock',
    vendor: 'iowarp',
  },
  capabilities: {
    workspaces: true,
    sessions: true,
    subagents: true,
    mcp: true,
    permissions: true,
    providers: true,
  },
  transports: { sse: true },
  auth: { schemes: ['trust_socket'] },
  extensions: [],
});

const sessions = () => ({
  sessions: [
    {
      id: MOCK_SESSION_ID,
      title: 'Boot smoke session',
      status: 'idle',
      created_at: '2026-08-03T00:00:00Z',
      updated_at: '2026-08-03T00:00:00Z',
      workspace_id: 'ws_default',
    },
  ],
});

/** Install network interception for the mock backend origin. */
export async function installMockBackend(
  page: Page,
  options: MockBackendOptions = {},
): Promise<void> {
  const contract = options.contract ?? MOCK_CONTRACT;

  await page.route(`${MOCK_BACKEND}/**`, async (route: Route) => {
    if (options.failWithStatus) {
      await route.fulfill({
        status: options.failWithStatus,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'mock failure' }),
      });
      return;
    }

    const url = new URL(route.request().url());
    const json = (body: unknown) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(body),
      });

    if (url.pathname === '/v1/capabilities') return json(capabilities(contract));
    if (url.pathname === '/v1/sessions') return json(sessions());

    // Anything else is out of P4.R scope — answer honestly rather than
    // silently returning an empty 200 the app would misread as real data.
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ detail: `unmocked route ${url.pathname}` }),
    });
  });
}

/** Drive the connect screen all the way to a connected backend. */
export async function connectMockBackend(
  page: Page,
  options: MockBackendOptions = {},
): Promise<void> {
  await installMockBackend(page, options);
  await page.goto('/');
  await page.getByTestId('connect-url').fill(MOCK_BACKEND);
  await page.getByTestId('connect-submit').click();
}
