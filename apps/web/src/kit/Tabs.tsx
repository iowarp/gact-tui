import { useCallback, type KeyboardEvent, type ReactNode } from 'react';
import './tabs.css';

export interface TabDef {
  id: string;
  label: ReactNode;
  /** Optional trailing count/badge, e.g. `artifacts 5`. */
  badge?: ReactNode;
}

export interface TabsProps {
  label: string;
  tabs: TabDef[];
  activeId: string;
  onChange: (id: string) => void;
  /** Removes the segmented track for low-chrome hierarchy ribbons. */
  variant?: 'default' | 'quiet';
}

/**
 * THE tab strip — the prototype's segmented control: an inset --t-bg track with
 * a --t-bd3 hairline, 7px radius, 2px padding and 2px gaps.
 *
 * Implements the WAI-ARIA tabs pattern properly: roving tabindex (only the
 * selected tab is in the tab order), arrow keys with wraparound, Home/End.
 */
export function Tabs({ label, tabs, activeId, onChange, variant = 'default' }: TabsProps) {
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const index = tabs.findIndex((t) => t.id === activeId);
      if (index < 0 || tabs.length === 0) return;

      let next: number | null = null;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      if (next === null) return;

      event.preventDefault();
      const target = tabs[next];
      if (target) onChange(target.id);
    },
    [activeId, onChange, tabs],
  );

  return (
    <div
      className="kit-tabs"
      role="tablist"
      aria-label={label}
      data-variant={variant}
      onKeyDown={onKeyDown}
    >
      {tabs.map((tab) => {
        const selected = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            className="kit-tabs__tab"
            aria-selected={selected}
            // Roving tabindex: one stop for the whole strip, arrows move within.
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
            {tab.badge !== undefined ? <span className="kit-tabs__badge">{tab.badge}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
