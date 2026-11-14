import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import type { DiscoverItem, useDiscoverItems } from './extension-discover';
import { ItemList } from './primitives/item-row';
import { StateView } from './primitives/state-view';
import { SettingsGroupLabel } from './settings-row';
import { t } from '@lingui/core/macro';

/** The MCP Registry's servers in Discover, with paging (public metadata only). */
export function McpRegistrySection({
  registry,
  items,
  renderItem,
  cursor,
  onCursor,
}: {
  registry: ReturnType<typeof useDiscoverItems>['registry'];
  items: DiscoverItem[];
  renderItem: (item: DiscoverItem) => ReactNode;
  cursor: string;
  onCursor: (cursor: string) => void;
}) {
  return (
    <section aria-label={t`MCP Registry`}>
      <SettingsGroupLabel>{t`MCP Registry`}</SettingsGroupLabel>
      {registry.isPending ? (
        <StateView kind="loading" size="row" title={t`Searching the MCP Registry…`} />
      ) : null}
      {registry.error ? (
        <div title={registry.error.message}>
          <StateView
            action={{ label: t`Retry`, onClick: () => void registry.refetch() }}
            kind="error"
            size="row"
            title={t`The MCP Registry couldn’t be searched.`}
          />
        </div>
      ) : null}
      {items.length ? (
        <ItemList label={t`MCP Registry servers`}>{items.map(renderItem)}</ItemList>
      ) : null}
      {registry.data && !registry.data.servers.length ? (
        <StateView kind="empty" size="row" title={t`No servers match.`} />
      ) : null}
      <div className="mt-2 flex items-center gap-2">
        {registry.data?.next_cursor ? (
          <Button onClick={() => onCursor(registry.data!.next_cursor)} size="sm" variant="outline">
            {t`Next page`}
          </Button>
        ) : null}
        {cursor ? (
          <Button onClick={() => onCursor('')} size="sm" variant="ghost">
            {t`Back to first page`}
          </Button>
        ) : null}
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {t`Public server metadata. Browsing starts no servers.`}
        </span>
      </div>
    </section>
  );
}
