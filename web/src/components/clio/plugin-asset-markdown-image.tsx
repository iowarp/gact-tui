import { useContext } from 'react';
import { A2uiReferenceSessionProvider } from '@/lib/a2ui/reference-session';
import { useA2uiReference } from '@/lib/a2ui/use-a2ui-reference';
import { PresentationNavigation } from './presentation-navigation';
import { t, ph } from '@lingui/core/macro';

/**
 * A Markdown image naming a file a plugin of this conversation bundles
 * (`plugin-asset://<plugin>/<path>`, such as the guide's screenshots): resolved
 * by the service for this conversation and read through the authenticated
 * transport, like any other CLIO reference. Works offline: nothing is fetched
 * from the web.
 */
export function PluginAssetMarkdownImage({ uri, alt }: { uri: string; alt?: string }) {
  const navigation = useContext(PresentationNavigation);
  return (
    <A2uiReferenceSessionProvider value={navigation?.sessionId}>
      <PluginAssetImage alt={alt ?? ''} uri={uri} />
    </A2uiReferenceSessionProvider>
  );
}

function PluginAssetImage({ uri, alt }: { uri: string; alt: string }) {
  const state = useA2uiReference(uri);
  if (state.failure) {
    return (
      <span className="text-xs text-muted-foreground" role="note">
        {t`Picture unavailable: ${ph({ alt })}`}
      </span>
    );
  }
  return (
    <span className="block" data-slot="plugin-asset-image">
      {state.objectUrl ? (
        <img
          alt={alt}
          className="max-h-96 w-full rounded-md border object-contain"
          src={state.objectUrl}
        />
      ) : (
        <span className="text-xs text-muted-foreground">{t`Loading picture…`}</span>
      )}
    </span>
  );
}
