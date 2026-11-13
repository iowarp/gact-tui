import {
  BoxesIcon,
  ClipboardPenLineIcon,
  MessageCircleQuestionIcon,
  ShieldQuestionIcon,
} from 'lucide-react';
import { HelpIcon } from '@/lib/icon-vocabulary';
import { Badge } from '@/components/ui/badge';
import { PROTOCOL } from '@/lib/brand-vocabulary';
import type { SessionAttention } from '@/lib/session-attention';
import { plural, t } from '@lingui/core/macro';

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
  const unknownCount = attention.unknownIds.length;
  const protocol = PROTOCOL.a2ui;
  const indicators = (
    <>
      {permissionCount ? (
        <Badge variant="outline">
          <ShieldQuestionIcon aria-hidden="true" data-icon="inline-start" />
          {plural(permissionCount, { 1: 'Approval', other: '# approvals' })}
        </Badge>
      ) : null}
      {questionCount ? (
        <Badge variant="outline">
          <MessageCircleQuestionIcon aria-hidden="true" data-icon="inline-start" />
          {plural(questionCount, { 1: 'Question', other: '# questions' })}
        </Badge>
      ) : null}
      {taskInputCount ? (
        <Badge variant="outline">
          <ClipboardPenLineIcon aria-hidden="true" data-icon="inline-start" />
          {plural(taskInputCount, { 1: 'Task input', other: '# task inputs' })}
        </Badge>
      ) : null}
      {a2uiCount ? (
        <Badge variant="outline">
          <BoxesIcon aria-hidden="true" data-icon="inline-start" />
          {plural(a2uiCount, { 1: `${protocol} surface`, other: `# ${protocol} surfaces` })}
        </Badge>
      ) : null}
      {unknownCount ? (
        <Badge
          title={t`This version of the app has no surface for this request. Update to respond to it.`}
          variant="outline"
        >
          <HelpIcon aria-hidden="true" data-icon="inline-start" />
          {plural(unknownCount, { 1: 'Unrecognized request', other: '# unrecognized requests' })}
        </Badge>
      ) : null}
    </>
  );

  if (!showResponseLabel) {
    return <div className="flex min-w-0 flex-wrap items-center gap-1.5">{indicators}</div>;
  }

  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <span className="text-xs font-medium">{t`Response needed`}</span>
      <div className="flex flex-wrap items-center gap-1.5">{indicators}</div>
    </div>
  );
}
