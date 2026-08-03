import { Popover } from '../kit';
import './picker.css';

export interface PickerItem {
  /** Inserted into the message on selection. */
  id: string;
  label: string;
  detail?: string;
}

export interface PickerProps {
  open: boolean;
  label: string;
  items: PickerItem[];
  activeIndex: number;
  onSelect: (item: PickerItem) => void;
  onClose: () => void;
}

/**
 * The composer's `/` and `@` list.
 *
 * Composed from the kit Popover in its `up` placement — the geometry the
 * prototype gives the composer popover (rises above, 10px radius, bounded
 * scroll) already lives there, so this adds only the row grammar:
 * `14px auto minmax(0,1fr)`, an icon slot, a label, and a shrinkable detail.
 */
export function Picker({ open, label, items, activeIndex, onSelect, onClose }: PickerProps) {
  return (
    <Popover open={open} label={label} placement="up" onClose={onClose}>
      {items.length === 0 ? (
        <p className="picker__empty" data-testid="picker-empty">
          No matches.
        </p>
      ) : (
        <div className="picker__list" role="listbox" aria-label={label}>
          {items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              role="option"
              className="picker__row"
              aria-selected={index === activeIndex}
              // The textarea keeps focus while the picker is open, so pointer
              // selection must not steal it and fire a premature blur.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSelect(item)}
            >
              <span className="picker__icon" aria-hidden="true" />
              <span className="picker__label">{item.label}</span>
              {item.detail ? <span className="picker__detail">{item.detail}</span> : null}
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}
