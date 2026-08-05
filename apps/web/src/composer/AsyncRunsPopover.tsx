import { Eyebrow, Icon, Popover, StatusDot } from '../kit';
import './async-runs-popover.css';

/** One async agent run as the composer's pill needs it — a thin projection
 *  of the session's real agent-task rows (client.get(`/agent-tasks`)), not
 *  invented data. `terminal` mirrors SessionView's own
 *  TERMINAL_AGENT_TASK_STATUSES classification. */
export interface AsyncRunItem {
  id: string;
  label: string;
  status: string;
  placement?: string;
  terminal: boolean;
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
        <Eyebrow strong>async agents</Eyebrow>
        {active.length === 0 && finished.length === 0 ? (
          <p className="async-runs__empty">No async runs for this session.</p>
        ) : null}
        {active.length > 0 ? (
          <div className="async-runs__list" role="list" aria-label="Running agents">
            {active.map((task) => (
              <div className="async-runs__row" role="listitem" key={task.id}>
                <StatusDot status={task.status === 'queued' ? 'queued' : 'running'} />
                <span className="async-runs__label">{task.label}</span>
                {task.placement ? <span className="async-runs__meta">{task.placement}</span> : null}
              </div>
            ))}
          </div>
        ) : null}
        {finished.length > 0 ? (
          <div className="async-runs__finished">
            <Eyebrow tight>recently finished</Eyebrow>
            <div role="list" aria-label="Recently finished agents">
              {finished.map((task) => (
                <div className="async-runs__row" role="listitem" key={task.id}>
                  <StatusDot
                    status={task.status === 'failed' || task.status === 'error' ? 'error' : 'idle'}
                    quiet
                  />
                  <span className="async-runs__label">{task.label}</span>
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
              ))}
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
