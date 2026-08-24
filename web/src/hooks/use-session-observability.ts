import { useQuery } from '@tanstack/react-query';
import { useRepository } from './use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';

export function sessionObservabilityQueryKey(endpoint: string, sessionId: string) {
  return ['session-observability', endpoint, sessionId] as const;
}

/** Session-scoped work, evidence, and retained-context snapshots. */
export function useSessionObservability(sessionId: string) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const baseKey = sessionObservabilityQueryKey(settings.endpoint, sessionId);
  const enabled = Boolean(sessionId);

  const diffs = useQuery({
    queryKey: [...baseKey, 'diffs'],
    queryFn: ({ signal }) => repository.sessionDiffs(sessionId, signal),
    enabled,
  });
  const contextFiles = useQuery({
    queryKey: [...baseKey, 'context-files'],
    queryFn: ({ signal }) => repository.contextFiles(sessionId, signal),
    enabled,
  });
  const contextFrames = useQuery({
    queryKey: [...baseKey, 'context-frames'],
    queryFn: ({ signal }) => repository.contextFrames(sessionId, signal),
    enabled,
  });
  const processes = useQuery({
    queryKey: [...baseKey, 'processes'],
    queryFn: ({ signal }) => repository.asyncProcesses(sessionId, signal),
    enabled,
  });

  const iterations = useQuery({
    queryKey: [...baseKey, 'agent-iterations'],
    queryFn: ({ signal }) => repository.agentIterations(sessionId, signal),
    enabled,
  });

  return { contextFiles, contextFrames, diffs, iterations, processes };
}
