import type { PendingInteraction } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRepository } from '@/hooks/use-repository';
import {
  hasUnifiedInteractionCapability,
  respondToLegacyInteraction,
} from '@/lib/pending-interaction-contract';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';

/**
 * Allow or deny one pending permission from outside its conversation (the
 * bell). It answers through the request's own attended conversation, not the
 * open one, so a background conversation's request resolves where it lives.
 */
export function useAttentionResponse() {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { credentialsReady = true, settings } = useConnectionSettings();
  const capabilities = useQuery({
    enabled: credentialsReady,
    queryKey: queryKeys.key('capabilities', settings.endpoint),
    queryFn: ({ signal }) => repository.capabilities(signal),
  });
  const unified = hasUnifiedInteractionCapability(capabilities.data?.capabilities);
  return useMutation({
    mutationFn: ({
      interaction,
      action,
    }: {
      interaction: PendingInteraction;
      action: 'allow' | 'deny';
    }) =>
      unified
        ? repository.respondInteraction(interaction.attended_session_id, interaction.id, {
            action,
          })
        : respondToLegacyInteraction(
            interaction,
            { action },
            {
              answerQuestion: (sessionId, questionId, answer) =>
                repository.answerQuestion(sessionId, questionId, answer),
              cancelQuestion: (sessionId, questionId) =>
                repository.cancelQuestion(sessionId, questionId),
              respondPermission: (permissionId, permissionAction) =>
                repository.respondPermission(permissionId, permissionAction),
              a2uiAction: (sessionId, message, correlation) =>
                repository.a2uiAction(sessionId, message, correlation),
            },
          ),
    onSettled: (_result, _error, { interaction }) =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.pendingInteractions(
            settings.endpoint,
            interaction.attended_session_id,
          ),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.key('pending-approvals', settings.endpoint),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.key('sessions', settings.endpoint),
        }),
      ]),
  });
}
