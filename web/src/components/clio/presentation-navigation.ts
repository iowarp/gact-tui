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
  | 'onOpenWork'
  | 'onOpenSubagent'
>;
export const PresentationNavigation = createContext<Navigation | null>(null);
