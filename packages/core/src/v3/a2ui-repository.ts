import { z } from 'zod';
import {
  a2uiCaptureRequestSchema,
  type A2uiViewerReport,
  type A2uiCaptureReply,
} from './a2ui-visual-contract.js';
import {
  a2uiCapabilitiesResponseSchema,
  decodeA2uiCatalogRows,
  mergeA2uiClientMetadata,
} from './a2ui/index.js';
import type {
  A2uiCapabilitiesResponse,
  A2uiCatalogListDecodeResult,
  A2uiReferenceResolution,
} from './a2ui/index.js';
import { resolveSessionReference, readResolvedReferenceBytes } from './a2ui/reference-transport.js';
import type { A2UISurface } from './domain.js';
import { PresentationRepository } from './presentation-repository.js';
import { a2uiSurfaceSchema } from './schemas.js';
import {
  a2uiActionReplySchema,
  pluginTabListSchema,
  pluginTabOpenedSchema,
  pluginPageListSchema,
  pluginPageOpenedSchema,
  pluginPageStatusSchema,
  type A2uiActionReply,
  type PluginPage,
  type PluginPageOpened,
  type PluginPageStatus,
  type PluginTab,
  type PluginTabOpened,
} from './plugin-tab-contract.js';
import { captureSessionReview } from './session-export-snapshot.js';
import type { SessionReviewSnapshot } from './session-export-snapshot.js';
import {
  dashboardReportSchema,
  savedDashboardSchema,
  type DashboardReport,
  type SavedDashboard,
} from './dashboard-report.js';
import { A2UI_VERSION } from './protocol-versions.js';

/**
 * Both action routes refuse (406) a request that does not name its A2UI version. The
 * header is the bare negotiation version ("0.9.1"); only the message envelope spells it
 * "v0.9.1", and the server refuses the envelope spelling here.
 */
const A2UI_ACTION_HEADERS = { 'x-a2ui-version': A2UI_VERSION } as const;

/**
 * Budget for opening a plugin tab or page, or acting on one. An open may wait for the
 * server's first start (a build), and an action for the person's answer to the server's
 * consent or for a slow remote call, so neither fits an ordinary call's budget. Unit: ms.
 */
const PLUGIN_SURFACE_TIMEOUT_MS = 30 * 60 * 1000;

/** `<plugin>/<tab>` keeps its slash: the route has a segment for each. */
function pluginTabPath(sessionId: string, tabId: string): string {
  const [plugin = '', tab = ''] = tabId.split('/', 2);
  return `/v1/sessions/${encodeURIComponent(sessionId)}/plugin-tabs/${encodeURIComponent(plugin)}/${encodeURIComponent(tab)}`;
}

/** `<plugin>/<page>` keeps its slash: the route has a segment for each. */
function pluginPagePath(pageId: string): string {
  const [plugin = '', page = ''] = pageId.split('/', 2);
  return `/v1/plugin-pages/${encodeURIComponent(plugin)}/${encodeURIComponent(page)}`;
}

/**
 * The A2UI transport doors (`docs/gact/a2ui-binding.md`): posting a client
 * action/error and reading the session's catalog registry source. Split out
 * of `repository.ts` (`ClioRepository`'s mixin chain) purely for file size —
 * these are `ClioRepository`'s own public methods either way.
 */
export class A2uiRepository extends PresentationRepository {
  /** Every surface of a conversation, folded from all its parts (reconnect catch-up). */
  public async surfaces(sessionId: string, signal?: AbortSignal): Promise<A2UISurface[]> {
    return this.transport.request({
      method: 'GET',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/a2ui/surfaces`,
      decode: (value) =>
        z
          .object({ surfaces: z.array(a2uiSurfaceSchema) })
          .passthrough()
          .parse(value).surfaces,
      signal,
    });
  }

  /** Renew one mounted renderer's lease and claim only requests assigned to it. */
  public reportA2uiViewer(sessionId: string, report: A2uiViewerReport, signal?: AbortSignal) {
    return this.transport.request({
      method: 'POST',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/a2ui/visual-feedback`,
      body: report,
      signal,
      decode: (value) =>
        z.object({ requests: z.array(a2uiCaptureRequestSchema) }).parse(value).requests,
    });
  }

