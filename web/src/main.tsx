// Must stay first: records whether this device had app data before this launch.
import '@/lib/onboarding/install-snapshot';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppRouter } from '@/lib/app-router';
import './index.css';
import { AppProviders } from '@/providers/app-providers';
import { RouteErrorBoundary } from '@/components/clio/route-error-boundary';
import { RevealDesktopWindow } from '@/components/clio/reveal-desktop-window';
import { removeLegacyCredentialStorage } from '@/lib/legacy-credential-storage';
import { holdModalBodyPointerEvents } from '@/components/ui/overlay-container';
import { loadRouteChunk, routeChunkForPath } from '@/lib/route-chunks';
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

// The desktop window is revealed on the first commit (#739 B2). If the opening
// route is still loading, that commit is the route skeleton and the page swaps
// in a frame later, which reads as a flicker. Load it before the first render.
const openingPath = window.location.pathname;
const openingRoute = openingPath === '/' ? 'connection' : routeChunkForPath(openingPath);
const openingRouteLoaded = openingRoute
  ? loadRouteChunk(openingRoute).catch(() => undefined)
  : Promise.resolve();

void openingRouteLoaded.then(() => {
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
  // The connect screen moves on to a conversation once it reconnects: fetch
  // that page while the connection resolves rather than after it.
  if (openingRoute === 'connection') void loadRouteChunk('workspace').catch(() => undefined);
});
