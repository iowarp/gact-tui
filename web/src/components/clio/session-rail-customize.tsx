import { GripVerticalIcon } from 'lucide-react';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { Sortable, SortableItem, SortableItemHandle } from '@/components/reui/sortable';
import { AddIcon, RemoveIcon, ConfigureIcon } from '@/lib/icon-vocabulary';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  SESSION_RAIL_SECTIONS,
  reorderSessionRail,
  type SessionRailLayout,
  type SessionRailSectionId,
} from './session-rail-layout';

/** A single compact row per section; no second inventory of descriptive cards. */
export function SessionRailCustomize({
  layout,
  onChange,
  onReset,
  title = 'Session',
  sections,
}: {
  layout: SessionRailLayout;
  onChange: (layout: SessionRailLayout) => void;
  onReset: () => void;
  title?: string;
  sections?: readonly SessionRailSectionId[];
}) {
  const order = layout.order.filter((id) => !sections || sections.includes(id));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs"
          aria-label="Customize rail"
        >
          <ConfigureIcon className="size-3.5" /> Customize
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-72 p-2"
        aria-label={`Customize ${title.toLowerCase()} rail`}
      >
        <div className="px-2 pb-2">
          <h3 className="text-sm font-medium">{title} rail</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Saved on this device. Empty sections appear when available.
          </p>
        </div>
        <Sortable
          value={order}
          getItemValue={(id) => id}
          strategy="vertical"
          modifiers={[restrictToVerticalAxis]}
          onValueChange={(next) => onChange(reorderSessionRail(layout, next))}
          className="clio-scrollbar max-h-80 overflow-y-auto"
          aria-label="Rail sections"
          role="list"
        >
          {order.map((id, index) => {
            const label = SESSION_RAIL_SECTIONS.find((section) => section.id === id)!.label;
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
                className="flex h-9 items-center gap-0.5 border-b border-border/50 last:border-0"
              >
                <SortableItemHandle asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 min-w-0 flex-1 justify-start gap-2 px-2 touch-none cursor-grab active:cursor-grabbing"
                    aria-label={`Drag ${label} in layout`}
                    title="Drag to reorder. Alt+Up or Alt+Down moves with the keyboard."
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
                    <span className={`truncate ${included ? '' : 'text-muted-foreground'}`}>
                      {label}
                    </span>
                  </Button>
                </SortableItemHandle>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="size-7"
                  aria-label={`${included ? 'Remove' : 'Add'} ${label}`}
                  aria-pressed={included}
                  onClick={() =>
                    onChange({
                      ...layout,
                      hidden: included
                        ? [...layout.hidden, id]
                        : layout.hidden.filter((hidden) => hidden !== id),
                    })
                  }
                >
                  {included ? (
                    <RemoveIcon className="size-3.5" />
                  ) : (
                    <AddIcon className="size-3.5" />
                  )}
                </Button>
              </SortableItem>
            );
          })}
        </Sortable>
        <Button variant="ghost" size="sm" className="mt-1 h-8 w-full text-xs" onClick={onReset}>
          Reset layout
        </Button>
      </PopoverContent>
    </Popover>
  );
}
