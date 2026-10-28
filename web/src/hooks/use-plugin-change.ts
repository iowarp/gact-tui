import {
  pluginChangeCompactionError,
  type AgentDelta,
  type PluginChangeApply,
  type SessionAgent,
} from '@clio/core/v3';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { useRepository } from '@/hooks/use-repository';
import { useSessionAgent } from '@/hooks/use-session-agent';
import { useSessionMessageCount } from '@/hooks/use-session-message-count';

/** One change to the conversation's plugins or agent, before the person confirms it. */
export interface PluginChange {
  /** The session's next whole delta. */
  delta?: AgentDelta;
  /** The agent to switch to. */
  ref?: string;
  /** The change in one sentence, e.g. "Adds hdf5 to this conversation." */
  summary: string;
  /** The toast once it applied, e.g. "Added hdf5". */
  success: string;
  /** The toast when the service refused it, e.g. "hdf5 was not added". */
  failure: string;
  /** The plugin being removed: the dialog shows everything that leaves with it. */
  removing?: string;
}

const NOTE_APPLIED =
  'Sent to the agent as an injection. Its system prompt changes at the next compaction.';

function report(change: PluginChange, mode: PluginChangeApply, result: SessionAgent) {
  if (mode === 'note') {
    toast.success(change.success, { description: NOTE_APPLIED });
    return;
  }
  if (mode === 'compact') {
    const failure = pluginChangeCompactionError(result.compaction);
    if (failure !== undefined) {
      toast.warning('The compaction failed', {
        description: `${change.success}, but the conversation was not compacted (${failure}). The change was sent as an injection instead and joins the system prompt at the next compaction.`,
        duration: 12_000,
      });
      return;
    }
    toast.success(change.success, {
      description: result.compaction?.compacted
        ? 'The conversation was compacted and the change went in with it.'
        : 'There was nothing to compact, so the change applies from the next call.',
    });
    return;
  }
  toast.success(change.success);
}

/**
 * Every change to the conversation's plugins or agent goes through here. It
 * rewrites the system prompt, which invalidates the provider's prompt cache,
 * so once the conversation has messages the person picks how the change
 * reaches the model (`apply`) in the warning dialog; nothing is preselected.
 * A conversation with no messages has nothing cached, so a change applies at
 * once, unless it is a removal, whose cascade the person still confirms.
 */
export function usePluginChange(sessionId: string) {
  const repository = useRepository();
  const session = useSessionAgent(sessionId);
  const { agent, update } = session;
  const cached = useSessionMessageCount(sessionId) > 0;
  const [change, setChange] = useState<PluginChange>();
  const [applying, setApplying] = useState<PluginChangeApply>();
  const preview = useMutation({
    mutationFn: (plugin: string) =>
      repository.previewPluginRemoval({
        ref: agent.data!.resolution.agent.ref,
        plugin,
        delta: agent.data!.delta,
      }),
  });

  const close = () => {
    setChange(undefined);
    preview.reset();
  };
  const apply = (next: PluginChange, mode: PluginChangeApply) => {
    setApplying(mode);
    update.mutate(
      { delta: next.delta, ref: next.ref, apply: mode },
      {
        onSuccess: (result) => report(next, mode, result),
        onError: (error) => toast.error(next.failure, { description: error.message }),
        onSettled: () => {
          setApplying(undefined);
          close();
        },
      },
    );
  };
  const propose = (next: PluginChange) => {
    if (!cached && !next.removing) {
      apply(next, 'now');
      return;
    }
    setChange(next);
    if (next.removing) preview.mutate(next.removing);
  };

  return {
    ...session,
    propose,
    dialog: {
      change,
      cached,
      preview: preview.data?.plugin === change?.removing ? preview.data : undefined,
      previewPending: preview.isPending,
      previewError: preview.error?.message,
      applying,
      onChoose: (mode: PluginChangeApply) => {
        if (change && !applying) apply(change, mode);
      },
      onCancel: () => {
        if (!applying) close();
      },
    },
  };
}
