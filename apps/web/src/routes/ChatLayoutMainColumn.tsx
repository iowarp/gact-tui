/**
 * Main column of the chat layout: topbar + conversation pane. Exports
 * {@link ChatLayoutMainColumn}.
 */
import { Show, type Accessor, type JSX, type Setter } from 'solid-js';
import { Client, type FileDiff } from '@clio/core';
import type { RailRoute } from '../components/LeftRail.js';
import type { SessionRow } from '../components/SessionsColumn.js';
import { TranscriptSearch } from '../components/TranscriptSearch.js';
import { ChatConversationPane } from './ChatConversationPane.js';
import { DiscoveryView } from './DiscoveryView.js';
import type { ChatLayoutProps } from './ChatLayoutTypes.js';
import type { TopbarOverflowController } from './chatTopbarOverflow.js';
import type { TranscriptSearchController } from './chatTranscriptSearch.js';
import type { TranscriptScrollController } from './chatTranscriptScroll.js';

export interface ChatLayoutMainColumnProps {
  props: ChatLayoutProps;
  discoveryClient: Client;
  onChat: Accessor<boolean>;
  railRoute: Accessor<RailRoute>;
  setRailRoute: Setter<RailRoute>;
  topbarOverflow: TopbarOverflowController;
  transcriptSearch: TranscriptSearchController;
  transcriptScroll: TranscriptScrollController;
  activeRow: Accessor<SessionRow | undefined>;
  showSessionsColumn: Accessor<boolean>;
  previewOpen: Accessor<boolean>;
  setPreviewOpen: Setter<boolean>;
  inspectorOpen: Accessor<boolean>;
  setInspectorOpen: Setter<boolean>;
  setSessionsOpen: Setter<boolean>;
  selectedMessageId: Accessor<string>;
  setSelectedMessageId: Setter<string>;
  draftReloadTick: Accessor<number>;
  setPaletteOpen: Setter<boolean>;
  setActiveDiff: Setter<FileDiff | null>;
  renderSecondaryChips: () => JSX.Element;
}

export function ChatLayoutMainColumn(options: ChatLayoutMainColumnProps) {
  return (
    <div class="chat__main-col">
      <Show
        when={options.onChat()}
        fallback={
          <DiscoveryView
            route={options.railRoute()}
            client={options.discoveryClient}
            activeSessionId={options.props.activeId}
            onBackToChat={() => options.setRailRoute('sessions')}
          />
        }
      >
        <TranscriptSearch
          open={options.transcriptSearch.open()}
          query={options.transcriptSearch.query()}
          matchCount={options.transcriptSearch.totalMatches()}
          currentIndex={options.transcriptSearch.currentIndex()}
          onQueryChange={(q) => {
            options.transcriptSearch.setQuery(q);
            options.transcriptSearch.setCurrentIndex(0);
          }}
          onPrev={() => options.transcriptSearch.bumpMatch(-1)}
          onNext={() => options.transcriptSearch.bumpMatch(1)}
          onClose={options.transcriptSearch.close}
        />

        <ChatConversationPane
          backendUrl={options.props.backendUrl}
          voiceCapable={options.props.voiceCapable}
          caps={options.props.caps}
          workspaceClient={options.discoveryClient}
          activeId={options.props.activeId}
          sessions={options.props.sessions}
          selectedWorkspaceId={options.props.selectedWorkspaceId}
          density={options.props.density}
          messages={options.props.messages}
          messagesLoading={options.props.messagesLoading}
          pendingPermission={options.props.pendingPermission}
          pendingQuestion={options.props.pendingQuestion}
          composerDisabled={options.props.composerDisabled}
          streaming={options.props.streaming}
          responseActivity={options.props.responseActivity}
          previewActive={options.previewOpen()}
          transcriptScroll={options.transcriptScroll}
          searchQuery={
            options.transcriptSearch.open() ? options.transcriptSearch.query() : ''
          }
          currentMatchKey={options.transcriptSearch.currentMatchKey()}
          selectedMessageId={options.selectedMessageId()}
          draftReloadTick={options.draftReloadTick()}
          models={options.props.models}
          modelProviders={options.props.modelProviders}
          selectedModelId={options.props.selectedModelId}
          permMode={options.props.permMode}
          executionEvents={options.props.executionEvents}
          semanticEvents={
            options.props.semanticEventsEnabled ? options.props.semanticEvents : undefined
          }
          onSubmit={options.props.onSubmit}
          onStop={options.props.onStop}
          onPermissionDecide={options.props.onPermissionDecide}
          onAnswerQuestion={options.props.onAnswerQuestion}
          onCancelQuestion={options.props.onCancelQuestion}
          onOpenDiff={(diff) => options.setActiveDiff(diff)}
          onSelectMessage={options.setSelectedMessageId}
          onCopyMessage={options.props.onCopyMessage}
          onRegenerate={options.props.onRegenerate}
          onRegenerateWithNotes={options.props.onRegenerateWithNotes}
          onRegenerateWithModel={options.props.onRegenerateWithModel}
          onEditMessage={options.props.onEditMessage}
          onQuoteMessage={options.props.onQuoteMessage}
          onDeleteMessage={options.props.onDeleteMessage}
          onPinFile={options.props.onPinFile}
          onSpeakMessage={options.props.onSpeakMessage}
          onCopyMessagePermalink={options.props.onCopyMessagePermalink}
          onSlashTyped={() => options.setPaletteOpen(true)}
          onOpenCommandPalette={() => options.setPaletteOpen(true)}
          onPickModel={options.props.onPickModel}
          onPickPermMode={options.props.onPickPermMode}
          onOpenSettings={options.props.onOpenSettings}
          onAddRemote={options.props.onAddRemote}
        />
      </Show>
    </div>
  );
}
