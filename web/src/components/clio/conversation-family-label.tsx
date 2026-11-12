import type { Session } from '@clio/core/v3';
import { BotIcon, GitBranchIcon, MessageSquareIcon } from 'lucide-react';
import { isManagedChildSession } from '@/lib/session-state';

export function ConversationRoleIcon({
  session,
  className,
}: {
  session: Session;
  className?: string;
}) {
  const Icon = isManagedChildSession(session)
    ? BotIcon
    : session.parent_session_id
      ? GitBranchIcon
      : MessageSquareIcon;
  return <Icon className={className} aria-hidden="true" />;
}

/** Compact visual key shared by both conversation-family views. */
export function ConversationFamilyLegend() {
  return (
    <div
      aria-label="Relationship key"
      className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-muted-foreground"
    >
      <span className="inline-flex items-center gap-1.5">
        <span className="w-4 border-t border-primary" />
        User fork
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="w-4 border-t border-dashed border-primary" />
        Subagent
      </span>
    </div>
  );
}
