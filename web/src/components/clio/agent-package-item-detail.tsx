import type { AgentResolution } from '@clio/core/v3';
import { ArrowLeftIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { SkillContent, SubagentPrompt } from './agent-item-details';
import { subagentFacts, subagentRow } from './agent-subagent-facts';
import { CATEGORY_ICONS, PACKAGE_CATEGORY, type PackageItem } from './agent-package-items';
import { IconButton } from './primitives/icon-button';
import { KeyValueGrid, KeyValueRowButton } from './primitives/key-value-grid';

/**
 * One thing a package brings (a subagent, a tool, a skill, a prompt part),
 * opened on its own: what it is and does. A subagent shows its model, tools
 * and prompt; a skill its instructions and files. Its package is one row away
 * (Package), and Back returns to where it was opened.
 */
export function AgentPackageItemDetail({
  item,
  resolution,
  backLabel = 'Back to packages',
  onBack,
  onExplore,
}: {
  item: PackageItem;
  resolution: AgentResolution;
  backLabel?: string;
  onBack: () => void;
  /** Open the package's files; at this item's folder when `skill` is set. */
  onExplore: (item: PackageItem, skill?: boolean) => void;
}) {
  const info = PACKAGE_CATEGORY[item.category];
  const Icon = CATEGORY_ICONS[item.category];
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const kind = info.singular.charAt(0).toUpperCase() + info.singular.slice(1);
  const plugin = resolution.plugins.find((entry) => entry.id === item.plugin);
  const reference = plugin?.marketplace ? `${plugin.marketplace}/${plugin.id}` : undefined;
  const subagent = item.category === 'subagents' ? subagentRow(resolution, item) : undefined;
  return (
    <section aria-label={`${kind} ${item.id}`} className="flex min-w-0 flex-col">
      <div className="flex min-h-10 min-w-0 items-center gap-2 border-b border-border px-2.5 py-1.5 text-meta whitespace-nowrap">
        <IconButton
          icon={<ArrowLeftIcon aria-hidden="true" />}
          label={backLabel}
          onClick={onBack}
          size="sm"
        />
        <Icon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
        <h3
          className="min-w-0 truncate font-medium text-foreground outline-none"
          ref={heading}
          tabIndex={-1}
          title={item.id}
        >
          {item.id}
        </h3>
        <span className="shrink-0 text-muted-foreground">{kind}</span>
      </div>
      <div className="grid min-w-0 gap-3 p-3.5">
        <KeyValueGrid
          aria-label={`${item.id} details`}
          items={[
            ...(item.description
              ? [
                  {
                    label: item.category === 'prompts' ? 'Section' : 'Description',
                    value: <span className="whitespace-normal">{item.description}</span>,
                    title: item.description,
                  },
                ]
              : []),
            {
              label: 'Package',
              title: `Open ${item.plugin}`,
              value: plugin ? (
                <KeyValueRowButton
                  aria-label={`Package: ${item.plugin}, open it`}
                  chevron="right"
                  data-item-package
                  onClick={() => onExplore(item)}
                >
                  {item.plugin}
                </KeyValueRowButton>
              ) : (
                item.plugin
              ),
              mono: !plugin,
            },
            ...(item.note ? [{ label: 'Loading', value: item.note }] : []),
            ...(subagent ? subagentFacts(subagent) : []),
          ]}
          variant="rows"
        />
        {subagent ? <SubagentPrompt row={subagent} /> : null}
        {item.category === 'skills' ? (
          <SkillContent item={item} onBrowse={() => onExplore(item, true)} reference={reference} />
        ) : null}
        {item.text ? (
          <pre
            aria-label={`${item.id} text`}
            className="max-h-80 overflow-auto rounded-md border bg-muted/40 p-2.5 font-mono text-label leading-5 whitespace-pre-wrap"
          >
            {item.text}
          </pre>
        ) : null}
      </div>
    </section>
  );
}
