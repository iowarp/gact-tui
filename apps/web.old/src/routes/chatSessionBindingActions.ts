/**
 * Action factory for editing a session's blueprint/expert bindings. Exports
 * {@link createChatSessionBindingActions}.
 */
import type { Accessor } from 'solid-js';
import type { Client } from '@clio/core';

export interface ChatSessionBindingActionsOptions {
  activeId: Accessor<string>;
  client: Pick<Client, 'setSessionBlueprint' | 'setSessionExpertPack'>;
  failToast: (title: string, error: unknown, retry?: () => void) => void;
  refetchBindings: () => unknown;
}

export function createChatSessionBindingActions(options: ChatSessionBindingActionsOptions) {
  async function bindBlueprint(blueprintId: string | null) {
    const sid = options.activeId();
    if (!sid) return;
    try {
      await options.client.setSessionBlueprint(sid, { blueprint_id: blueprintId });
      void options.refetchBindings();
    } catch (error) {
      options.failToast('Could not bind blueprint', error, () => void bindBlueprint(blueprintId));
    }
  }

  async function bindExpertPack(packId: string | null) {
    const sid = options.activeId();
    if (!sid) return;
    try {
      await options.client.setSessionExpertPack(sid, { pack_id: packId });
      void options.refetchBindings();
    } catch (error) {
      options.failToast('Could not bind expert pack', error, () => void bindExpertPack(packId));
    }
  }

  return {
    bindBlueprint,
    bindExpertPack,
  };
}
