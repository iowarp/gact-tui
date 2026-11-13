import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { vocab } from '@/lib/brand-vocabulary';
import { t } from '@lingui/core/macro';

/** A first-party return page; the original window owns the connection and token exchange. */
export function McpOAuthReturn() {
  const { agent } = vocab;
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
        <h1 className="text-xl font-semibold">{t`Return to ${agent}`}</h1>
        <p>
          {delivered
            ? t`Your sign-in return was sent to the window that opened it. ${agent} will check the connection there.`
            : t`Return to the ${agent} window where you started signing in. You can paste this page’s address into its sign-in form.`}
        </p>
        <Button onClick={() => window.close()}>{t`Close this tab`}</Button>
      </div>
    </main>
  );
}
