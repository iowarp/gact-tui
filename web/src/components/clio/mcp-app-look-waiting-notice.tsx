import { EyeIcon } from 'lucide-react';
import { useWaitingViewLook, type WaitingViewLook } from './mcp-app-look-waiting';
import { t } from '@lingui/core/macro';

/**
 * The running `look_at_view` row's outcome while its view is not on screen: the agent is
 * waiting to see the view, and a button shows it. The look then completes by itself.
 */
export function ViewLookWaiting({ look }: { look: WaitingViewLook }) {
  return (
    <span
      className="inline-flex min-w-0 items-baseline gap-1.5 text-warning"
      data-slot="view-look-waiting"
    >
      <span>{t`waiting to see the view`}</span>
      <button
        className="rounded-[4px] underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        onClick={look.reveal}
        title={t`The view is not on screen. Show it so the agent can see it.`}
        type="button"
      >
        {t`Show it`}
      </button>
    </span>
  );
}

/**
 * In the view's card (or its in-tab row): the agent is waiting to see this view, which is
 * not on screen, with a button that shows it. Nothing while no look waits on it.
 */
export function ViewLookCardNotice({
  appInstanceId,
  sessionId,
}: {
  appInstanceId: string;
  sessionId: string;
}) {
  const look = useWaitingViewLook({ appInstanceId, sessionId });
  if (!look) return null;
  return (
    <span
      className="flex min-w-0 items-center gap-1.5 text-xs text-warning"
      data-slot="view-look-card-notice"
      role="status"
    >
      <EyeIcon aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="min-w-0 truncate">{t`The agent is waiting to see this view.`}</span>
      <button
        className="shrink-0 rounded-[4px] underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        onClick={look.reveal}
        type="button"
      >
        {t`Show it`}
      </button>
    </span>
  );
}
