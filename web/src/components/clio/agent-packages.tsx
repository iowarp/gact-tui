import type { AgentDelta, AgentResolution, PluginEntry, ResolvedPlugin } from '@clio/core/v3';
import { BoxesIcon, EyeIcon, PackageIcon } from 'lucide-react';

import { useMemo, type KeyboardEvent, type MouseEvent } from 'react';
import { Button } from '@/components/ui/button';
import { AddIcon, RemoveIcon } from '@/lib/icon-vocabulary';
import {
  capabilitySummary,
  packMembersLabel,
  pluginContributions,
  provenanceDetail,
  provenanceLabel,
} from '@/lib/plugin-presentation';
import { AgentPluginMenu } from './agent-plugin-menu';
import { PackageItemRow } from './agent-package-item-row';
import {
  bringsLabel,
  countOf,
  noneBringsLabel,
  packageCategoryLabel,
  packageItems,
  presentCategories,
  type PackageCategory,
  type PackageItem,
  type PackageItems,
} from './agent-package-items';
import { IconButton } from './primitives/icon-button';
import { ItemList, ItemRow } from './primitives/item-row';
import { AgentPackageFilter } from './agent-package-filter';
import { StateView } from './primitives/state-view';
import { SettingsGroupLabel } from './settings-row';
import { t, ph } from '@lingui/core/macro';

/** Which category the list shows and which package is open; kept by the host across item details. */
export interface AgentPackagesView {
  category: PackageCategory | 'all';
  open?: string;
}

export interface AgentPackagesProps {
  resolution: AgentResolution;
  delta: AgentDelta;
  readOnly: boolean;
  pending: boolean;
  plugins?: readonly PluginEntry[];
  pluginsError?: string;
  view: AgentPackagesView;
  onViewChange: (view: AgentPackagesView) => void;
  onAdd: (plugin: string) => void;
  onRemove: (plugin: string) => void;
  /** Open the package itself: its files, which it can edit as a local copy. */
  onExplore: (plugin: ResolvedPlugin) => void;
  onOpenItem: (item: PackageItem) => void;
}

/**
 * The packages an agent is built from, first and always in view: one row each
 * with what it brings, explore and remove, and Add package. A category filter
 * keeps the packages that bring that kind of thing; opening a package lists
 * only what it brings in that category, each item opening its own details.
 */
export function AgentPackages({
  resolution,
  delta,
  readOnly,
  pending,
  plugins,
  pluginsError,
  view,
  onViewChange,
  onAdd,
  onRemove,
  onExplore,
  onOpenItem,
}: AgentPackagesProps) {
  const byPlugin = useMemo(
    () =>
      new Map(resolution.plugins.map((plugin) => [plugin.id, packageItems(resolution, plugin.id)])),
    [resolution],
  );
  const categories = presentCategories(byPlugin);
  const category =
    view.category !== 'all' && categories.some((info) => info.value === view.category)
      ? view.category
      : 'all';
  const activeMembers = (plugin: ResolvedPlugin) =>
    plugin.members.filter((member) => byPlugin.has(member)).length;
  const shown = resolution.plugins.filter(
    (plugin) => category === 'all' || (byPlugin.get(plugin.id)?.[category].length ?? 0) > 0,
  );
  const toggle = (id: string) =>
    onViewChange({ category, open: view.open === id ? undefined : id });
  return (
    <section aria-labelledby="agent-packages" className="min-w-0 px-3.5">
      <SettingsGroupLabel
        actions={
          readOnly ? undefined : (
            <AgentPluginMenu
              delta={delta}
              disabled={pending}
              onAdd={onAdd}
              plugins={plugins}
              pluginsError={pluginsError}
              resolution={resolution}
            >
              <Button className="shrink-0" size="xs" variant="outline">
                <AddIcon aria-hidden="true" /> {t`Add package`}
              </Button>
            </AgentPluginMenu>
          )
        }
        className="mt-1"
        info={t`The packages this agent is built from. Each brings tools, subagents, skills or prompt parts; add, remove or open one here.`}
      >
        <span id="agent-packages">{t`Packages`}</span>
      </SettingsGroupLabel>
      {categories.length ? (
        <AgentPackageFilter
          categories={categories}
          onValueChange={(value) => onViewChange({ category: value, open: view.open })}
          value={category}
        />
      ) : null}
      <ItemList label={t`Packages`}>
        {shown.length === 0 ? (
          <StateView
            kind="empty"
            size="row"
            title={
              category === 'all' ? t`This agent has no packages yet.` : noneBringsLabel(category)
            }
          />
        ) : null}
        {shown.map((plugin) => {
          const items = byPlugin.get(plugin.id)!;
          const open = view.open === plugin.id;
          return (
            <div key={plugin.id}>
              <PackageRow
                category={category}
                items={items}
                meta={
                  category !== 'all'
                    ? countOf(category, items[category].length)
                    : plugin.kind === 'pack'
                      ? packMembersLabel(plugin.members.length, activeMembers(plugin))
                      : capabilitySummary(pluginContributions(resolution, plugin.id))
                }
                onExplore={() => onExplore(plugin)}
                onRemove={readOnly || !plugin.removable ? undefined : () => onRemove(plugin.id)}
                onToggle={() => toggle(plugin.id)}
                open={open}
                pending={pending}
                plugin={plugin}
              />
              {open ? (
                <PackageContents
                  category={category}
                  items={items}
                  onOpenItem={onOpenItem}
                  plugin={plugin.id}
                />
              ) : null}
            </div>
          );
        })}
      </ItemList>
    </section>
  );
}

