import { LayersIcon } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
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

type Filter = PackageCategory | 'all';

const LABEL = 'Show what packages bring';
const noop = () => undefined;

// A 12px label runs about 7px a character; a segment adds 20px of padding,
// an icon-only one is 27px, and the track 4px. The 8px keeps a margin.
const segment = (label: string) => 20 + 7 * label.length;
const fullWidth = (options: readonly SegmentedOption<Filter>[]) =>
  12 + options.reduce((sum, option) => sum + segment(option.label) + 1, 0);
const othersWidth = (
  options: readonly SegmentedOption<Filter>[],
  current: SegmentedOption<Filter>,
) => 12 + segment(current.label) + 20 + (options.length - 1) * 28;

/**
 * The category filter over an agent's packages. It folds with its width, as
 * the Tools page switch does: every category by name, then the others as
 * icons, then the current category and ⋯ for the rest. ← → move through all.
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
  const iconsCopy = useRef<HTMLDivElement>(null);
  const [needs, setNeeds] = useState<{ full: number; icons: number }>();
  const options: SegmentedOption<Filter>[] = [
    { value: 'all', label: 'All', icon: <LayersIcon /> },
    ...categories.map((info) => {
      const Icon = CATEGORY_ICONS[info.value];
      return { value: info.value, label: info.label, icon: <Icon /> };
    }),
  ];
  const current = options.find((option) => option.value === value) ?? options[0]!;
  const named = options.map(({ value: key, label }) => ({ value: key, label }));
  const shape = `${options.map((option) => option.value).join()}|${current.value}`;
  // The hidden copies give the real widths; the estimate stands in until then.
  useLayoutEffect(() => {
    const full = fullCopy.current?.scrollWidth ?? 0;
    const icons = iconsCopy.current?.scrollWidth ?? 0;
    setNeeds(full > 0 && icons > 0 ? { full, icons } : undefined);
  }, [shape]);
  const fold =
    width === 0 || (needs?.full ?? fullWidth(options)) <= width
      ? 'full'
      : (needs?.icons ?? othersWidth(options, current)) <= width
        ? 'icons'
        : 'current';
  const step = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const index = options.indexOf(current);
    const next =
      options[(index + (event.key === 'ArrowRight' ? 1 : options.length - 1)) % options.length];
    if (next) onValueChange(next.value);
  };
  return (
    <div className="relative min-w-0 pt-1 pb-2" data-fold={fold} ref={ref}>
      <div
        aria-hidden="true"
        className="pointer-events-none invisible absolute top-0 left-0 grid w-max"
        inert
      >
        <div className="flex w-max" ref={fullCopy}>
          <SegmentedControl label={LABEL} onValueChange={noop} options={named} value={value} />
        </div>
        <div className="flex w-max" ref={iconsCopy}>
          <SegmentedControl
            iconOnly="others"
            label={LABEL}
            onValueChange={noop}
            options={options}
            value={value}
          />
        </div>
      </div>
      {fold === 'current' ? (
        <div className="flex min-w-0 items-center gap-px" onKeyDown={step}>
          <SegmentedControl
            label={LABEL}
            onValueChange={onValueChange}
            options={[current]}
            value={value}
          />
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <IconButton icon={<MoreIcon />} label="Other categories" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-40">
              <DropdownMenuRadioGroup
                onValueChange={(next) => onValueChange(next as Filter)}
                value={value}
              >
                {options.map((option) => (
                  <DropdownMenuRadioItem key={option.value} value={option.value}>
                    {option.icon}
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : (
        <SegmentedControl
          iconOnly={fold === 'icons' ? 'others' : false}
          label={LABEL}
          onValueChange={onValueChange}
          options={fold === 'full' ? named : options}
          value={value}
        />
      )}
    </div>
  );
}
