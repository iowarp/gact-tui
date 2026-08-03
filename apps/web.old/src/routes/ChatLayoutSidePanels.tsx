/**
 * Side panels of the chat layout: the inspector/diff panels. Exports
 * {@link ChatLayoutSidePanels}.
 */
import { Show, type Accessor, type Setter } from 'solid-js';
import { Client, type FileDiff, type Message } from '@clio/core';
import { InspectorDrawer, type ToolCallSummary } from '../components/InspectorDrawer.js';
import { PreviewRail } from '../components/PreviewRail.js';
import type { ChatLayoutProps } from './ChatLayoutTypes.js';

export interface ChatLayoutSidePanelsProps {
  props: ChatLayoutProps;
  discoveryClient: Client;
  onChat: Accessor<boolean>;
  inspectorOpen: Accessor<boolean>;
  setInspectorOpen: Setter<boolean>;
  previewOpen: Accessor<boolean>;
  setPreviewOpen: Setter<boolean>;
  previewPath: Accessor<string | undefined>;
  setPreviewPath: Setter<string | undefined>;
  previewWorkspaceId: Accessor<string | undefined>;
  inspectorTarget: Accessor<Message | null>;
  toolCallsForInspector: Accessor<ToolCallSummary[]>;
  setActiveDiff: Setter<FileDiff | null>;
}

export function ChatLayoutSidePanels(options: ChatLayoutSidePanelsProps) {
  return (
    <>
      <Show when={options.onChat() && options.inspectorOpen()}>
        <InspectorDrawer
          open
          message={options.inspectorTarget()}
          toolCalls={options.toolCallsForInspector()}
          costUsd={options.props.sessionCostUsd ?? 0}
          tokens={options.inspectorTarget()?.tokens}
          model={options.inspectorTarget()?.model?.model_id}
          tasks={options.props.sessionTasks}
          contextFiles={options.props.contextFiles}
          attempts={options.props.attempts}
          onPreviewContextFile={
            options.props.inspectorActions.onPreviewContextFile
              ? (path) => {
                  // Mirror the click into the side-by-side rail while still
                  // returning bytes for the Inspector's inline preview.
                  options.setPreviewPath(path);
                  options.setPreviewOpen(true);
                  return options.props.inspectorActions.onPreviewContextFile!(path);
                }
              : undefined
          }
          frames={options.props.contextFrames ?? []}
          onLoadFrameDetail={options.props.inspectorActions.onLoadFrameDetail}
          onCycleTaskStatus={options.props.inspectorActions.onCycleTaskStatus}
          sessionDiffs={options.props.sessionDiffs ?? []}
          onApplyAllDiffs={options.props.inspectorActions.onApplyAllDiffs}
          onRejectAllDiffs={options.props.inspectorActions.onRejectAllDiffs}
          schedules={options.props.schedules ?? []}
          onCreateSchedule={options.props.inspectorActions.onCreateSchedule}
          onDeleteSchedule={options.props.inspectorActions.onDeleteSchedule}
          bindings={options.props.sessionBindings}
          onSetBlueprint={options.props.inspectorActions.onSetBlueprint}
          onSetExpertPack={options.props.inspectorActions.onSetExpertPack}
          semanticEvents={options.props.semanticEvents}
          semanticEventsEnabled={options.props.semanticEventsEnabled}
          onRemoveContextFile={options.props.inspectorActions.onRemoveContextFile}
          onCycleContextFileMode={options.props.inspectorActions.onCycleContextFileMode}
          onOpenDiff={(d) => options.setActiveDiff(d)}
          onClose={() => options.setInspectorOpen(false)}
        />
      </Show>

      <Show when={options.onChat() && options.previewOpen()}>
        <PreviewRail
          client={options.discoveryClient}
          workspaceId={options.previewWorkspaceId()}
          externalPath={options.previewPath}
          onClose={() => options.setPreviewOpen(false)}
        />
      </Show>
    </>
  );
}
