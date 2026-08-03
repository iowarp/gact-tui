/**
 * Shared card scaffold wrapping a transcript part (icon, title, collapsible
 * body). Exports the {@link PartCard} component reused by the part views.
 */
import { Show, type JSX } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { Icon, type IconName } from './Icon.js';

/**
 * Shared card scaffold for the v0.2 transcript part views (document, resource,
 * subagent, citation, agent_question, error, compaction). Every one of these is
 * an icon + optional head + body block with the same flex/border/radius chrome
 * (see transcript-new-parts.css). PartCard owns that chrome so each view keeps
 * only its semantic content. Class names are derived from `variant` so the
 * existing per-type CSS hooks (`.trx-document`, `.trx-error__head`, …) and the
 * render-test / full-data-screenshot data-testids stay byte-for-byte identical.
 *
 * Two layouts cover the family:
 *  - 'iconSibling' (default): `<root> icon  body{ head? + children } </root>`.
 *    Used by document, resource_link, citation, agent_question, error,
 *    compaction.
 *  - 'iconInHead': `<root> head{ icon + headExtra } children </root>` — no body
 *    wrapper; the icon sits inside the head row. Used by the inline resource and
 *    the subagent cards (whose left-rail layout stacks head over content).
 */
export function PartCard(props: {
  /** BEM block name minus the `trx-` prefix, e.g. `document`, `error`. */
  variant: string;
  /** Extra root classes (modifiers like `trx-resource--link`, danger borders). */
  class?: string;
  testId: string;
  icon: IconName;
  iconSize?: number;
  /** Root element tag; defaults to `div`. Citation uses `figure`. */
  root?: string;
  role?: string;
  layout?: 'iconSibling' | 'iconInHead';
  /** Head-row slot. For `iconSibling` it lives inside the body; for
   * `iconInHead` it sits next to the icon. */
  head?: JSX.Element;
  children?: JSX.Element;
}) {
  const v = () => `trx-${props.variant}`;
  const rootClass = () => `${v()}${props.class ? ' ' + props.class : ''}`;
  const layout = () => props.layout ?? 'iconSibling';
  const iconEl = (
    <span class={`${v()}__icon`} aria-hidden>
      <Icon name={props.icon} size={props.iconSize ?? 13} />
    </span>
  );
  return (
    <Dynamic
      component={props.root ?? 'div'}
      class={rootClass()}
      data-testid={props.testId}
      role={props.role}
    >
      <Show
        when={layout() === 'iconSibling'}
        fallback={
          <>
            <div class={`${v()}__head`}>
              {iconEl}
              {props.head}
            </div>
            {props.children}
          </>
        }
      >
        {iconEl}
        <div class={`${v()}__body`}>
          <Show when={props.head}>
            <div class={`${v()}__head`}>{props.head}</div>
          </Show>
          {props.children}
        </div>
      </Show>
    </Dynamic>
  );
}
