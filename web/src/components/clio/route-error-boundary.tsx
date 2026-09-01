import { useLocation } from 'react-router-dom';
import App from '@/App';
import { AppErrorBoundary } from './app-error-boundary';

/** Resets a failed route when the user deliberately navigates elsewhere. */
export function RouteErrorBoundary() {
  const location = useLocation();
  const resetKey = `${location.pathname}${location.search}`;
  return (
    <AppErrorBoundary key={resetKey}>
      <App />
    </AppErrorBoundary>
  );
}
