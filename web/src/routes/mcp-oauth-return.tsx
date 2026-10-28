import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { vocab } from '@/lib/brand-vocabulary';

/** A first-party return page; the original window owns the connection and token exchange. */
export function McpOAuthReturn() {
  const delivered =
    Boolean(new URLSearchParams(location.search).get('state')) &&
    typeof BroadcastChannel !== 'undefined';
  useEffect(() => {
    if (
      !new URLSearchParams(location.search).get('state') ||
      typeof BroadcastChannel === 'undefined'
    )
      return;
    const channel = new BroadcastChannel('clio-mcp-sign-in');
    channel.postMessage({ type: 'mcp-return', callback_url: location.href });
    return () => channel.close();
  }, []);
  return (
    <main className="grid min-h-dvh place-items-center bg-background p-6 text-foreground">
      <div className="grid w-full max-w-md gap-4">
        <h1 className="text-xl font-semibold">Return to {vocab.agent}</h1>
        <p>
          {delivered
            ? `Your sign-in return was sent to the window that opened it. ${vocab.agent} will check the connection there.`
            : `Return to the ${vocab.agent} window where you started signing in. You can paste this page’s address into its sign-in form.`}
        </p>
        <Button onClick={() => window.close()}>Close this tab</Button>
      </div>
    </main>
  );
}
