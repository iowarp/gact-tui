import { GripVerticalIcon } from 'lucide-react';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { useId } from 'react';
import { Sortable, SortableItem, SortableItemHandle } from '@/components/reui/sortable';
import { AddIcon, AdjustIcon, RemoveIcon } from '@/lib/icon-vocabulary';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { IconButton } from '@/components/clio/primitives/icon-button';
import { ListGroupLabel } from '@/components/clio/primitives/list-row';
import { useKeysPresentation } from '@/lib/shortcuts/hooks';
import {
  RAIL_GROUP_LABELS,
  railGroupSections,
  railSection,
  reorderSessionRail,
  type SessionRailLayout,
  type SessionRailSectionId,
} from './session-rail-layout';

/** A section moves up or down with Alt (⌥) and the arrow. */
const MOVE_KEYS = ['Alt+Up', 'Alt+Down'] as const;

/** Order, add and remove the rail's sections; saved on this device. */
export function SessionRailCustomize({
  layout,
  onChange,
  onReset,
}: {
  layout: SessionRailLayout;
  onChange: (layout: SessionRailLayout) => void;
  onReset: () => void;
}) {
  const hideEmptyId = useId();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <IconButton size="sm" label="Customize rail" icon={<AdjustIcon aria-hidden="true" />} />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 gap-0 p-2" aria-label="Customize rail">
        <div className="clio-scrollbar max-h-[min(28rem,calc(var(--radix-popover-content-available-height)-6rem))] overflow-y-auto">
          {(['now', 'conversation'] as const).map((group) => (
            <div key={group}>
              <ListGroupLabel>{RAIL_GROUP_LABELS[group]}</ListGroupLabel>
              <SectionOrder
                layout={layout}
                order={railGroupSections(layout, group)}
                label={RAIL_GROUP_LABELS[group]}
                onChange={onChange}
              />
            </div>
          ))}
        </div>
        <div className="mt-1 flex h-9 items-center gap-2 border-t px-2 pt-1">
          <label htmlFor={hideEmptyId} className="flex-1 text-ui">
            Hide empty sections
          </label>
          <Switch
            id={hideEmptyId}
            size="sm"
            checked={layout.hideEmpty}
            onCheckedChange={(hideEmpty) => onChange({ ...layout, hideEmpty })}
          />
        </div>
        <Button variant="ghost" size="sm" className="mt-1 h-8 w-full text-xs" onClick={onReset}>
          Reset layout
        </Button>
      </PopoverContent>
    </Popover>
  );
}

function SectionOrder({
  layout,
  order,
  label,
  onChange,
}: {
  layout: SessionRailLayout;
  order: SessionRailSectionId[];
  label: string;
  onChange: (layout: SessionRailLayout) => void;
}) {
  const moveKeys = useKeysPresentation(MOVE_KEYS);
  return (
    <Sortable
      value={order}
      getItemValue={(id) => id}
      strategy="vertical"
      modifiers={[restrictToVerticalAxis]}
      onValueChange={(next) => onChange(reorderSessionRail(layout, next))}
      aria-label={`${label} sections`}
      role="list"
    >
      {order.map((id, index) => {
        const { label: name, icon: Icon } = railSection(id);
        const included = !layout.hidden.includes(id);
        const move = (offset: -1 | 1) => {
          const next = [...order];
          [next[index], next[index + offset]] = [next[index + offset]!, id];
          onChange(reorderSessionRail(layout, next));
        };
        return (
          <SortableItem
            key={id}
            value={id}
            role="listitem"
            className="flex h-8 items-center gap-0.5"
          >
            <SortableItemHandle asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 min-w-0 flex-1 cursor-grab touch-none justify-start gap-2 px-2 text-ui font-normal active:cursor-grabbing"
                aria-label={`Drag ${name} in layout`}
                aria-keyshortcuts={moveKeys?.aria}
                title={`Drag to reorder, or ${moveKeys?.text ?? ''}`}
                onKeyDown={(event) => {
                  if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
                    event.preventDefault();
                    event.stopPropagation();
                    const offset = event.key === 'ArrowUp' ? -1 : 1;
                    if (index + offset >= 0 && index + offset < order.length) move(offset);
                  }
                }}
              >
                <GripVerticalIcon
                  aria-hidden="true"
                  className="size-3.5 shrink-0 text-muted-foreground"
                />
                <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                <span className={included ? 'truncate' : 'truncate text-muted-foreground'}>
                  {name}
                </span>
              </Button>
            </SortableItemHandle>
            <IconButton
              size="sm"
              label={`${included ? 'Remove' : 'Add'} ${name}`}
              icon={included ? <RemoveIcon aria-hidden="true" /> : <AddIcon aria-hidden="true" />}
              onClick={() =>
                onChange({
                  ...layout,
                  hidden: included
                    ? [...layout.hidden, id]
                    : layout.hidden.filter((hidden) => hidden !== id),
                })
              }
            />
          </SortableItem>
        );
      })}
    </Sortable>
  );
}
