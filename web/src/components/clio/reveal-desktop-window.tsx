import { useEffect } from 'react';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { revealStartupWindow } from '@/tauri/desktop-window';

/** The desktop window stays hidden until the first committed frame (#739 B2). */
export function RevealDesktopWindow() {
  useEffect(() => {
    if (inTauri()) void revealStartupWindow().catch(() => undefined);
  }, []);
  return null;
}
