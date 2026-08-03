import { useState, type ReactNode } from 'react';
import { Popover } from './Popover';
import './select.css';

export interface SelectOption {
  id: string;
  label: string;
  detail?: ReactNode;
  disabled?: boolean;
}

export interface SelectProps {
  label: string;
  value: string;
  options: SelectOption[];
  /** `up` opens above — the composer's model picker. */
  placement?: 'down' | 'up';
  onChange: (id: string) => void;
}

/**
 * THE dropdown — the model picker, provider pickers, scope selectors.
 *
 * Composed from Popover rather than reimplementing anchoring and dismissal,
 * which is the kit working as intended: one dismissal behaviour, one set of
 * placement rules, fixed in one place.
 */
export function Select({ label, value, options, placement = 'down', onChange }: SelectProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value);

  return (
    <span className="kit-select">
      <button
        type="button"
        className="kit-select__trigger"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="kit-select__value">{selected?.label ?? value}</span>
        <span className="kit-select__caret" aria-hidden="true">
          ⌄
        </span>
      </button>

      <Popover open={open} label={label} placement={placement} onClose={() => setOpen(false)}>
        <div className="kit-select__list" role="listbox" aria-label={label}>
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              role="option"
              className="kit-select__option"
              aria-selected={option.id === value}
              disabled={option.disabled}
              onClick={() => {
                // A disabled option must not close the list either — a refused
                // choice that dismisses reads as an accepted one.
                if (option.disabled) return;
                onChange(option.id);
                setOpen(false);
              }}
            >
              <span className="kit-select__option-label">{option.label}</span>
              {option.detail ? (
                <span className="kit-select__option-detail">{option.detail}</span>
              ) : null}
            </button>
          ))}
        </div>
      </Popover>
    </span>
  );
}
