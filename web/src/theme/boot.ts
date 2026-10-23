// The pre-paint boot script: `vite-plugin-theme.ts` builds this file as a classic
// script and loads it at the top of <head>, so the stored theme is on <html>
// before the first frame and there is no flash of another theme.
import { applyStoredTheme } from './preference';

applyStoredTheme();
