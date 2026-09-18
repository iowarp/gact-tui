import type { ToolCatalogItem } from '@clio/core/v3';

export function CatalogToolset({ tools }: { tools: ToolCatalogItem[] }) {
  return (
    <details className="group" open>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 bg-muted/30 px-4 py-3">
        <span>
          <span className="block text-sm font-medium">Built-in CLIO tools</span>
          <span className="block text-xs text-muted-foreground">
            Files, commands, planning, memory, resources, artifacts, and agent coordination.
          </span>
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">{tools.length} tools</span>
      </summary>
      <ul className="grid border-t sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((tool) => (
          <li className="min-w-0 border-b px-4 py-2" key={tool.name}>
            <p className="truncate text-sm font-medium" title={tool.title || tool.name}>
              {tool.title || tool.name.replaceAll('_', ' ')}
            </p>
            <code className="block truncate text-[11px] text-muted-foreground" title={tool.name}>
              {tool.name}
            </code>
          </li>
        ))}
      </ul>
    </details>
  );
}
