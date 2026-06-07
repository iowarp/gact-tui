/**
 * Settings primitives — ONE row vocabulary shared by every settings section
 * (task B2 §3). The goal is that 8+ sections read as a single screen: a
 * `SectionHeading` introduces a group, `ListRow` lays out
 * label + description + right-aligned control, `Pill` is the status chip,
 * and `EmptyState` / `LoadingState` are the two non-content states.
 *
 * These intentionally do NOT restyle anything — they wrap the existing design
 * tokens (`--color-*`, `--radius-*`) so the visual refresh task can re-skin in
 * one place. Structure, not paint.
 */
import { Show, type JSX } from 'solid-js';
import { Icon, type IconName } from './Icon.js';
import { Spinner } from './ui/Spinner.js';
import './settings-primitives.css';

/** A labelled divider that opens a group of rows. */
export function SectionHeading(props: {
  title: string;
  hint?: JSX.Element;
  /** Optional right-aligned action (e.g. a Refresh button). */
  action?: JSX.Element;
  testid?: string;
}): JSX.Element {
  return (
    <div class="sx-heading" data-testid={props.testid}>
      <div class="sx-heading__row">
        <h2 class="sx-heading__title">{props.title}</h2>
        <Show when={props.action}>
          <div class="sx-heading__action">{props.action}</div>
        </Show>
      </div>
      <Show when={props.hint}>
        <p class="sx-heading__hint">{props.hint}</p>
      </Show>
    </div>
  );
}

/**
 * The canonical settings row: a label + optional description on the left, a
 * right-aligned control slot. Use for toggles, dropdowns, buttons — anything
 * that reads "setting: control".
 */
export function ListRow(props: {
  label: JSX.Element;
  description?: JSX.Element;
  /** Right-aligned control (toggle / select / button / pill). */
  control?: JSX.Element;
  /** Optional leading status pill (e.g. active / error). */
  badge?: JSX.Element;
  testid?: string;
}): JSX.Element {
  return (
    <div class="sx-row" data-testid={props.testid}>
      <div class="sx-row__main">
        <div class="sx-row__label">
          <Show when={props.badge}>{props.badge}</Show>
          <span>{props.label}</span>
        </div>
        <Show when={props.description}>
          <p class="sx-row__desc">{props.description}</p>
        </Show>
      </div>
      <Show when={props.control}>
        <div class="sx-row__control">{props.control}</div>
      </Show>
    </div>
  );
}

export type PillTone = 'neutral' | 'ok' | 'warn' | 'err' | 'accent';

/** A small status chip — the one badge shape across settings. */
export function Pill(props: {
  tone?: PillTone;
  children: JSX.Element;
  testid?: string;
  title?: string;
}): JSX.Element {
  return (
    <span
      class={`sx-pill sx-pill--${props.tone ?? 'neutral'}`}
      data-testid={props.testid}
      title={props.title}
    >
      {props.children}
    </span>
  );
}

/** Empty / nothing-configured state, consistent across sections. */
export function EmptyState(props: {
  icon?: IconName;
  title: string;
  body?: JSX.Element;
  action?: JSX.Element;
  testid?: string;
}): JSX.Element {
  return (
    <div class="sx-empty" data-testid={props.testid ?? 'sx-empty'}>
      <div class="sx-empty__icon">
        <Icon name={props.icon ?? 'help'} size={26} />
      </div>
      <h3 class="sx-empty__title">{props.title}</h3>
      <Show when={props.body}>
        <p class="sx-empty__body">{props.body}</p>
      </Show>
      <Show when={props.action}>
        <div class="sx-empty__action">{props.action}</div>
      </Show>
    </div>
  );
}

/** A small inline loading row — used while a section's data is in flight. */
export function LoadingState(props: { label?: string; testid?: string }): JSX.Element {
  return (
    <div class="sx-loading" data-testid={props.testid ?? 'sx-loading'}>
      <Spinner class="sx-loading__spinner" />
      <span>{props.label ?? 'Loading…'}</span>
    </div>
  );
}
