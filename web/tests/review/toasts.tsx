import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { toast } from 'sonner';
import '../../src/index.css';
import { AppearanceProvider } from '../../src/providers/appearance-provider';
import { Toaster } from '../../src/components/ui/sonner';
import { APPEARANCE_STORAGE_KEY } from '../../src/theme/preference';

// The production Toaster with the spec's toasts (conversation-states.html, "Toasts").
// ?state=<name>&theme=dark|light. Messages and options follow the app's own calls.

const noop = () => {};
const persistent = { duration: Number.POSITIVE_INFINITY };

const STATES: Record<string, { spec: string; show: () => void }> = {
  stack: {
    spec: 'Toasts',
    show: () => {
      toast.error('Could not open reference', {
        ...persistent,
        action: { label: 'Retry', onClick: noop },
      });
      toast.success('Conversation compacted', persistent);
      toast.success('Conversation archived', {
        ...persistent,
        action: { label: 'Undo', onClick: noop },
      });
    },
  },
  info: {
    spec: 'Toasts',
    show: () => {
      toast.info('CLIO updated to 0.11.4', {
        ...persistent,
        action: { label: 'What’s new', onClick: noop },
      });
      toast.info('Export ready', {
        ...persistent,
        action: { label: 'Download', onClick: noop },
      });
    },
  },
  detail: {
    spec: 'Toasts',
    show: () => {
      toast.loading('Exporting conversation', persistent);
      toast.warning('Context controls could not be updated', {
        ...persistent,
        description: 'The session restarted before the change was saved. Try again.',
      });
      toast.error(
        'Could not open the workspace terminal for sensor-field-review-calibration-records-final',
        {
          ...persistent,
          description: 'The terminal service is not running on this host.',
          action: { label: 'Retry', onClick: noop },
        },
      );
    },
  },
};

const params = new URLSearchParams(location.search);
const state = STATES[params.get('state') ?? 'stack'] ?? STATES.stack;
window.localStorage.setItem(
  APPEARANCE_STORAGE_KEY,
  JSON.stringify({ theme: params.get('theme') === 'light' ? 'light' : 'dark' }),
);

function Review() {
  useEffect(() => {
    state.show();
    const root = document.documentElement.dataset;
    root.reviewStates = Object.keys(STATES).join(',');
    root.reviewSpec = state.spec;
    const timer = window.setTimeout(() => {
      root.reviewReady = 'true';
    }, 700);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <main className="flex h-dvh flex-col bg-background text-foreground">
      <header className="flex h-10 shrink-0 items-center border-b border-border px-4 text-[13px] font-medium">
        Regrid SMAP L3 for the Opal sites
      </header>
      <div className="mx-auto w-full max-w-4xl flex-1 space-y-4 px-6 py-6 text-[14px] leading-6">
        <p>
          I found 1,462 SMAP L3 granules for the Opal region and regridded them to the field-probe
          grid.
        </p>
      </div>
      <Toaster />
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <AppearanceProvider>
    <Review />
  </AppearanceProvider>,
);
