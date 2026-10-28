import { createContext } from 'react';
import type { ClioConversationProps } from './conversation-types';

type Navigation = Pick<
  ClioConversationProps,
  | 'artifacts'
  | 'resources'
  | 'subagents'
  | 'onOpenArtifact'
  | 'onOpenResource'
  | 'onOpenFile'
  | 'onOpenFolder'
  | 'onOpenFileReference'
  | 'onOpenWork'
  | 'onOpenSubagent'
  | 'onOpenFlow'
> &
  Partial<
    Pick<
      ClioConversationProps,
      | 'surfaces'
      | 'tools'
      | 'workspaceId'
      | 'sessionId'
      | 'messages'
      | 'interactions'
      | 'onInteractionResponse'
    >
  > & {
    /**
     * Whether a folder path can be opened here (an export opens only the folders
     * it includes). Without it, every folder opens when `onOpenFolder` is set.
     */
    folderAvailable?: (path: string) => boolean;
    /** The folder a session worked in, in an isolated run, where this surface records it. */
    nodeFolder?: (sessionId: string) => string | undefined;
    /**
     * Open another session's conversation by id, where this surface carries it
     * (an export opens only the sessions it includes, as `sessionAvailable`
     * says). Session links use it when no subagent record resolves them.
     */
    onOpenSession?: (sessionId: string) => void;
    sessionAvailable?: (sessionId: string) => boolean;
  };
export const PresentationNavigation = createContext<Navigation | null>(null);
