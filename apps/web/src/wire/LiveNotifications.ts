/**
 * Translates backend lifecycle SSE events (provider swaps/failures, memory
 * changes, etc.) into user-facing toast notifications and refresh signals.
 */
export interface BackendNotification {
  level: 'info' | 'warning' | 'error';
  title: string;
  body?: string;
}

export interface LiveNotificationHooks {
  onNotification?: (n: BackendNotification) => void;
  onMemoryChanged?: () => void;
}

export function applyLiveNotificationEvent(
  type: string | undefined,
  payload: Record<string, unknown>,
  hooks: LiveNotificationHooks,
): boolean {
  switch (type) {
    case 'lm.provider.changed': {
      const providerId = (payload.provider_id as string) ?? 'unknown';
      const modelId = (payload.model_id as string) ?? '';
      hooks.onNotification?.({
        level: 'info',
        title: 'Model swapped',
        body: modelId ? `${providerId} / ${modelId}` : providerId,
      });
      return true;
    }
    case 'lm.provider.failed': {
      const providerId = (payload.provider_id as string) ?? 'unknown';
      const reason = (payload.error as string) ?? (payload.message as string) ?? 'no detail provided';
      hooks.onNotification?.({
        level: 'error',
        title: `${providerId} failed`,
        body: reason,
      });
      return true;
    }
    case 'notification': {
      const level = (payload.level as string) ?? 'info';
      const title = (payload.title as string) ?? 'Notification';
      const body = payload.body as string | undefined;
      hooks.onNotification?.({
        level: level === 'warning' || level === 'error' ? level : 'info',
        title,
        ...(body ? { body } : {}),
      });
      return true;
    }
    case 'session.summarized': {
      const sid = (payload.session_id as string) ?? '';
      hooks.onNotification?.({
        level: 'info',
        title: 'Session summarized',
        body: sid
          ? `${sid.slice(0, 8)} — older turns rolled into a summary.`
          : 'Older turns rolled into a summary.',
      });
      return true;
    }
    case 'session.compacted': {
      const sid = (payload.session_id as string) ?? '';
      const archived = (payload.archived_count as number) ?? (payload.removed_count as number) ?? 0;
      hooks.onNotification?.({
        level: 'info',
        title: 'Session compacted',
        body: `${sid.slice(0, 8)} — archived ${archived} message${archived === 1 ? '' : 's'} into a summary.`,
      });
      return true;
    }
    case 'subagent.started': {
      const agentName = (payload.agent_name as string) ?? (payload.agent_id as string) ?? 'sub-agent';
      const task = payload.task as string | undefined;
      hooks.onNotification?.({
        level: 'info',
        title: `Sub-agent started: ${agentName}`,
        ...(task ? { body: task } : {}),
      });
      return true;
    }
    case 'subagent.completed': {
      const agentName = (payload.agent_name as string) ?? (payload.agent_id as string) ?? 'sub-agent';
      const status = (payload.status as string) ?? 'completed';
      hooks.onNotification?.({
        level: status === 'error' || status === 'failed' ? 'error' : 'info',
        title: `Sub-agent ${status}: ${agentName}`,
      });
      return true;
    }
    case 'memory.search.completed': {
      const hitCount = (payload.hit_count as number) ?? (payload.hits as unknown[] | undefined)?.length ?? 0;
      hooks.onMemoryChanged?.();
      hooks.onNotification?.({
        level: 'info',
        title: 'Memory search complete',
        body: `${hitCount} hit${hitCount === 1 ? '' : 's'}.`,
      });
      return true;
    }
    case 'turn.retry_requested': {
      const reason = (payload.reason as string) ?? (payload.message as string) ?? 'retrying the last turn';
      hooks.onNotification?.({
        level: 'warning',
        title: 'Turn retry requested',
        body: reason,
      });
      return true;
    }
    case 'turn.retry_running': {
      hooks.onNotification?.({
        level: 'info',
        title: 'Retry running',
        body: 'Re-running the turn…',
      });
      return true;
    }
    case 'turn.retry_completed': {
      hooks.onNotification?.({
        level: 'info',
        title: 'Retry completed',
        body: 'The retried turn finished.',
      });
      return true;
    }
    case 'turn.retry_failed': {
      const reason = (payload.warning as string) ?? (payload.message as string) ?? 'the retry failed';
      hooks.onNotification?.({ level: 'error', title: 'Retry failed', body: reason });
      return true;
    }
    case 'turn.retry_cancelled': {
      hooks.onNotification?.({
        level: 'warning',
        title: 'Retry cancelled',
        body: 'The retry was cancelled.',
      });
      return true;
    }
    default:
      return false;
  }
}
