import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';

/** The desktop host's boot log, the last 6000 characters, re-read every second while running. */
export function useStartupLog(enabled: boolean, running: boolean): string {
  const [log, setLog] = useState('');
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let reading = false;
    const read = async () => {
      if (reading) return;
      reading = true;
      try {
        const text = await invoke<string>('read_logs');
        if (!disposed) setLog(text.slice(-6000));
      } catch {
        // A missing boot log must not replace the supervisor's real failure.
      } finally {
        reading = false;
      }
    };
    void read();
    const timer = running ? window.setInterval(() => void read(), 1000) : undefined;
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [enabled, running]);
  return log;
}
