import { useMemo } from 'react';
import { useConnectors } from '@/hooks/use-connectors';
import { usePluginCatalog } from '@/hooks/use-session-agent';
import { pluginKindResolver, pluginNameResolver, type PluginKind } from '@/lib/plugin-presentation';

/**
 * How the person reads a plugin id (FP-D5, PL-D1): its name (a connector's plugin or
 * carrier by its connector, any other id as words) and whether it is a connector or a
 * plugin. Never `connector-<id>`. `fallback` reads any other id (words by default; the
 * plugin tree keeps ids, as its rows show them).
 */
export function usePluginNames(fallback?: (id: string) => string): {
  nameOf: (id: string) => string;
  kindOf: (id: string) => PluginKind;
} {
  const connectors = useConnectors();
  const plugins = usePluginCatalog();
  return useMemo(
    () => ({
      nameOf: pluginNameResolver(plugins.data?.plugins, connectors.data, fallback),
      kindOf: pluginKindResolver(plugins.data?.plugins, connectors.data),
    }),
    [plugins.data, connectors.data, fallback],
  );
}
