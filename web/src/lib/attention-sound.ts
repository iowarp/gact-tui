type AudioContextConstructor = new () => AudioContext;

/** Plays a short two-note attention chime when Web Audio is available. */
export async function playAttentionSound(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const AudioContextClass =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;
  if (!AudioContextClass) return false;

  try {
    const context = new AudioContextClass();
    if (context.state === 'suspended') await context.resume();
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
    return true;
  } catch {
    return false;
  }
}