  /** Return matching pixels or an explicit renderer failure to the waiting agent. */
  public completeA2uiCapture(sessionId: string, reply: A2uiCaptureReply, signal?: AbortSignal) {
    return this.transport.request({
      method: 'POST',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/a2ui/visual-feedback`,
      body: reply,
      signal,
      decode: (value) => z.object({ accepted: z.boolean() }).parse(value),
    });
  }
  /** Capture only chosen views and all their source rows/media, with no sampling. */
  public captureDashboard(sessionId: string, surfaces: unknown[]) {
    return captureSessionReview(this.transport, [sessionId], undefined, { [sessionId]: surfaces });
  }

  /** Package an agent-authored report with its actual data and the existing offline renderer. */
  public prepareDashboardExport(
    sessionId: string,
    artifactId: string,
    renderer: { javascript: string; stylesheet: string },
    snapshot: SessionReviewSnapshot,
  ): Promise<{ download_path: string; filename: string; artifact_id: string }> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/dashboards/${encodeURIComponent(artifactId)}/export`,
      body: { ...renderer, snapshot },
      timeoutMs: 30 * 60 * 1000,
      decode: (value) =>
        z
          .object({
            download_path: z.string().regex(/^\/v1\/session-export-downloads\/[a-f0-9]{64}$/u),
            filename: z.string(),
            artifact_id: z.string(),
          })
          .parse(value),
    });
  }

  public dashboards(sessionId: string): Promise<SavedDashboard[]> {
    return this.transport.request({
      method: 'GET',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/dashboards`,
      decode: (value) => z.array(savedDashboardSchema).parse(value),
    });
  }

  /** Retain displayed dashboard pixels and download through the ordinary export ticket. */
  public prepareDashboardImageExport(sessionId: string, artifactId: string, pngBase64: string) {
    return this.transport.request({
      method: 'POST',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/dashboards/${encodeURIComponent(artifactId)}/export`,
      body: { png_base64: pngBase64 },
      decode: (value) =>
        z
          .object({
            download_path: z.string().regex(/^\/v1\/session-export-downloads\/[a-f0-9]{64}$/u),
            filename: z.string(),
            artifact_id: z.string(),
          })
          .parse(value),
    });
  }

  public dashboard(sessionId: string, artifactId: string): Promise<DashboardReport> {
    return this.transport.request({
      method: 'GET',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/dashboards/${encodeURIComponent(artifactId)}`,
      decode: (value) => dashboardReportSchema.parse(value),
    });
  }

  public a2uiAction(
    sessionId: string,
    message: unknown,
    correlation?: { run_id?: string; message_id?: string; part_id?: string; question_id?: string },
    signal?: AbortSignal,
  ): Promise<A2uiActionReply> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/a2ui/actions`,
      headers: A2UI_ACTION_HEADERS,
      body: {
        message,
        correlation,
        metadata: mergeA2uiClientMetadata(sessionId, undefined, { includeDataModel: true }),
      },
      decode: (value) => a2uiActionReplySchema.parse(value),
      signal,
    });
  }

