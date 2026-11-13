import { createContext, useMemo } from 'react';
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
  | 'onOpenToolCall'
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

// Only the navigation fields, so a parent render that leaves them unchanged does not
// re-render every row's context consumers (links, hover cards, variant runs). The
// messages change with each streamed chunk, so the live transcript carries them in
// TranscriptMessagesContext instead; an export may still pass them here.
export function usePresentationNavigation({
  artifacts,
  interactions,
  onInteractionResponse,
  onOpenArtifact,
  onOpenFile,
  onOpenFileReference,
  onOpenFlow,
  onOpenFolder,
  onOpenResource,
  onOpenSubagent,
  onOpenTasks,
  onOpenToolCall,
  onOpenWebPage,
  onOpenWork,
  resources,
  sessionId,
  subagents,
  surfaces,
  tools,
  workspaceId,
}: ClioConversationProps): Navigation {
  return useMemo(
    () => ({
      artifacts,
      interactions,
      onInteractionResponse,
      onOpenArtifact,
      onOpenFile,
      onOpenFileReference,
      onOpenFlow,
      onOpenFolder,
      onOpenResource,
      onOpenSubagent,
      onOpenTasks,
      onOpenToolCall,
      onOpenWebPage,
      onOpenWork,
      resources,
      sessionId,
      subagents,
      surfaces,
      tools,
      workspaceId,
    }),
    [
      artifacts,
      interactions,
      onInteractionResponse,
      onOpenArtifact,
      onOpenFile,
      onOpenFileReference,
      onOpenFlow,
      onOpenFolder,
      onOpenResource,
      onOpenSubagent,
      onOpenTasks,
      onOpenToolCall,
      onOpenWebPage,
      onOpenWork,
      resources,
      sessionId,
      subagents,
      surfaces,
      tools,
      workspaceId,
    ],
  );
}
