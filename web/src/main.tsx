import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App.tsx';
import { AppProviders } from '@/providers/app-providers';
import { AppErrorBoundary } from '@/components/clio/app-error-boundary';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AppProviders>
        <AppErrorBoundary>
          <App />
        </AppErrorBoundary>
      </AppProviders>
    </BrowserRouter>
  </StrictMode>,
);
