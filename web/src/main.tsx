import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import { AppProviders } from '@/providers/app-providers';
import { RouteErrorBoundary } from '@/components/clio/route-error-boundary';
import { removeLegacyCredentialStorage } from '@/lib/legacy-credential-storage';
import { holdModalBodyPointerEvents } from '@/components/ui/overlay-container';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { revealStartupWindow } from '@/tauri/desktop-window';

holdModalBodyPointerEvents();

try {
  removeLegacyCredentialStorage(window.localStorage);
} catch (error) {
  // Storage can be unavailable (a locked-down browser profile); the app runs
  // without it, and there is then nothing on disk to remove.
  console.warn('Could not clear legacy credential storage', error);
}

// The desktop window stays hidden until the first committed frame (#739).
function RevealDesktopWindow() {
  useEffect(() => {
    if (inTauri()) void revealStartupWindow().catch(() => undefined);
  }, []);
  return null;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RevealDesktopWindow />
    <BrowserRouter>
      <AppProviders>
        <RouteErrorBoundary />
      </AppProviders>
    </BrowserRouter>
  </StrictMode>,
);
