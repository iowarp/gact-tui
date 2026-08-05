import { fetchArtifactExport, type ArtifactExportResult } from './artifact_export.js';
import {
  synthesizeSessionVoice,
  transcribeSessionVoice,
  type VoiceTranscriptionResult,
} from './session_voice.js';
import { sessionSseUrl } from './sse.js';
import { SessionOperationsClient } from './session_operations_client.js';
import {
  callMcpAppTool,
  closeMcpApp,
  fetchMcpApp,
  postMcpAppMessage,
  readMcpAppResource,
  updateMcpAppModelContext,
  type McpAppPayload,
  type McpAppRef,
  type McpCallToolResult,
  type McpReadResourceResult,
} from './mcp_apps.js';
export { HttpError, TransportTimeoutError, type ClientOptions } from './transport.js';
export type { HookEvent, HookRow } from './hooks.js';

/**
 * Minimal HTTP client for GACT v0.2. The harness build only needs enough surface
 * for the connect screen, sidebar, and transcript shells; richer endpoints land
 * as PLAN.md items.
 */
export class Client extends SessionOperationsClient {
  /** Resolve one capability-bound MCP App payload. */
  mcpApp(ref: McpAppRef): Promise<McpAppPayload> {
    return fetchMcpApp(this, ref);
  }

  /** Call an app-visible tool through the originating MCP namespace. */
  callMcpAppTool(
    ref: McpAppRef,
    body: { name: string; arguments?: Record<string, unknown> },
  ): Promise<McpCallToolResult> {
    return callMcpAppTool(this, ref, body);
  }

  /** Read a resource from the App's exact originating MCP namespace. */
  readMcpAppResource(ref: McpAppRef, uri: string): Promise<McpReadResourceResult> {
    return readMcpAppResource(this, ref, uri);
  }

  /** Replace the ephemeral model context advertised by an App. */
  updateMcpAppModelContext(
    ref: McpAppRef,
    context: Record<string, unknown>,
  ): Promise<Record<string, never>> {
    return updateMcpAppModelContext(this, ref, context);
  }

  /** Submit a user-role App message through the existing session turn path. */
  postMcpAppMessage(
    ref: McpAppRef,
    message: Record<string, unknown>,
  ): Promise<{ message_id: string }> {
    return postMcpAppMessage(this, ref, message);
  }

  /** Release a private App record and run its declared cleanup call. */
  closeMcpApp(ref: McpAppRef): Promise<void> {
    return closeMcpApp(this, ref);
  }

  /**
   * POST /v1/sessions/{id}/voice/transcribe — multipart upload of an
   * audio blob; backend returns the transcribed text. Mirrors the
   * TUI's Ctrl+Y flow, but the desktop surfaces this as a file
   * picker since we don't ship a mic recorder yet.
   */
  async transcribeVoice(
    sessionId: string,
    audio: Blob,
    filename = 'voice.webm',
  ): Promise<VoiceTranscriptionResult> {
    return transcribeSessionVoice(this, sessionId, audio, filename);
  }

  /**
   * POST /v1/sessions/{id}/voice/synthesize — requests TTS audio for
   * a piece of text. Returns the raw `audio/*` bytes as a Blob so the
   * caller can hand it to an HTMLAudioElement.
   */
  async synthesizeVoice(sessionId: string, text: string): Promise<Blob> {
    return synthesizeSessionVoice(this, sessionId, text);
  }

  /**
   * Build an SSE URL with the bearer token in the query string. `EventSource`
   * cannot set custom headers, so we fall back to `?auth_token=` per SPEC §7.
   */
  sseUrl(sessionId: string): string {
    return sessionSseUrl(this.baseUrl, sessionId, this.options.bearerToken);
  }

  /**
   * GET /v1/artifacts/{artifact_id}/export — download one artifact's
   * RO-Crate lineage bundle (clio-agent #973). Returns the raw zip bytes
   * plus the backend-proposed filename so the caller can trigger a real
   * browser download (the detail slot's Download menu).
   */
  async exportArtifact(artifactId: string): Promise<ArtifactExportResult> {
    return fetchArtifactExport(this, artifactId);
  }
}
