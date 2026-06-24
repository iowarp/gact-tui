/**
 * UI component: Composer Voice Controls. Renders `ComposerVoiceControls` from `ComposerVoiceControlsProps`.
 */
import { Show } from 'solid-js';
import { Icon } from './Icon.js';

export interface ComposerVoiceControlsProps {
  voiceBusy: boolean;
  recording: boolean;
  recordingElapsedMs: number;
  onToggleMicRecording: () => void;
  onUploadAudio: () => void;
}

export function ComposerVoiceControls(props: ComposerVoiceControlsProps) {
  const elapsedSeconds = () => Math.floor(props.recordingElapsedMs / 1000);

  return (
    <>
      <button
        type="button"
        class={'composer__attach ' + (props.recording ? 'is-recording' : '')}
        title={
          props.recording
            ? `Recording ${elapsedSeconds()}s — click to stop`
            : props.voiceBusy
              ? 'Transcribing…'
              : 'Record voice — click again to stop'
        }
        aria-label="Record voice"
        data-testid="composer-mic"
        onClick={props.onToggleMicRecording}
        disabled={props.voiceBusy && !props.recording}
      >
        <Icon name={props.recording ? 'stop' : 'mic'} size={16} />
      </button>
      <Show when={props.recording}>
        <span class="composer__mic-elapsed" data-testid="composer-mic-elapsed" aria-live="polite">
          {elapsedSeconds()}s
        </span>
      </Show>
      <button
        type="button"
        class="composer__attach"
        title="Upload audio file for transcription"
        aria-label="Upload audio file"
        data-testid="composer-voice"
        onClick={props.onUploadAudio}
        disabled={props.voiceBusy || props.recording}
      >
        <Icon name="audio" size={14} />
      </button>
    </>
  );
}
