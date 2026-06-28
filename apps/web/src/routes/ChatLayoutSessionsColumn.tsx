/**
 * Sessions column of the chat layout: the sidebar session list. Exports
 * {@link ChatLayoutSessionsColumn}.
 */
import { Show, type Accessor, type Setter } from 'solid-js';
import { Client } from '@clio/core';
import { SessionsColumn } from '../components/SessionsColumn.js';
import type { ChatLayoutProps } from './ChatLayoutTypes.js';

export interface ChatLayoutSessionsColumnProps {
  props: ChatLayoutProps;
  discoveryClient: Client;
  showSessionsColumn: Accessor<boolean>;
  connectionTone: Accessor<'ok' | 'warn' | 'err' | 'idle'>;
  isNarrowViewport: () => boolean;
  selectFromSessionsColumn: (id: string) => void;
  openSessionSemanticsPicker: () => void;
  setSessionsOpen: Setter<boolean>;
}

export function ChatLayoutSessionsColumn(options: ChatLayoutSessionsColumnProps) {
  return (
    <Show when={options.showSessionsColumn()}>
      <SessionsColumn
        rows={options.props.sessions}
        loading={options.props.sessionsLoading}
        activeId={options.props.activeId}
        onSelect={options.selectFromSessionsColumn}
        onNewSession={options.openSessionSemanticsPicker}
        connectionLabel={options.props.sseStatus ?? 'idle'}
        connectionTone={options.connectionTone()}
        workspaces={options.props.workspaces}
        selectedWorkspaceId={options.props.selectedWorkspaceId}
        onPickWorkspace={options.props.onPickWorkspace}
        onRefresh={options.props.onRefreshSessions}
        onImportSession={options.props.onImportSession}
        onRenameSession={options.props.onRenameSession}
        onDeleteSession={options.props.onDeleteSession}
        onExportSession={options.props.onExportSession}
        onShareSession={options.props.onShareSession}
        onForkSession={options.props.onForkSession}
        onTogglePin={options.props.onTogglePin}
        onOpenSettings={() => {
          if (options.isNarrowViewport()) {
            options.setSessionsOpen(false);
          }
          options.props.onOpenSettings?.();
        }}
        onCollapse={() => options.setSessionsOpen(false)}
        archivedClient={options.discoveryClient}
      />
    </Show>
  );
}
