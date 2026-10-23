import {
  emptyAgentDelta,
  promptBasisSchema,
  type AgentDelta,
  type PluginChangeApply,
  type SessionAgent,
} from '@clio/core/v3';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { useRepository } from '@/hooks/use-repository';
import { useAgentPluginsSupported } from '@/hooks/use-session-agent';
import type { PluginChange } from '@/hooks/use-plugin-change';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';

/** The agent a new conversation will start with, and its plugin changes so far. */
export interface DraftAgent {
  ref: string;
  delta: AgentDelta;
}

const NO_BASIS = promptBasisSchema.parse({});

/**
 * `usePluginChange` for a conversation that does not exist yet. The agent is
 * resolved with the draft's changes without pinning anything, a removal still
 * shows everything that leaves with it before it applies, and the changes are
 * applied when the first message creates the conversation. Nothing is cached
 * yet, so a change never asks how it reaches the model.
 */
export function useDraftAgentChange(draft: DraftAgent, onChange: (next: DraftAgent) => void) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const supported = useAgentPluginsSupported();
  const resolution = useQuery({
    queryKey: queryKeys.key(
      'agent-draft',
      settings.endpoint,
      draft.ref,
      draft.delta.add.join(','),
      draft.delta.remove.join(','),
    ),
    enabled: Boolean(draft.ref) && supported === true,
    queryFn: ({ signal }) => repository.resolveAgent(draft.ref, draft.delta, signal),
    placeholderData: (previous) => previous,
  });
  const data: SessionAgent | undefined = resolution.data
    ? {
        session_id: '',
        delta: draft.delta,
        subagent: false,
        resolution: resolution.data,
        prompt_basis: NO_BASIS,
      }
    : undefined;
  const agent = { ...resolution, data };
  const [change, setChange] = useState<PluginChange>();
  const preview = useMutation({
    mutationFn: (plugin: string) =>
      repository.previewPluginRemoval({ ref: draft.ref, plugin, delta: draft.delta }),
  });
  // Changes are local until the conversation exists; these keep the panel's interface.
  const update = useMutation({
    mutationFn: async (input: { delta?: AgentDelta; ref?: string }) => {
      onChange({ ref: input.ref ?? draft.ref, delta: input.delta ?? emptyAgentDelta });
    },
  });
  const compact = useMutation({ mutationFn: async () => ({ compacted: false }) });
  const close = () => {
    setChange(undefined);
    preview.reset();
  };
  const apply = (next: PluginChange) =>
    update.mutate(
      { delta: next.delta, ref: next.ref },
      {
        onSuccess: () => toast.success(next.success),
        onSettled: close,
      },
    );
  const propose = (next: PluginChange) => {
    if (!next.removing) {
      apply(next);
      return;
    }
    setChange(next);
    preview.mutate(next.removing);
  };

  return {
    supported,
    agent,
    update,
    compact,
    propose,
    dialog: {
      change,
      cached: false,
      preview: preview.data?.plugin === change?.removing ? preview.data : undefined,
      previewPending: preview.isPending,
      previewError: preview.error?.message,
      applying: undefined as PluginChangeApply | undefined,
      onChoose: () => {
        if (change) apply(change);
      },
      onCancel: close,
    },
  };
}
