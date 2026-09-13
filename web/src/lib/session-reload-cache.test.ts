import { beforeEach, describe, expect, it } from 'vitest';
import type { Message, TranscriptSnapshot } from '@clio/core/v3';
import { readReloadSessions, readReloadTranscript, writeReloadTranscript } from './session-reload-cache';

const ENDPOINT = 'http://127.0.0.1:8787';

beforeEach(() => window.sessionStorage.clear());

describe('session reload cache', () => {
  it('keeps only the recent complete transcript tail', () => {
    const messages: Message[] = Array.from({ length: 20 }, (_, index) => ({
      id: `message_${index}`,
      session_id: 'sess_1',
      role: index % 2 === 0 ? 'user' : 'assistant',
      created_at: `2026-09-12T12:${String(index).padStart(2, '0')}:00Z`,
      blocks: [{ id: `text_${index}`, type: 'text', text: `Message ${index}` }],
    }));
    const transcript: TranscriptSnapshot = {
      cursor: '42',
      messages,
      tools: [],
      tasks: [],
      subagents: [],
      artifacts: [],
      surfaces: [],
    };

    writeReloadTranscript(ENDPOINT, 'sess_1', transcript);

    expect(readReloadTranscript(ENDPOINT, 'sess_1')?.messages.map(({ id }) => id)).toEqual(
      messages.slice(-16).map(({ id }) => id),
    );
  });

  it('drops invalid tab data instead of blocking authoritative reads', () => {
    const key = `clio.reload.v1:${encodeURIComponent(ENDPOINT)}:sessions:${encodeURIComponent('ws_1')}`;
    window.sessionStorage.setItem(key, '{"not":"sessions"}');

    expect(readReloadSessions(ENDPOINT, 'ws_1')).toBeUndefined();
    expect(window.sessionStorage.getItem(key)).toBeNull();
  });
});
