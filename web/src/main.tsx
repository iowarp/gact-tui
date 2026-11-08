import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import { AppProviders } from '@/providers/app-providers';
import { RouteErrorBoundary } from '@/components/clio/route-error-boundary';
import { RevealDesktopWindow } from '@/components/clio/reveal-desktop-window';
import { removeLegacyCredentialStorage } from '@/lib/legacy-credential-storage';
import { holdModalBodyPointerEvents } from '@/components/ui/overlay-container';

holdModalBodyPointerEvents();

try {
  removeLegacyCredentialStorage(window.localStorage);
} catch (error) {
  // Storage can be unavailable (a locked-down browser profile); the app runs
  // without it, and there is then nothing on disk to remove.
  console.warn('Could not clear legacy credential storage', error);
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
