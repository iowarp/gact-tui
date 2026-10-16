import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import '../../src/index.css';
import { SshHostsManagerDialog } from '../../src/components/clio/ssh-hosts-manager-dialog';
import { SshHostPicker } from '../../src/components/clio/ssh-host-picker';
import { Button } from '../../src/components/ui/button';
import { sshHostUsesProfile, type SshHost } from '../../src/lib/ssh-hosts';

// Test-only transport adapter. Profile data and mutations come from the real
// native Rust owners over localhost, confined to a new acceptance directory.
Object.assign(window, {
  __TAURI_INTERNALS__: {
    invoke: async (command: string, args: unknown) => {
      const response = await fetch('http://127.0.0.1:8200/invoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, args }),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error);
      return value;
    },
  },
});

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function Review() {
  const [open, setOpen] = useState(true);
  const [host, setHost] = useState<SshHost>();
  return (
    <main className="min-h-dvh bg-background p-8 text-foreground">
      <h1 className="text-xl font-medium">SSH host actions</h1>
      <p className="my-4 text-sm text-muted-foreground">
        Production host manager and picker using native Rust profile storage. All changes are
        confined to isolated acceptance files.
      </p>
      <div className="grid max-w-xl gap-4">
        <Button className="w-fit" variant="outline" onClick={() => setOpen(true)}>
          Manage SSH hosts
        </Button>
        <SshHostPicker value={host} onChange={setHost} />
      </div>
      <SshHostsManagerDialog
        open={open}
        onOpenChange={setOpen}
        onRemoved={(profile) => {
          if (sshHostUsesProfile(host, profile)) setHost(undefined);
        }}
      />
    </main>
  );
}
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <ThemeProvider attribute="class" forcedTheme="light" enableSystem={false}>
      <Review />
    </ThemeProvider>
  </QueryClientProvider>,
);
