/**
 * Derives ChatLayout's computed view state (memoized selectors) from its
 * props/services. Exports {@link createChatLayoutDerivedState}.
 */
import { createMemo, type Accessor, type JSX, type Setter } from 'solid-js';
import { summarizeToolCalls } from '../components/InspectorDrawer.js';
import type { RailRoute } from '../components/LeftRail.js';
import { ChatSecondaryChips } from './ChatSecondaryChips.js';
import type { ChatLayoutProps } from './ChatLayoutTypes.js';
import {
  connectionToneForStatus,
  inspectorTargetMessage,
  previewWorkspaceIdForSession,
  shouldShowSessionsColumn,
} from './chatLayoutSelectionModel.js';

export interface ChatLayoutDerivedStateOptions {
  props: ChatLayoutProps;
  railRoute: Accessor<RailRoute>;
  sessionsOpen: Accessor<boolean>;
  selectedMessageId: Accessor<string>;
  setSessionsOpen: Setter<boolean>;
}

export function createChatLayoutDerivedState(options: ChatLayoutDerivedStateOptions) {
  const activeRow = () =>
    options.props.sessions.find((session) => session.id === options.props.activeId);
  const inspectorTarget = createMemo(() =>
    inspectorTargetMessage(options.props.messages, options.selectedMessageId()),
  );

  const toolCallsForInspector = createMemo(() => {
    const message = inspectorTarget();
    if (!message) return [];
    return summarizeToolCalls(message);
  });

  function connectionTone(): 'ok' | 'warn' | 'err' | 'idle' {
    return connectionToneForStatus(options.props.sseStatus);
  }

  const onChat = () => options.railRoute() === 'sessions';
  const showSessionsColumn = () =>
    shouldShowSessionsColumn({
      railRoute: options.railRoute(),
      sessionsOpen: options.sessionsOpen(),
      sessionsLoading: options.props.sessionsLoading,
      sessionCount: options.props.sessions.length,
      activeId: options.props.activeId,
    });
  const previewWorkspaceId = createMemo(() =>
    previewWorkspaceIdForSession({
      sessions: options.props.sessions,
      activeId: options.props.activeId,
      selectedWorkspaceId: options.props.selectedWorkspaceId,
    }),
  );

  const emptyTranscript = () =>
    options.props.messages.length === 0 &&
    !options.props.pendingPermission &&
    !options.props.pendingQuestion;
  const isNarrowViewport = () =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches;
  const selectFromSessionsColumn = (id: string) => {
    options.props.onSelect(id);
    if (isNarrowViewport()) {
      options.setSessionsOpen(false);
    }
  };
  const secondaryChips = (): JSX.Element => (
    <ChatSecondaryChips
      sessionCostUsd={options.props.sessionCostUsd}
      sessionTokens={options.props.sessionTokens}
      lastStopReason={options.props.lastStopReason}
      streamStats={options.props.streamStats}
      selectedModelId={options.props.selectedModelId}
      models={options.props.models}
      permMode={options.props.permMode}
      onOpenSettings={options.props.onOpenSettings}
      onPickPermMode={options.props.onPickPermMode}
    />
  );

  return {
    activeRow,
    inspectorTarget,
    toolCallsForInspector,
    connectionTone,
    onChat,
    showSessionsColumn,
    previewWorkspaceId,
    emptyTranscript,
    isNarrowViewport,
    selectFromSessionsColumn,
    secondaryChips,
  };
}
