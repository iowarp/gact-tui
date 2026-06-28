import { describe, expect, it } from 'vitest';
import { createComposerVoiceState } from '../../src/components/ComposerVoiceState.js';

function fileChangeEvent(file: File): Event {
  const input = document.createElement('input');
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [file],
  });
  return { currentTarget: input } as unknown as Event;
}

describe('createComposerVoiceState', () => {
  it('transcribes selected audio files and appends the text', async () => {
    const appended: string[] = [];
    const voice = createComposerVoiceState({
      transcribeVoice: () => async (_audio, filename) => `transcribed ${filename}`,
      appendText: (text) => appended.push(text),
    });

    await voice.onVoicePicked(fileChangeEvent(new File(['audio'], 'note.webm')));

    expect(appended).toEqual(['transcribed note.webm']);
    expect(voice.voiceBusy()).toBe(false);
  });

  it('keeps the composer usable when transcription fails', async () => {
    const appended: string[] = [];
    const voice = createComposerVoiceState({
      transcribeVoice: () => async () => {
        throw new Error('transcriber down');
      },
      appendText: (text) => appended.push(text),
    });

    await voice.onVoicePicked(fileChangeEvent(new File(['audio'], 'bad.webm')));

    expect(appended).toEqual([]);
    expect(voice.voiceBusy()).toBe(false);
  });
});
