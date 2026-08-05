import { Eyebrow, Icon, Popover } from '../kit';
import './async-runs-popover.css';

/** One async agent run as the composer's pill needs it — a thin projection
 *  of the session's real agent-task rows (client.get(`/agent-tasks`)), not
 *  invented data. `terminal` mirrors SessionView's own
 *  TERMINAL_AGENT_TASK_STATUSES classification. `startedAt`/`endedAt` are the
 *  real `created_at`/`updated_at`|`completed_at` wire fields — they drive the
 *  prototype's "2h 14m" / "done 26m ago" elapsed text; omitted entirely when
 *  the caller doesn't have a timestamp rather than showing a guessed one. */
export interface AsyncRunItem {
  id: string;
  label: string;
  status: string;
  placement?: string;
  startedAt?: string;
  endedAt?: string;
  terminal: boolean;
}

const FAILED_STATUSES = new Set(['failed', 'error', 'cancelled']);

/** "2h 14m" / "12m" — the prototype's own elapsed-time grammar (measured on
 *  its runs popover: "2h 14m", "12m"). Never shows "0m": a run under a
 *  minute old reads as "1m" rather than a confusing floor of zero. */
function formatElapsed(fromIso?: string, toIso?: string): string | undefined {
  if (!fromIso) return undefined;
  const from = Date.parse(fromIso);
  if (!Number.isFinite(from)) return undefined;
  const to = toIso ? Date.parse(toIso) : Date.now();
  const minutes = Math.max(1, Math.round((Number.isFinite(to) ? to : Date.now()) - from) / 60_000);
  const wholeMinutes = Math.round(minutes);
  if (wholeMinutes < 60) return `${wholeMinutes}m`;
  const hours = Math.floor(wholeMinutes / 60);
  const remainder = wholeMinutes % 60;
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
}

/** "done 26m ago" — the prototype's own recently-finished phrasing (measured:
 *  `when: 'done 26m ago'` in its canned data). */
function formatDoneAgo(endedAt?: string): string | undefined {
  const elapsed = formatElapsed(endedAt);
  return elapsed ? `done ${elapsed} ago` : undefined;
}

export interface AsyncRunsPopoverProps {
  open: boolean;
  tasks: AsyncRunItem[];
  /** Dismissing a "recently finished" row is view-only — there is no backend
   *  endpoint that deletes a completed agent-task record, so this only hides
   *  the row from this popover instance. */
  dismissedIds: Set<string>;
  onDismiss: (id: string) => void;
  /** The full runs view (Observability's runs tab). Omitted = the footer
   *  link is not rendered rather than a dead link. */
  onOpenHistory?: () => void;
  onClose: () => void;
}

/**
 * The prototype's async-agents runs popover (tgRuns): a floating panel
 * listing detached/running agent runs, a dismissible "recently finished"
 * section, and a "run history" link into the fuller view.
 */
export function AsyncRunsPopover({
  open,
  tasks,
  dismissedIds,
  onDismiss,
  onOpenHistory,
  onClose,
}: AsyncRunsPopoverProps) {
  const active = tasks.filter((task) => !task.terminal);
  const finished = tasks.filter((task) => task.terminal && !dismissedIds.has(task.id));

  return (
    <Popover open={open} label="Async agents" placement="up" onClose={onClose}>
      <div className="async-runs">
        {/* Measured on the prototype's own popover: the "async agents" and
            "recently finished" headers share the SAME plain 10.5px/.1em/muted
            eyebrow treatment — neither is bold or tight-tracked. */}
        <Eyebrow>async agents</Eyebrow>
        {active.length === 0 && finished.length === 0 ? (
          <p className="async-runs__empty">No async runs for this session.</p>
        ) : null}
        {active.length > 0 ? (
          <div className="async-runs__list" role="list" aria-label="Running agents">
            {active.map((task) => {
              const elapsed = formatElapsed(task.startedAt);
              return (
                <div className="async-runs__row" role="listitem" key={task.id}>
                  {/* Measured on the prototype's own popover: active rows
                      carry the SAME orange bolt glyph as the pill's async
                      chip, never a pulsing dot — the dot vocabulary belongs
                      to session/rail liveness, not this list. */}
                  <span className="async-runs__icon">
                    <Icon name="zap" size={11} />
                  </span>
                  <span className="async-runs__lines">
                    <span className="async-runs__line">
                      <span className="async-runs__label">{task.label}</span>
                      {task.placement ? (
                        <span className="async-runs__meta">{task.placement}</span>
                      ) : null}
                      <span className="async-runs__spacer" />
                      {elapsed ? (
                        <span className="async-runs__meta async-runs__meta--accent">{elapsed}</span>
                      ) : null}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        ) : null}
        {finished.length > 0 ? (
          <div className="async-runs__finished">
            <Eyebrow>recently finished</Eyebrow>
            <div role="list" aria-label="Recently finished agents">
              {finished.map((task) => {
                const failed = FAILED_STATUSES.has(task.status);
                const when = formatDoneAgo(task.endedAt);
                return (
                  <div className="async-runs__row async-runs__row--finished" role="listitem" key={task.id}>
                    <span
                      className={`async-runs__check${failed ? ' async-runs__check--error' : ''}`}
                      aria-hidden="true"
                    >
                      {failed ? '✗' : '✓'}
                    </span>
                    <span className="async-runs__lines">
                      <span className="async-runs__line">
                        <span className="async-runs__label">{task.label}</span>
                        {task.placement ? (
                          <span className="async-runs__meta">{task.placement}</span>
                        ) : null}
                        <span className="async-runs__spacer" />
                        {when ? <span className="async-runs__meta">{when}</span> : null}
                      </span>
                      <span
                        className={`async-runs__status${failed ? ' async-runs__status--error' : ''}`}
                      >
                        {task.status}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="async-runs__dismiss"
                      aria-label={`Dismiss ${task.label}`}
                      title="Dismiss"
                      onClick={() => onDismiss(task.id)}
                    >
                      <Icon name="x" size={9} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
        {onOpenHistory ? (
          <button
            type="button"
            className="async-runs__history"
            onClick={() => {
              onOpenHistory();
              onClose();
            }}
          >
            run history ↗
          </button>
        ) : null}
      </div>
    </Popover>
  );
}
