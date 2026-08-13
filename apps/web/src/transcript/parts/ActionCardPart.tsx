import { isRecord } from '../../wire/presentationUtils';
import { Markdown } from '../markdown';
import type { WirePart } from '../registry';

const str = (v: unknown): string => (typeof v === 'string' ? v : v === undefined ? '' : String(v));

/**
 * `action_card` — a GENERIC in-transcript notification/action primitive
 * (frozen wire contract, owner ruling: spotter-ai is the FIRST emitter, not
 * the only one; permission/HITL cards may migrate onto this shape later).
 * Flat fields on the wire `Part` (`gact/parts.py`), omit-empty like every
 * other kind: `source`, `severity`, `title`, `body`, `status`, `actions[]`.
 */
export interface ActionCardAction {
  id: string;
  label: string;
  enabled: boolean;
  /** Open discriminated union on `kind` — `focus_session` {handle_id},
   *  `stub` {reason}, and (designed-for, not shipped) `resolve_permission`.
   *  An unrecognised `kind` must never crash: it renders as a disabled,
   *  neutral button, same as any other forward-compat wire shape. */
  behavior: Record<string, unknown> & { kind?: unknown };
}

/** MVP severities the contract names; `severity` itself is an OPEN string
 *  (future values are expected) — anything outside this set renders with
 *  the same neutral tone as `info`, never a guessed color. */
const KNOWN_SEVERITIES = new Set(['info', 'warning', 'critical']);

function actionsOf(part: WirePart): ActionCardAction[] {
  const raw = part['actions'];
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRecord).map((item) => ({
    id: str(item['id']),
    label: str(item['label']) || str(item['id']) || 'action',
    enabled: item['enabled'] === true,
    behavior: isRecord(item['behavior']) ? item['behavior'] : {},
  }));
}

export interface ActionCardPartProps {
  part: WirePart;
  /** Fired on a click of an ENABLED, known-kind action button — the same
   *  "callback threaded down from Transcript/SessionView" shape HandoffPart's
   *  `onOpenChild` uses. Omitted = every button still renders, just inert
   *  (same convention as HandoffPart's own `onOpenChild`-less state). */
  onCardAction?: (part: WirePart, action: ActionCardAction) => void;
}

/**
 * The action card — the prototype-neutral `.part-inj` pill family (header
 * pill: source · severity · title), a markdown body below it, then a row of
 * action buttons. Spotter-ai's alert is the first real emitter; nothing here
 * is spotter-specific — a future permission card can ride the same shape.
 */
export function ActionCardPart({ part, onCardAction }: ActionCardPartProps) {
  const source = str(part['source']) || 'agent';
  const severityRaw = str(part['severity']);
  const severity = KNOWN_SEVERITIES.has(severityRaw) ? severityRaw : 'info';
  const title = str(part['title']);
  const body = str(part['body']);
  const actions = actionsOf(part);

  return (
    <div className="part-actioncard" data-testid="part-action-card" data-severity={severity}>
      <span className="part-actioncard__pill">
        <span className="part-actioncard__source">{source}</span>
        <span className="part-inj__sep">·</span>
        <span className="part-actioncard__severity">{severityRaw || severity}</span>
        {title ? (
          <>
            <span className="part-inj__sep">·</span>
            <span className="part-actioncard__title">{title}</span>
          </>
        ) : null}
      </span>
      {body ? (
        <div className="part-actioncard__body">
          <Markdown text={body} />
        </div>
      ) : null}
      {actions.length > 0 ? (
        <div className="part-actioncard__actions">
          {actions.map((action) => {
            const kind = str(action.behavior['kind']);
            let disabled: boolean;
            let titleAttr: string | undefined;
            if (kind === 'focus_session') {
              disabled = !action.enabled;
            } else if (kind === 'stub') {
              disabled = true;
              titleAttr = str(action.behavior['reason']) || undefined;
            } else {
              // Unknown kind (or none at all): safe/neutral — never a live
              // control for a behavior this build does not understand.
              disabled = true;
            }
            return (
              <button
                key={action.id || action.label}
                type="button"
                className="part-actioncard__btn"
                disabled={disabled}
                {...(titleAttr ? { title: titleAttr } : {})}
                onClick={() => onCardAction?.(part, action)}
              >
                {action.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
