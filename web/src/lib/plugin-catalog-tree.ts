import { pluginReferenceId, type PluginEntry } from '@clio/core/v3';

/** Match pack members within their marketplace; ambiguous short names stay unresolved. */
export function catalogMember(
  plugins: readonly PluginEntry[],
  pack: PluginEntry,
  ref: string,
): PluginEntry | undefined {
  const name = ref.split('@')[0]!;
  const candidates = plugins.filter((p) => p.id === pluginReferenceId(ref));
  const qualified = name.includes('/') ? name : `${pack.marketplace}/${name}`;
  const exact = candidates.filter((p) => p.ref === qualified);
  return (
    exact.find((p) => p.pending_trust === pack.pending_trust) ??
    exact[0] ??
    (candidates.length === 1 ? candidates[0] : undefined)
  );
}

/** Search an entry's own identity and capabilities, independent of pack membership. */
export function catalogOwnMatches(plugin: PluginEntry, term: string): boolean {
  return (
    !term ||
    [
      plugin.id,
      plugin.ref,
      plugin.description,
      plugin.marketplace,
      ...plugin.tools,
      ...plugin.skills,
      ...plugin.fragments,
      ...plugin.flows,
      ...plugin.subagents,
      ...plugin.commands,
      ...plugin.hooks,
      ...plugin.mcp_servers,
      ...plugin.catalogs,
    ].some((text) => text.toLocaleLowerCase().includes(term))
  );
}

/** Keep pack ancestry in filtered results and terminate malformed membership cycles. */
export function catalogMatches(
  plugins: readonly PluginEntry[],
  plugin: PluginEntry,
  term: string,
  seen = new Set<string>(),
): boolean {
  if (seen.has(plugin.ref)) return false;
  if (catalogOwnMatches(plugin, term)) return true;
  const next = new Set(seen).add(plugin.ref);
  return plugin.members.some((ref) => {
    const child = catalogMember(plugins, plugin, ref);
    return (
      ref.toLocaleLowerCase().includes(term) ||
      (child ? catalogMatches(plugins, child, term, next) : false)
    );
  });
}

/** Pack members appear below their packs; cyclic/orphaned records remain reachable. */
export function catalogRoots(plugins: readonly PluginEntry[]): PluginEntry[] {
  const nested = new Set<PluginEntry>();
  for (const pack of plugins.filter((p) => p.kind === 'pack'))
    for (const ref of pack.members) {
      const member = catalogMember(plugins, pack, ref);
      if (member && member !== pack) nested.add(member);
    }
  const roots = plugins.filter((p) => !nested.has(p));
  const visited = new Set<PluginEntry>();
  const visit = (p: PluginEntry) => {
    if (visited.has(p)) return;
    visited.add(p);
    for (const ref of p.members) {
      const child = catalogMember(plugins, p, ref);
      if (child) visit(child);
    }
  };
  roots.forEach(visit);
  for (const plugin of plugins)
    if (!visited.has(plugin)) {
      roots.push(plugin);
      visit(plugin);
    }
  return roots;
}
