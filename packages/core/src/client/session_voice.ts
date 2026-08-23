import { HttpError, type HttpTransport } from './transport.js';

type SessionVoiceTransport = Pick<HttpTransport, 'response'>;

export interface VoiceTranscriptionResult {
  text: string;
  duration_ms?: number;
}

export async function transcribeSessionVoice(
  client: SessionVoiceTransport,
  sessionId: string,
  audio: Blob,
  filename = 'voice.webm',
): Promise<VoiceTranscriptionResult> {
  const fd = new FormData();
  fd.append('audio', audio, filename);
  // Don't set Content-Type; the browser sets the multipart boundary.
  const res = await client.response(
    `/v1/sessions/${encodeURIComponent(sessionId)}/voice/transcribe`,
    { method: 'POST', body: fd },
  );
  if (!res.ok) {
    throw new HttpError(res.status, res.statusText, await res.text());
  }
  return (await res.json()) as VoiceTranscriptionResult;
}

export async function synthesizeSessionVoice(
  client: SessionVoiceTransport,
  sessionId: string,
  text: string,
): Promise<Blob> {
  const res = await client.response(
    `/v1/sessions/${encodeURIComponent(sessionId)}/voice/synthesize`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    },
  );
  if (!res.ok) {
    throw new HttpError(res.status, res.statusText, await res.text());
  }
  return await res.blob();
}
