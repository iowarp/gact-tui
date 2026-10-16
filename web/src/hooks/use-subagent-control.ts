import type { AsyncProcess } from '@clio/core/v3';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useRepository } from './use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { queryKeys } from '@/lib/query-keys';

export function useSubagentControl(sessionId: string) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  return useCallback(
    async (task: AsyncProcess, action: 'pause' | 'resume' | 'restart') => {
      await repository.controlSubagent(sessionId, task.handle ?? task.handle_id ?? task.id, action);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.sessionObservability(settings.endpoint, sessionId),
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.key('tasks', settings.endpoint) });
    },
    [repository, sessionId, queryClient, settings.endpoint],
  );
}
