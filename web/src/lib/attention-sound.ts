type AudioContextConstructor = new () => AudioContext;

/**
 * How long `context.resume()` is given before it is treated as blocked by the
 * browser's autoplay policy. Local to this module rather than
 * `runtime-limits.ts`: it tunes one library call's failure mode, not a
 * cross-surface freshness/volume trade-off. Short, because without a prior
 * user gesture the promise can otherwise hang indefinitely, leaking a live
 * (never-resumed) `AudioContext` per missed chime — worst in the default
 * background notification mode, where this fires unattended.
 */
const RESUME_TIMEOUT_MS = 300;

/** Plays a short two-note attention chime when Web Audio is available. */
export async function playAttentionSound(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const AudioContextClass =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;
  if (!AudioContextClass) return false;

  let context: AudioContext | undefined;
  try {
    context = new AudioContextClass();
    if (context.state === 'suspended' && !(await raceResume(context, RESUME_TIMEOUT_MS))) {
      await context.close();
      return false;
    }
    playChime(context);
    return true;
  } catch {
    await context?.close().catch(() => undefined);
    return false;
  }
}

function playChime(context: AudioContext): void {
  const notes = [659.25, 783.99];
  notes.forEach((frequency, index) => {
    const start = context.currentTime + index * 0.12;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.08, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.18);
    if (index === notes.length - 1) {
      oscillator.addEventListener('ended', () => void context.close(), { once: true });
    }
  });
}

/**
 * Resolves `true` once `context.resume()` settles, or `false` once
 * `timeoutMs` elapses first — so a resume the autoplay policy is holding
 * pending never blocks the caller forever.
 */
function raceResume(context: AudioContext, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(false);
    }, timeoutMs);
    context.resume().then(
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(true);
      },
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(false);
      },
    );
  });
}
