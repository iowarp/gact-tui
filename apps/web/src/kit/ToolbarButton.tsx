import type { ReactNode } from 'react';
import './toolbarbutton.css';

export interface ToolbarButtonProps {
  /** Always required — it is the accessible name, icon-only or not. */
  label: string;
  icon?: ReactNode;
  /** Hide the text and keep only the icon; the name survives via aria-label. */
  iconOnly?: boolean;
  /** Renders as a toggle and reports aria-pressed. */
  pressed?: boolean;
  /** `small` is the rail's 22px icon button; default is the topbar's 26px. */
  size?: 'small' | 'default';
  /** No backend surface exists for this action yet — renders disabled with
   *  the codebase's degraded marker (never a silently-omitted control). */
  unbacked?: boolean;
  /** Tooltip; mandatory pairing for `unbacked` to explain the gap honestly. */
  title?: string;
  onClick: () => void;
}

/**
 * The header/toolbar control — `files`, `console`, `artifacts 5`, `ctx 41%`,
 * the observability eye.
 *
 * Geometry from the prototype: transparent with a transparent 1px border
 * (so hover can reveal one without shifting layout), 3px/8px padding, 5px
 * radius, mono 11.5px, muted.
 *
 * `label` is mandatory precisely because several of these are icon-only in the
 * prototype; that is exactly where an accessible name is usually dropped.
 */
export function ToolbarButton({
  label,
  icon,
  iconOnly = false,
  pressed,
  size = 'default',
  unbacked = false,
  title,
  onClick,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      className="kit-toolbarbutton"
      data-icon-only={iconOnly ? 'true' : undefined}
      data-size={size}
      data-unbacked={unbacked ? 'true' : undefined}
      aria-label={label}
      {...(title ? { title } : {})}
      {...(pressed === undefined ? {} : { 'aria-pressed': pressed })}
      disabled={unbacked}
      onClick={onClick}
    >
      {icon ? (
        <span className="kit-toolbarbutton__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {iconOnly ? null : <span className="kit-toolbarbutton__label">{label}</span>}
    </button>
  );
}
