import { MessagesSquareIcon } from 'lucide-react';
import { useContext, useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useShortcut } from '@/lib/shortcuts/hooks';
import { IconButton } from '../primitives/icon-button';
import { useCommentSession } from './comment-session';
import { FrameCommentsSlot } from './frame-comments-slot';
import { t } from '@lingui/core/macro';

/** Puts its children in the frame's Comments place, claiming it while mounted. */
export function FrameCommentsPortal({ children }: { children: ReactNode }) {
  const slot = useContext(FrameCommentsSlot);
  const claim = slot?.claim;
  useEffect(() => claim?.(), [claim]);
  return slot?.host ? createPortal(children, slot.host) : null;
}

/** The frame's Comments icon, disabled with its reason (no conversation, no format support). */
export function FrameCommentsUnavailable({ reason }: { reason: string }) {
  return (
    <FrameCommentsIcon label={t`Comments`} disabledReason={reason} onClick={() => undefined} />
  );
}

/**
 * The one Comments icon: the thread count on its corner, pressed while the
 * comment controls are shown. Ctrl Shift K does the same in this frame.
 */
export function FrameCommentsIcon({
  label = t`Comments`,
  count,
  pressed,
  disabledReason,
  busy = false,
  onClick,
}: {
  label?: string;
  count?: number;
  pressed?: boolean;
  disabledReason?: string;
  busy?: boolean;
  onClick: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const region = useRef<Element | null>(null);
  useEffect(() => {
    region.current = ref.current?.closest('[data-slot="file-viewer"]') ?? null;
  });
  useShortcut('comments', () => onClick(), {
    enabled: !disabledReason && !busy,
    region,
  });
  return (
    <IconButton
      ref={ref}
      label={label}
      icon={<MessagesSquareIcon aria-hidden="true" />}
      shortcut="comments"
      count={count}
      aria-pressed={pressed}
      aria-busy={busy || undefined}
      disabledReason={disabledReason}
      disabled={busy}
      data-comment-toggle="true"
      className="[&_svg]:size-3.5"
      onClick={onClick}
    />
  );
}

/** The session's Comments icon in the frame: threads and unsent marks, toggling the controls. */
export function FrameCommentsSessionIcon() {
  const session = useCommentSession();
  const destination = session?.surface.destination;
  if (!session || (destination?.kind === 'artifact' && !destination.artifactId)) return null;
  return (
    <FrameCommentsPortal>
      <FrameCommentsIcon
        count={session.threadCount + session.marks.length}
        pressed={session.open}
        onClick={() => (session.open ? session.stop() : session.start())}
      />
    </FrameCommentsPortal>
  );
}
