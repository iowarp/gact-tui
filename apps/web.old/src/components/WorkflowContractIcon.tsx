/**
 * WORKFLOW-CONTRACT ICON — the #305 owner-approved transcript glyph.
 *
 * A small document icon shown on a delegation CALL row (`● call(child)`) and a
 * RETURN row (`↩ child returns to parent`), rendered ONLY when that row carries a
 * non-empty typed `workflow_state` (the typed carrier surfaced by
 * transcriptDelegationModel — never parsed out of prose). It makes the otherwise
 * invisible contract visible without adding it raw to the flow:
 *
 *   - HOVER  → a popup titled with the direction (`→ child` for a call the state
 *     was passed DOWN on; `← child` for a return it came UP on) showing the FULL
 *     state pretty-printed (scrollable; byte content preserved — no field-picking
 *     or summarizing, consistent with SPEC §4.5 / #885).
 *   - CLICK  → the popup PINS: its text becomes selectable for copy/paste, an X
 *     button closes it, and Esc closes it too. An unpinned hover popup follows
 *     normal hover semantics (closes on mouse-leave).
 *
 * The popup renders through a Portal with fixed positioning: transcript rows set
 * `content-visibility: auto` (→ `contain: paint`), which would otherwise clip the
 * popup and trap it below later rows in the stacking order. Positioning tracks the
 * icon on scroll/resize while open, and flips to the icon's left edge when the icon
 * sits in the viewport's right half so the popup never overflows the right edge.
 *
 * Styling stays within the existing transcript design tokens (it mirrors the
 * show-more / provider-thinking disclosures) — no new colors or fonts.
 */
import { Show, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { Portal } from 'solid-js/web';
import { Icon } from './Icon.js';
import './workflow-contract.css';

export type WorkflowContractDirection = 'call' | 'return';

interface PopupPos {
  top: number;
  /** Exactly one of left/right is set — the on-screen anchor edge. */
  left?: number;
  right?: number;
}

/** The direction glyph + title. A CALL row passed the state DOWN to the child
 *  (`→`); a RETURN row carried it back UP from the child (`←`). */
function contractTitle(direction: WorkflowContractDirection, child: string): string {
  const arrow = direction === 'call' ? '→' : '←';
  return `Workflow contract ${arrow} ${child}`;
}

/** Anchor the popup below the icon, on whichever horizontal edge keeps it inside
 *  the viewport (icon in the right half → align to the icon's right edge). */
function computePos(rect: DOMRect): PopupPos {
  const top = rect.bottom + 4;
  if (rect.left > window.innerWidth / 2) {
    return { top, right: Math.max(4, window.innerWidth - rect.right) };
  }
  return { top, left: rect.left };
}

export function WorkflowContractIcon(props: {
  /** The typed workflow_state, surfaced verbatim from the row (non-empty object). */
  state: Record<string, unknown>;
  /** The delegated-to child agent — names the contract's other end in the title. */
  child: string;
  /** call = state passed down (`→`); return = state handed back (`←`). */
  direction: WorkflowContractDirection;
}) {
  const [hovered, setHovered] = createSignal(false);
  const [pinned, setPinned] = createSignal(false);
  const [pos, setPos] = createSignal<PopupPos>({ top: 0, left: 0 });
  const open = () => hovered() || pinned();
  // Pretty-print for readability ONLY — the byte content is preserved in full
  // (no field-picking, no summarizing). A scrollable max-height keeps a large
  // contract from overrunning the transcript.
  const pretty = createMemo(() => JSON.stringify(props.state, null, 2));
  const title = () => contractTitle(props.direction, props.child);

  let wrapper: HTMLSpanElement | undefined;
  const reposition = () => {
    if (wrapper) setPos(computePos(wrapper.getBoundingClientRect()));
  };
  const openPopup = () => {
    reposition();
    setHovered(true);
  };
  const close = () => {
    setPinned(false);
    setHovered(false);
  };

  // Track the icon while the popup is open (fixed-positioned in a Portal, so it
  // must follow scroll/resize); and close a PINNED popup on Esc (hover popups close
  // on mouse-leave). Listeners are always registered but only act while open.
  onMount(() => {
    const onScrollResize = () => {
      if (open()) reposition();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && pinned()) {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('scroll', onScrollResize, true);
    window.addEventListener('resize', onScrollResize);
    document.addEventListener('keydown', onKey);
    onCleanup(() => {
      window.removeEventListener('scroll', onScrollResize, true);
      window.removeEventListener('resize', onScrollResize);
      document.removeEventListener('keydown', onKey);
    });
  });

  return (
    <span
      class="trx-wfc"
      ref={wrapper}
      onMouseEnter={openPopup}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        class="trx-wfc__icon"
        classList={{ 'is-pinned': pinned() }}
        aria-label={title()}
        aria-expanded={open()}
        title={title()}
        data-testid="workflow-contract-icon"
        data-direction={props.direction}
        onClick={(e) => {
          e.stopPropagation();
          reposition();
          setPinned((v) => !v);
        }}
      >
        <Icon name="file" size={13} />
      </button>
      <Show when={open()}>
        <Portal>
          <div
            class="trx-wfc__popup"
            classList={{ 'is-pinned': pinned() }}
            role="dialog"
            aria-label={title()}
            data-testid="workflow-contract-popup"
            data-pinned={pinned() ? 'true' : 'false'}
            style={{
              top: `${pos().top}px`,
              ...(pos().left != null ? { left: `${pos().left}px` } : {}),
              ...(pos().right != null ? { right: `${pos().right}px` } : {}),
            }}
            // Keep a hover popup alive while the cursor is over it (it lives in a
            // Portal, so the wrapper's mouseleave already fired; re-assert hover).
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onClick={(e) => e.stopPropagation()}
          >
            <div class="trx-wfc__head">
              <span class="trx-wfc__title" data-testid="workflow-contract-title">
                {title()}
              </span>
              <Show when={pinned()}>
                <button
                  type="button"
                  class="trx-wfc__close"
                  aria-label="Close workflow contract"
                  title="Close"
                  data-testid="workflow-contract-close"
                  onClick={(e) => {
                    e.stopPropagation();
                    close();
                  }}
                >
                  <Icon name="close" size={13} />
                </button>
              </Show>
            </div>
            <pre class="trx-wfc__body" data-testid="workflow-contract-body">
              {pretty()}
            </pre>
          </div>
        </Portal>
      </Show>
    </span>
  );
}
