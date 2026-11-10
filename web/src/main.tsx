import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppRouter } from '@/lib/app-router';
import './index.css';
import { AppProviders } from '@/providers/app-providers';
import { RouteErrorBoundary } from '@/components/clio/route-error-boundary';
import { RevealDesktopWindow } from '@/components/clio/reveal-desktop-window';
import { removeLegacyCredentialStorage } from '@/lib/legacy-credential-storage';
import { holdModalBodyPointerEvents } from '@/components/ui/overlay-container';
import { wrapOptionTabInModals } from '@/components/ui/modal-focus';

holdModalBodyPointerEvents();
wrapOptionTabInModals();

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
    <AppRouter>
      <AppProviders>
        <RouteErrorBoundary />
      </AppProviders>
    </AppRouter>
  </StrictMode>,
);
