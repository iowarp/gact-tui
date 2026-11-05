import { z } from 'zod';
import { StructuredFileRepository } from './structured-file-repository.js';

/**
 * The agent's in-app browser as the UI sees it: one session's pages, each streamed live
 * over `/v1/sessions/{sid}/browser/{pageId}/live` and shared between the person and the
 * agent. The server owns the browser; this reads its pages and lets the person allow a
 * host a page was blocked from.
 */
const blockedSchema = z
  .object({
    host: z.string(),
    url: z.string().default(''),
    reason: z.string().default(''),
    at: z.string().default(''),
  })
  .nullable()
  .default(null);

/** A certificate the browser does not trust, which the page shows a warning for. */
const certificateSchema = z
  .object({
    host: z.string(),
    url: z.string().default(''),
    error: z.string().default(''),
    issuer: z.string().default(''),
    subject: z.string().default(''),
    fingerprint: z.string().default(''),
    valid_to: z.string().default(''),
    /** False in the person's own Chrome: they proceed there, and CLIO keeps no grant. */
    grantable: z.boolean().default(false),
  })
  .nullable()
  .default(null);

export type BrowserCertificate = NonNullable<z.infer<typeof certificateSchema>>;

export const browserPageSchema = z.object({
  id: z.string(),
  session_id: z.string(),
  label: z.string().default(''),
  url: z.string().default(''),
  host: z.string().default(''),
  title: z.string().default(''),
  loading: z.boolean().default(false),
  agent_acting: z.boolean().default(false),
  last_action: z.string().default(''),
  navigation_blocked: blockedSchema,
  sandbox_off: z.boolean().default(false),
  sandbox_reason: z.string().default(''),
  closed: z.boolean().default(false),
  certificate_untrusted: certificateSchema,
});

export type BrowserPage = z.infer<typeof browserPageSchema>;

/** One live-view state message: the page plus what this viewer may do. */
export const browserLiveStateSchema = browserPageSchema.extend({
  type: z.literal('state'),
  view_only: z.boolean().default(false),
  viewport: z
    .object({ width: z.number().default(0), height: z.number().default(0) })
    .default({ width: 0, height: 0 }),
});

export type BrowserLiveState = z.infer<typeof browserLiveStateSchema>;

const pagesSchema = z.object({ pages: z.array(browserPageSchema) });
const allowedSchema = z.object({ allowed: z.string(), page: browserPageSchema });
const openedSchema = z.object({ page: browserPageSchema });
const trustedSchema = z.object({ host: z.string(), fingerprint: z.string(), scope: z.string() });

/** The live view's WebSocket path for one page. */
export function browserLivePath(sessionId: string, pageId: string): string {
  return `/v1/sessions/${encodeURIComponent(sessionId)}/browser/${encodeURIComponent(pageId)}/live`;
}

/** The subprotocol the live view speaks; the bearer rides beside it as `clio-bearer.`. */
export const BROWSER_LIVE_PROTOCOL = 'clio.browser.v1';

export class BrowserRepository extends StructuredFileRepository {
  public async browserPages(sessionId: string, signal?: AbortSignal): Promise<BrowserPage[]> {
    const result = await this.transport.request({
      method: 'GET',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/browser/pages`,
      decode: (value) => pagesSchema.parse(value),
      signal,
    });
    return result.pages;
  }

  /** Open ``url`` in the conversation's shared browser as the person, as a link they clicked. */
  public async openBrowserPage(
    sessionId: string,
    url: string,
    signal?: AbortSignal,
  ): Promise<BrowserPage> {
    const result = await this.transport.request({
      method: 'POST',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/browser/pages`,
      body: { url },
      decode: (value) => openedSchema.parse(value),
      signal,
    });
    return result.page;
  }

  public async allowBrowserHost(
    sessionId: string,
    pageId: string,
    signal?: AbortSignal,
  ): Promise<{ allowed: string; page: BrowserPage }> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/browser/pages/${encodeURIComponent(pageId)}/allow-host`,
      decode: (value) => allowedSchema.parse(value),
      signal,
    });
  }

  /** The person trusts the certificate the page warns about; the browser then restarts. */
  public async trustBrowserCertificate(
    sessionId: string,
    pageId: string,
    scope: 'session' | 'workspace',
    signal?: AbortSignal,
  ): Promise<{ host: string; fingerprint: string; scope: string }> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/browser/pages/${encodeURIComponent(pageId)}/trust-certificate`,
      body: { scope },
      decode: (value) => trustedSchema.parse(value),
      signal,
    });
  }
}