  /** HS3: the tabs the plugins mounted in this conversation offer. */
  public pluginTabs(sessionId: string, signal?: AbortSignal): Promise<PluginTab[]> {
    return this.transport.request({
      method: 'GET',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/plugin-tabs`,
      decode: (value) => pluginTabListSchema.parse(value),
      signal,
    });
  }

  /** Reads the tab's resource: its surfaces replace everything the tab held. */
  public openPluginTab(
    sessionId: string,
    tabId: string,
    signal?: AbortSignal,
  ): Promise<PluginTabOpened> {
    return this.transport.request({
      method: 'POST',
      path: `${pluginTabPath(sessionId, tabId)}/open`,
      body: {},
      timeoutMs: PLUGIN_SURFACE_TIMEOUT_MS,
      decode: (value) => pluginTabOpenedSchema.parse(value),
      signal,
    });
  }

  public closePluginTab(sessionId: string, tabId: string): Promise<{ closed: boolean }> {
    return this.transport.request({
      method: 'POST',
      path: `${pluginTabPath(sessionId, tabId)}/close`,
      body: {},
      decode: (value) => z.object({ closed: z.boolean() }).passthrough().parse(value),
    });
  }

  /** HS2 on a tab's surface: the action goes to the server that owns the tab. */
  public pluginTabAction(
    sessionId: string,
    tabId: string,
    message: unknown,
    signal?: AbortSignal,
  ): Promise<A2uiActionReply> {
    return this.transport.request({
      method: 'POST',
      path: `${pluginTabPath(sessionId, tabId)}/actions`,
      headers: A2UI_ACTION_HEADERS,
      timeoutMs: PLUGIN_SURFACE_TIMEOUT_MS,
      body: {
        message,
        metadata: mergeA2uiClientMetadata(sessionId, undefined, { includeDataModel: true }),
      },
      decode: (value) => a2uiActionReplySchema.parse(value),
      signal,
    });
  }

  /** The primary navigation pages every installed plugin declares (global). */
  public pluginPages(signal?: AbortSignal): Promise<PluginPage[]> {
    return this.transport.request({
      method: 'GET',
      path: '/v1/plugin-pages',
      decode: (value) => pluginPageListSchema.parse(value),
      signal,
    });
  }

  /** Reads the page's resource in its context, which the first open creates. */
  public openPluginPage(pageId: string, signal?: AbortSignal): Promise<PluginPageOpened> {
    return this.transport.request({
      method: 'POST',
      path: `${pluginPagePath(pageId)}/open`,
      body: {},
      timeoutMs: PLUGIN_SURFACE_TIMEOUT_MS,
      decode: (value) => pluginPageOpenedSchema.parse(value),
      signal,
    });
  }

  /** The steps of a page open in flight, polled while the open waits. */
  public pluginPageStatus(pageId: string, signal?: AbortSignal): Promise<PluginPageStatus> {
    return this.transport.request({
      method: 'GET',
      path: `${pluginPagePath(pageId)}/status`,
      decode: (value) => pluginPageStatusSchema.parse(value),
      signal,
    });
  }

  public closePluginPage(pageId: string): Promise<{ closed: boolean }> {
    return this.transport.request({
      method: 'POST',
      path: `${pluginPagePath(pageId)}/close`,
      body: {},
      decode: (value) => z.object({ closed: z.boolean() }).passthrough().parse(value),
    });
  }

  /** HS2 on a page's surface: the action goes to the server that owns the page. */
  public pluginPageAction(
    pageId: string,
    message: unknown,
    signal?: AbortSignal,
  ): Promise<A2uiActionReply> {
    return this.transport.request({
      method: 'POST',
      path: `${pluginPagePath(pageId)}/actions`,
      headers: A2UI_ACTION_HEADERS,
      timeoutMs: PLUGIN_SURFACE_TIMEOUT_MS,
      body: { message },
      decode: (value) => a2uiActionReplySchema.parse(value),
      signal,
    });
  }

  /**
   * The client's registry source (`docs/gact/a2ui-binding.md`, S2/S6): every
   * installed catalog, with `producible`/`file`/`instructions` scoped to this
   * session's agent.
   *
   * Decodes ROW BY ROW (`decodeA2uiCatalogRows`, S1 adversarial follow-up):
   * one malformed row (a plugin catalog with a schema drift) is
   * recorded in `rejected` and dropped, never thrown — the two BUILTIN
   * catalogs, and every other valid plugin row, still load. Only the
   * top-level shape itself failing to decode throws (a genuine
   * `decode_failed`, `web/src/lib/a2ui/registry-failure.ts`'s
   * classification).
   */
  public a2uiCatalogs(
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<A2uiCatalogListDecodeResult> {
    return this.transport.request({
      method: 'GET',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/a2ui/catalogs`,
      decode: (value) => decodeA2uiCatalogRows((value as { catalogs?: unknown }).catalogs),
      signal,
    });
  }

  /**
   * The negotiation the server itself uses to pick a catalog
   * (`docs/gact/a2ui-binding.md`): `agent.v0.9.supportedCatalogIds` is the
   * producible set, preference-ordered — the session agent's plugin
   * catalogs first, then the builtins — used to order the client's own
   * `a2uiClientCapabilities` advertisement the same way.
   */
  public a2uiCapabilities(
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<A2uiCapabilitiesResponse> {
    return this.transport.request({
      method: 'GET',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/a2ui/capabilities`,
      decode: (value) => a2uiCapabilitiesResponseSchema.parse(value),
      signal,
    });
  }

  /**
   * Resolves one CLIO content reference (`artifact:` / `resource:` / bare id)
   * a surface of `sessionId` carries. The service owns the URI grammar; the
   * reference travels verbatim as one percent-encoded query value.
   */
  public resolveA2uiReference(
    sessionId: string,
    uri: string,
    signal?: AbortSignal,
  ): Promise<A2uiReferenceResolution> {
    return resolveSessionReference(this.transport, sessionId, uri, signal);
  }

  /**
   * Reads a resolved reference's bytes through this repository's transport
   * (so a remote service receives its bearer). An artifact follows only the
   * server-authorized `custody_not_cas` redirect; every other failure stays typed.
   */
  public readA2uiReferenceBytes(
    resolution: A2uiReferenceResolution,
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    return readResolvedReferenceBytes(this.transport, resolution, signal);
  }
}