function contentsId(plugin: string) {
  return `agent-package-${plugin.replace(/[^\w-]/gu, '-')}`;
}

function PackageRow({
  plugin,
  items,
  category,
  meta,
  open,
  pending,
  onToggle,
  onExplore,
  onRemove,
}: {
  plugin: ResolvedPlugin;
  items: PackageItems;
  category: PackageCategory | 'all';
  meta: string;
  open: boolean;
  pending: boolean;
  onToggle: () => void;
  onExplore: () => void;
  onRemove?: () => void;
}) {
  const Icon = plugin.kind === 'pack' ? BoxesIcon : PackageIcon;
  const provenance = provenanceLabel(plugin.provenance);
  const expandable =
    category === 'all'
      ? Object.values(items).some((rows) => rows.length > 0)
      : items[category].length > 0;
  const click = (event: MouseEvent<HTMLDivElement>) => {
    if ((event.target as Element).closest('button, a, [role="menuitem"]')) return;
    if (expandable) onToggle();
  };
  const key = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowRight' && !open && expandable) onToggle();
    if (event.key === 'ArrowLeft' && open) onToggle();
  };
  return (
    <ItemRow
      actions={
        <>
          <IconButton
            icon={<EyeIcon />}
            label={t`Open ${ph({ id: plugin.id })}`}
            onClick={onExplore}
          />
          {onRemove ? (
            <IconButton
              disabled={pending}
              icon={<RemoveIcon />}
              label={t`Remove ${ph({ id: plugin.id })}`}
              onClick={onRemove}
            />
          ) : null}
        </>
      }
      className="cursor-default"
      // Open and Remove float over the row's end on hover, so the meta keeps the row.
      floatActions
      data-agent-package={plugin.id}
      icon={<Icon />}
      meta={
        // One meta line, as the spec's server rows: where it comes from, then what it brings.
        <span
          className="flex min-w-0 gap-3"
          title={[provenanceDetail(plugin.provenance) || provenance, meta]
            .filter(Boolean)
            .join(', ')}
        >
          {provenance ? <span className="shrink-0">{provenance}</span> : null}
          <span className="min-w-0 truncate">{meta}</span>
        </span>
      }
      onClick={click}
      selected={open}
      title={
        <button
          aria-controls={open ? contentsId(plugin.id) : undefined}
          aria-expanded={expandable ? open : undefined}
          className="max-w-full truncate rounded-[4px] text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          disabled={!expandable}
          onClick={onToggle}
          onKeyDown={key}
          title={plugin.description || plugin.id}
          type="button"
        >
          {plugin.id}
        </button>
      }
    />
  );
}

/**
 * What one package brings: in a category only that category ("hpc-io brings
 * these subagents"), otherwise every category it brings, each item a row that
 * opens its details.
 */
function PackageContents({
  plugin,
  items,
  category,
  onOpenItem,
}: {
  plugin: string;
  items: PackageItems;
  category: PackageCategory | 'all';
  onOpenItem: (item: PackageItem) => void;
}) {
  const groups =
    category === 'all'
      ? (Object.keys(items) as PackageCategory[]).filter((key) => items[key].length > 0)
      : [category];
  const heading =
    category === 'all'
      ? t`${plugin} brings`
      : bringsLabel(plugin, category, items[category].length);
  return (
    <div
      aria-label={heading}
      className="@container border-b border-border/70 bg-muted/30 py-1.5 pr-1 pl-9"
      id={contentsId(plugin)}
      role="region"
    >
      <p className="truncate pb-1 text-label text-muted-foreground">{heading}</p>
      {groups.map((group) => {
        return (
          <ItemList
            className="pb-1"
            key={group}
            label={category === 'all' ? packageCategoryLabel(plugin, group) : undefined}
          >
            {category === 'all' ? (
              <p className="truncate pt-1 text-caption text-faint">
                {countOf(group, items[group].length)}
              </p>
            ) : null}
            {items[group].map((item) => (
              <PackageItemRow item={item} key={`${group}:${item.id}`} onOpen={onOpenItem} />
            ))}
          </ItemList>
        );
      })}
    </div>
  );
}
