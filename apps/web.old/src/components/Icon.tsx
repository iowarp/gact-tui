/**
 * UI component: Icon. Renders `Icon` from `IconProps`.
 */
import { Show } from 'solid-js';
import type { JSX } from 'solid-js';
import { ICON_GLYPHS, type IconName } from './IconGlyphs.js';

export type { IconName } from './IconGlyphs.js';

export interface IconProps {
  name: IconName;
  size?: number;
  class?: string;
  /** Optional title for screen readers. */
  label?: string;
}

/**
 * SVG icon renderer used throughout the desktop shell.
 *
 * Glyphs live in `IconGlyphs.tsx` and are factories rather than shared JSX
 * nodes, so repeated icon instances cannot steal each other's DOM children.
 */
export function Icon(props: IconProps) {
  const size = () => props.size ?? 18;
  const factory = () => ICON_GLYPHS[props.name] as (() => JSX.Element) | undefined;
  return (
    <Show when={factory()}>
      {(make) => (
        <svg
          class={'icon ' + (props.class ?? '')}
          width={size()}
          height={size()}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden={props.label ? undefined : 'true'}
          aria-label={props.label}
          role={props.label ? 'img' : undefined}
        >
          {make()()}
        </svg>
      )}
    </Show>
  );
}
