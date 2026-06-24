/**
 * State container for Composer Voice.
 */
import { createSignal } from 'solid-js';

export interface ComposerVoiceStateOptions {
  transcribeVoice: () => ((audio: Blob, filename: string) => Promise<string>) | undefined;
  appendText: (text: string) => void;
}

export function createComposerVoiceState(options: ComposerVoiceStateOptions) {
  const [voiceBusy, setVoiceBusy] = createSignal(false);
  const [recording, setRecording] = createSignal(false);
  const [recordingElapsedMs, setRecordingElapsedMs] = createSignal(0);
  let voiceInputRef: HTMLInputElement | undefined;
  let mediaRecorder: MediaRecorder | null = null;
  let recordedChunks: Blob[] = [];
  let recordingTimer: ReturnType<typeof setInterval> | undefined;

  async function onVoicePicked(ev: Event) {
    const inp = ev.currentTarget as HTMLInputElement;
    const file = inp.files?.[0];
    inp.value = '';
    const transcribe = options.transcribeVoice();
    if (!file || !transcribe) return;
    setVoiceBusy(true);
    try {
      options.appendText(await transcribe(file, file.name));
    } catch {
      // Surfaced via toast upstream — composer stays usable.
    } finally {
      setVoiceBusy(false);
    }
  }

  async function toggleMicRecording() {
    const transcribe = options.transcribeVoice();
    if (!transcribe) return;
    if (recording()) {
      mediaRecorder?.stop();
      return;
    }
    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices) return;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordedChunks = [];
      const rec = new MediaRecorder(stream);
      mediaRecorder = rec;
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunks.push(e.data);
      };
      rec.onstop = () => {
        setRecording(false);
        if (recordingTimer) {
          clearInterval(recordingTimer);
          recordingTimer = undefined;
        }
        setRecordingElapsedMs(0);
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(recordedChunks, { type: 'audio/webm' });
        recordedChunks = [];
        const nextTranscribe = options.transcribeVoice();
        if (!nextTranscribe || blob.size === 0) return;
        setVoiceBusy(true);
        void nextTranscribe(blob, 'mic.webm')
          .then(options.appendText)
          .catch(() => {
            /* surfaced upstream */
          })
          .finally(() => setVoiceBusy(false));
      };
      rec.start();
      setRecording(true);
      const startedAt = Date.now();
      recordingTimer = setInterval(() => {
        setRecordingElapsedMs(Date.now() - startedAt);
      }, 250);
    } catch {
      setRecording(false);
    }
  }

  return {
    voiceBusy,
    recording,
    recordingElapsedMs,
    setVoiceInputRef: (el: HTMLInputElement) => {
      voiceInputRef = el;
    },
    openVoiceFilePicker: () => voiceInputRef?.click(),
    onVoicePicked,
    toggleMicRecording,
  };
}
