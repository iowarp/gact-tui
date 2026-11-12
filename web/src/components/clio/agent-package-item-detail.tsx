import { ArrowLeftIcon, EyeIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { CATEGORY_ICONS, PACKAGE_CATEGORY, type PackageItem } from './agent-package-items';
import { IconButton } from './primitives/icon-button';
import { KeyValueGrid } from './primitives/key-value-grid';

/**
 * One thing a package brings (a subagent, a tool, a skill, a prompt part)
 * opened from its package: what it is, which package brings it, and the way
 * into that package's files. Back returns to the packages as they were.
 */
export function AgentPackageItemDetail({
  item,
  onBack,
  onExplore,
}: {
  item: PackageItem;
  onBack: () => void;
  /** Open the package, at this item's file when it has one (a skill). */
  onExplore: (item: PackageItem) => void;
}) {
  const info = PACKAGE_CATEGORY[item.category];
  const Icon = CATEGORY_ICONS[item.category];
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const kind = info.singular.charAt(0).toUpperCase() + info.singular.slice(1);
  return (
    <section aria-label={`${kind} ${item.id}`} className="flex min-w-0 flex-col">
      <div className="flex min-h-10 min-w-0 items-center gap-2 border-b border-border px-2.5 py-1.5 text-meta whitespace-nowrap">
        <IconButton
          icon={<ArrowLeftIcon aria-hidden="true" />}
          label="Back to packages"
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
            { label: 'Kind', value: kind },
            { label: 'Package', value: item.plugin, mono: true },
            ...(item.note ? [{ label: 'Loading', value: item.note }] : []),
            ...(item.description
              ? [
                  {
                    label: item.category === 'prompts' ? 'Section' : 'Description',
                    value: <span className="whitespace-normal">{item.description}</span>,
                    title: item.description,
                  },
                ]
              : []),
          ]}
          variant="rows"
        />
        {item.text ? (
          <pre
            aria-label={`${item.id} text`}
            className="max-h-80 overflow-auto rounded-md border bg-muted/40 p-2.5 font-mono text-label leading-5 whitespace-pre-wrap"
          >
            {item.text}
          </pre>
        ) : null}
        <Button className="w-fit" onClick={() => onExplore(item)} size="xs" variant="outline">
          <EyeIcon aria-hidden="true" />
          {item.category === 'skills' ? 'Open skill file' : `Open ${item.plugin}`}
        </Button>
      </div>
    </section>
  );
}
