import { isRecord } from '../../wire/presentationUtils';
import { Markdown } from '../markdown';
import type { WirePart } from '../registry';

/** Only string/number wire values render as text. `String(null)` ->
 *  `"null"` and `String({})` -> `"[object Object]"` would otherwise leak a
 *  JS coercion artifact straight into the header/body — anything that isn't
 *  a string or number (null, boolean, array, object) becomes '' instead. */
const str = (v: unknown): string => {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return '';
};

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

/** `status` is the shared card-lifecycle slot (open string; MVP `"active"`
 *  now, `"resolved"` later — contract §4.5.2). Unknown or empty values
 *  render exactly like `"active"` (today's only real value) — forward
 *  compat, not a guess at what a future status means. */
const KNOWN_STATUSES = new Set(['active', 'resolved']);

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
  const statusRaw = str(part['status']);
  const status = KNOWN_STATUSES.has(statusRaw) ? statusRaw : 'active';
  // Gray-in-place: a resolved card stays in the transcript (never removed —
  // the reader can still see what happened) but reads as settled, and every
  // action button goes inert, regardless of its own kind/enabled state —
  // there is nothing left to DO on a card that already resolved.
  const resolved = status === 'resolved';
  const title = str(part['title']);
  const body = str(part['body']);
  const actions = actionsOf(part);

  return (
    <div
      className="part-actioncard"
      data-testid="part-action-card"
      data-severity={severity}
      data-status={status}
    >
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
          {actions.map((action, index) => {
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
            // Resolved wins over any per-kind computation above — a card
            // that already settled offers no live control, full stop.
            if (resolved) disabled = true;
            return (
              <button
                // Index-composited: a wire-authored duplicate `id` (easy for
                // a model to produce) must not collide two React keys.
                key={`${index}:${action.id || action.label}`}
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
