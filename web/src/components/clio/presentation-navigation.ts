import { createContext } from 'react';
import type { Artifact } from '@clio/core/v3';
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
  | 'onOpenTasks'
  | 'onOpenWebPage'
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
    /**
     * Where an artifact's bytes sit beside this page (an offline export carries them as
     * files). An image with an address here is shown from it directly: a page opened
     * from disk cannot read its own files through the transport.
     */
    artifactHref?: (artifact: Artifact) => string | undefined;
  };
export const PresentationNavigation = createContext<Navigation | null>(null);
