import { LayersIcon } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useElementWidth } from '@/hooks/use-element-width';
import { MoreIcon } from '@/lib/icon-vocabulary';
import {
  CATEGORY_ICONS,
  type PackageCategory,
  type PackageCategoryInfo,
} from './agent-package-items';
import { IconButton } from './primitives/icon-button';
import { SegmentedControl, type SegmentedOption } from './primitives/segmented-control';
import { t } from '@lingui/core/macro';

type Filter = PackageCategory | 'all';

const LABEL = t`Show what packages bring`;
const noop = () => undefined;
// The More button and the 1px gap before it.
const MORE_WIDTH = 29;

// Until the hidden copy is measured: a 12px label runs about 7px a character,
// and a segment adds its icon, gap and padding.
const estimate = (option: SegmentedOption<Filter>) => 40 + 7 * option.label.length;

/**
 * The category filter over an agent's packages. Every category shows its icon
 * and name; when the row runs out of room, the current category keeps its
 * place and the categories that don't fit move into a More menu.
 */
export function AgentPackageFilter({
  categories,
  value,
  onValueChange,
}: {
  categories: readonly PackageCategoryInfo[];
  value: Filter;
  onValueChange: (value: Filter) => void;
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const fullCopy = useRef<HTMLDivElement>(null);
  const [widths, setWidths] = useState<readonly number[]>();
  const options: SegmentedOption<Filter>[] = [
    { value: 'all', label: t`All`, icon: <LayersIcon /> },
    ...categories.map((info) => {
      const Icon = CATEGORY_ICONS[info.value];
      return { value: info.value, label: info.label, icon: <Icon /> };
    }),
  ];
  const current = options.find((option) => option.value === value) ?? options[0]!;
  const shape = options.map((option) => option.value).join();
  // The hidden copy gives each segment's real width; the estimate stands in until then.
  useLayoutEffect(() => {
    const track = fullCopy.current?.querySelector('[data-slot=segmented-control]');
    const measured = track
      ? Array.from(track.children, (child) => child.getBoundingClientRect().width)
      : [];
    setWidths(measured.length && measured.every((size) => size > 0) ? measured : undefined);
  }, [shape]);
  const sizeOf = (option: SegmentedOption<Filter>) =>
    widths?.[options.indexOf(option)] ?? estimate(option);
  const trackWidth = (set: readonly SegmentedOption<Filter>[]) =>
    4 + set.reduce((sum, option) => sum + sizeOf(option), 0) + Math.max(0, set.length - 1);
  let shown = options;
  if (width > 0 && trackWidth(options) > width) {
    const room = width - MORE_WIDTH;
    const kept = new Set([current]);
    for (const option of options) {
      if (kept.has(option)) continue;
      const next = options.filter((candidate) => kept.has(candidate) || candidate === option);
      if (trackWidth(next) <= room) kept.add(option);
    }
    shown = options.filter((option) => kept.has(option));
  }
  const folded = options.filter((option) => !shown.includes(option));
  return (
    <div
      className="relative min-w-0 pt-1 pb-2"
      data-fold={folded.length ? 'more' : 'full'}
      ref={ref}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none invisible absolute inset-0 overflow-hidden"
        inert
      >
        {/* The clip keeps the full-width copy out of the pane's scroll width. */}
        <div className="flex w-max" ref={fullCopy}>
          <SegmentedControl label={LABEL} onValueChange={noop} options={options} value={value} />
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-px">
        <SegmentedControl
          label={LABEL}
          onValueChange={onValueChange}
          options={shown}
          value={value}
        />
        {folded.length ? (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <IconButton icon={<MoreIcon />} label={t`More categories`} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-40">
              <DropdownMenuRadioGroup
                onValueChange={(next) => onValueChange(next as Filter)}
                value={value}
              >
                {folded.map((option) => (
                  <DropdownMenuRadioItem key={option.value} value={option.value}>
                    {option.icon}
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </div>
  );
}
