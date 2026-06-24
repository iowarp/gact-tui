import {
  synthesizeSessionVoice,
  transcribeSessionVoice,
  type VoiceTranscriptionResult,
} from './session_voice.js';
import { sessionSseUrl } from './sse.js';
import { SessionOperationsClient } from './session_operations_client.js';
export { HttpError, type ClientOptions } from './transport.js';
export type { HookEvent, HookRow } from './hooks.js';

/**
 * Minimal HTTP client for GACT v0.2. The harness build only needs enough surface
 * for the connect screen, sidebar, and transcript shells; richer endpoints land
 * as PLAN.md items.
 */
export class Client extends SessionOperationsClient {
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
}
