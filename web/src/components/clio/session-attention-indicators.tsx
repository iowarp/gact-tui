import {
  BoxesIcon,
  ClipboardPenLineIcon,
  MessageCircleQuestionIcon,
  ShieldQuestionIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { SessionAttention } from '@/lib/session-attention';

interface SessionAttentionIndicatorsProps {
  attention: SessionAttention;
  showResponseLabel?: boolean;
}

/** Presents response blockers as distinct visual cues instead of a diagnostic sentence. */
export function SessionAttentionIndicators({
  attention,
  showResponseLabel = false,
}: SessionAttentionIndicatorsProps) {
  const permissionCount = attention.permissionIds.length;
  const questionCount = attention.questionIds.length;
  const taskInputCount = attention.mcpTaskInputIds.length;
  const a2uiCount = attention.a2uiIds.length;
  const indicators = (
    <>
      {permissionCount ? (
        <Badge variant="outline">
          <ShieldQuestionIcon aria-hidden="true" data-icon="inline-start" />
          {permissionCount === 1 ? 'Approval' : `${permissionCount} approvals`}
        </Badge>
      ) : null}
      {questionCount ? (
        <Badge variant="outline">
          <MessageCircleQuestionIcon aria-hidden="true" data-icon="inline-start" />
          {questionCount === 1 ? 'Question' : `${questionCount} questions`}
        </Badge>
      ) : null}
      {taskInputCount ? (
        <Badge variant="outline">
          <ClipboardPenLineIcon aria-hidden="true" data-icon="inline-start" />
          {taskInputCount === 1 ? 'Task input' : `${taskInputCount} task inputs`}
        </Badge>
      ) : null}
      {a2uiCount ? (
        <Badge variant="outline">
          <BoxesIcon aria-hidden="true" data-icon="inline-start" />
          {a2uiCount === 1 ? 'Interactive view' : `${a2uiCount} interactive views`}
        </Badge>
      ) : null}
    </>
  );

  if (!showResponseLabel) {
    return <div className="flex min-w-0 flex-wrap items-center gap-1.5">{indicators}</div>;
  }

  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <span className="text-xs font-medium">Response needed</span>
      <div className="flex flex-wrap items-center gap-1.5">{indicators}</div>
    </div>
  );
}
