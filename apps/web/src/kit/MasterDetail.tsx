import type { ReactNode } from 'react';
import './masterdetail.css';

export interface MasterDetailItem {
  id: string;
  label: string;
  /**
   * Unbacked pages ship hidden rather than rendering a dead entry (#337).
   * Filtering lives here so no surface has to remember to do it.
   */
  hidden?: boolean;
  badge?: ReactNode;
  /**
   * Section this item falls under (e.g. "CONNECTION", "AGENTS"). A
   * non-interactive header renders once, immediately before the first
   * visible item of a new group — settings' CONNECTION/AGENTS/TELEMETRY/APP
   * rail sections (design/prototype/Clio Session.html `settingsNav`).
   */
  group?: string;
}

export interface MasterDetailProps {
  label: string;
  items: MasterDetailItem[];
  activeId: string;
  detail: ReactNode;
  onSelect: (id: string) => void;
}

/**
 * Master/detail layout — the settings and provider surfaces.
 *
 * A rail of pages plus a detail pane, with the current page marked via
 * `aria-current` so the selection is not colour-only.
 */
export function MasterDetail({
  label,
  items,
  activeId,
  detail,
  onSelect,
}: MasterDetailProps) {
  const visible = items.filter((item) => !item.hidden);
  let lastGroup: string | undefined;

  return (
    <div className="kit-masterdetail">
      <nav className="kit-masterdetail__rail" aria-label={label}>
        {visible.map((item) => {
          const showGroup = item.group !== undefined && item.group !== lastGroup;
          lastGroup = item.group;
          return (
            <div key={item.id} className="kit-masterdetail__itemwrap">
              {showGroup ? (
                <div className="kit-masterdetail__group">{item.group}</div>
              ) : null}
              <button
                type="button"
                className="kit-masterdetail__item"
                aria-current={item.id === activeId ? 'page' : undefined}
                onClick={() => onSelect(item.id)}
              >
                <span>{item.label}</span>
                {item.badge !== undefined ? (
                  <span className="kit-masterdetail__badge">{item.badge}</span>
                ) : null}
              </button>
            </div>
          );
        })}
      </nav>
      <div className="kit-masterdetail__detail">{detail}</div>
    </div>
  );
}
