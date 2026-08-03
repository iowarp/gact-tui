import { inTauri } from '../tauri/tauri';

/**
 * Desktop capability gate.
 *
 * In the prototype exactly ONE surface is gated on `isDesktop`: the workspace
 * console (its header button, its panel, and the ⌃` keybind). Everything else
 * in that toolbar — artifacts, context/telemetry, observability — renders in
 * the browser too.
 *
 * So this is a per-SURFACE capability, never a shell-level one. Do not use it
 * to hide chrome that the web build is entitled to.
 */
export function useIsDesktop(): boolean {
  // `inTauri()` reads synchronous globals injected by the shell before any
  // script runs, so there is no async settling to model here.
  return inTauri();
}
