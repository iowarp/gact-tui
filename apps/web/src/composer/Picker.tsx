import { Eyebrow, Icon, Popover, type IconName } from '../kit';
import './picker.css';

export interface PickerItem {
  /** Inserted into the message on selection. */
  id: string;
  label: string;
  detail?: string;
}

export type PickerKind = 'command' | 'file';

export interface PickerProps {
  open: boolean;
  kind: PickerKind;
  label: string;
  items: PickerItem[];
  activeIndex: number;
  onSelect: (item: PickerItem) => void;
  onClose: () => void;
}

/** File-type glyph by extension — the same coarse family ArtifactChip uses
 *  for durable artifacts, extended to the extensions a workspace tree
 *  actually shows. No extension (or a trailing slash) reads as a directory. */
function fileIcon(id: string): IconName {
  const path = id.toLowerCase();
  if (path.endsWith('/') || !path.includes('.')) return 'folder';
  const ext = path.slice(path.lastIndexOf('.') + 1);
  if (ext === 'csv' || ext === 'tsv') return 'csv';
  if (['json', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf'].includes(ext)) return 'conf';
  if (['py', 'sh', 'bash', 'js', 'jsx', 'ts', 'tsx', 'go', 'rs', 'c', 'cpp', 'h', 'java', 'rb'].includes(ext)) {
    return 'term';
  }
  return 'doc';
}

/** commands carry no per-item icon from the backend (SlashCommandDef is just
 *  {id, title, description}) — one consistent glyph for every row is the
 *  honest choice over guessing per-command meaning. */
function pickerIcon(kind: PickerKind, item: PickerItem): IconName {
  return kind === 'command' ? 'bolt' : fileIcon(item.id);
}

const EYEBROW: Record<PickerKind, string> = {
  command: 'commands',
  file: '@ reference — pick a file, agent, or tool',
};

/**
 * The composer's `/` and `@` list.
 *
 * Composed from the kit Popover in its `up` placement — the geometry the
 * prototype gives the composer popover (rises above, 10px radius, bounded
 * scroll) already lives there, so this adds only the row grammar: a visible
 * uppercase eyebrow, `14px auto minmax(0,1fr)` icon/label/detail rows.
 */
export function Picker({ open, kind, label, items, activeIndex, onSelect, onClose }: PickerProps) {
  return (
    <Popover open={open} label={label} placement="up" onClose={onClose}>
      <div className="picker">
        {/* Measured on the prototype's own picker header: plain 10.5px/.1em/
            muted, same as every other popover eyebrow in the app — not the
            rail's bold section-header weight. */}
        <Eyebrow>{EYEBROW[kind]}</Eyebrow>
        {items.length === 0 ? (
          <p className="picker__empty" data-testid="picker-empty">
            {kind === 'command' ? 'No matching commands.' : 'No matching files.'}
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
                <span className="picker__icon" aria-hidden="true">
                  <Icon name={pickerIcon(kind, item)} size={12} />
                </span>
                <span className="picker__label">{item.label}</span>
                {item.detail ? <span className="picker__detail">{item.detail}</span> : null}
              </button>
            ))}
          </div>
        )}
      </div>
    </Popover>
  );
}
