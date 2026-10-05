import {
  attentionEvidenceInspectionSchema,
  type ActionCardAction,
  type SubagentRun,
} from '@clio/core/v3';
import { useMutation } from '@tanstack/react-query';
import { useLayoutEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { agentTaskToSubagent } from '@/lib/session-agent-tasks';
import { attentionEvidenceHash } from '@/lib/attention-evidence-navigation';
import { connectionScope } from '@/lib/connection-scope';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useRepository } from './use-repository';

/** Resolve findings on their owning connection and keep the reviewer beside the transcript. */
export function useActionCard(
  sessionId: string,
  workspaceId: string,
  openSubagent?: (subagent: SubagentRun, target: 'canvas') => void,
) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const navigate = useNavigate();
  const scope = `${connectionScope(settings)}:${sessionId}`;
  const current = useRef(scope);
  useLayoutEffect(() => {
    current.current = scope;
    return () => {
      current.current = '';
    };
  }, [scope]);
  return useMutation({
    mutationFn: async (action: ActionCardAction) => {
      const { behavior } = action;
      if (
        !action.enabled ||
        !behavior.handle_id ||
        !['focus_session', 'inspect_attention'].includes(behavior.kind)
      ) {
        throw new Error(behavior.reason || 'This action is not available.');
      }
      const parsed =
        behavior.kind === 'inspect_attention'
          ? attentionEvidenceInspectionSchema.safeParse(behavior.inspection)
          : undefined;
      if (parsed && !parsed.success)
        throw new Error('This finding has no valid attention evidence receipt.');
      const inspection = parsed?.data;
      if (inspection?.selections.some((ref) => ref.session_id !== sessionId)) {
        throw new Error('This evidence belongs to another conversation.');
      }
      const task = await repository.agentTask(behavior.handle_id);
      if (current.current !== scope) throw new Error('The connection or conversation changed.');
      if (task.parent_session_id !== sessionId || !task.child_session_id) {
        throw new Error('This reviewer does not belong to this conversation.');
      }
      return { task, inspection, scope };
    },
    onSuccess: ({ task, inspection, scope: resolvedScope }) => {
      if (current.current !== resolvedScope) return;
      if (openSubagent) openSubagent(agentTaskToSubagent(task), 'canvas');
      else if (!inspection)
        void navigate(`/workspaces/${workspaceId}/sessions/${task.child_session_id}`);
      if (inspection) {
        window.location.hash = attentionEvidenceHash(
          inspection.selections[0]!,
          inspection.profile_revision,
          inspection,
        );
        // Hash-only evidence navigation also works when the same finding is
        // reopened after changing the displayed profile or selection.
        window.dispatchEvent(new Event('clio:inspect-attention'));
      }
    },
  });
}
