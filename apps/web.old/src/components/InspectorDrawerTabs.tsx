/**
 * Renders the Inspector drawer's tab strip and dispatches the active tab to its
 * concrete tab component (run info, timeline, tools, diffs, frames, ...).
 */
import { For, Show } from 'solid-js';
import { AttemptsTab } from './InspectorAttempts.js';
import { BindingsTab } from './InspectorBindings.js';
import { ContextFilesTab } from './InspectorContextFiles.js';
import { DiffsTab } from './InspectorDiffs.js';
import { FramesTab } from './InspectorFrames.js';
import { IntegrationsTab } from './InspectorIntegrations.js';
import { RunInfoTab } from './InspectorRunInfo.js';
import { SchedulesTab } from './InspectorSchedules.js';
import { TasksTab } from './InspectorTasks.js';
import { ThinkingTab } from './InspectorThinking.js';
import { TimelineTab } from './InspectorTimelineTab.js';
import { ToolCallsTab } from './InspectorToolCalls.js';
import type { SemanticTurnGroup } from './InspectorTimeline.js';
import type { InspectorDrawerProps, InspectorTab } from './InspectorDrawerTypes.js';
import {
  INSPECTOR_TAB_LABEL,
  type InspectorContentState,
} from './InspectorDrawerModel.js';
import type { FileDiff } from '@clio/core';

export function InspectorTabList(props: {
  tabs: readonly InspectorTab[];
  activeTab: InspectorTab;
  onPickTab: (tab: InspectorTab) => void;
}) {
  return (
    <nav class="inspector__tabs" role="tablist" aria-label="Inspector sections">
      <For each={props.tabs}>
        {(tab) => (
          <button
            type="button"
            role="tab"
            aria-selected={props.activeTab === tab}
            class={'inspector__tab ' + (props.activeTab === tab ? 'is-active' : '')}
            data-testid={`inspector-tab-${tab}`}
            onClick={() => props.onPickTab(tab)}
          >
            {INSPECTOR_TAB_LABEL[tab]}
          </button>
        )}
      </For>
    </nav>
  );
}

export function InspectorActiveTabPanel(props: {
  drawer: InspectorDrawerProps;
  contentState: InspectorContentState;
  activeTab: InspectorTab;
  semanticGroups: SemanticTurnGroup[];
  turnDiffs: FileDiff[];
}) {
  const drawer = () => props.drawer;
  const content = () => props.contentState;
  const active = () => props.activeTab;

  return (
    <>
      <Show when={content().hasRunData && active() === 'turn'}>
        <RunInfoTab
          message={drawer().message}
          model={drawer().model}
          tokens={drawer().tokens}
          costUsd={drawer().costUsd}
        />
      </Show>

      <Show when={content().hasTimeline && active() === 'timeline'}>
        <TimelineTab message={drawer().message} semanticGroups={props.semanticGroups} />
      </Show>

      <Show when={drawer().toolCalls.length > 0 && active() === 'tools'}>
        <ToolCallsTab summaries={drawer().toolCalls} message={drawer().message} />
      </Show>

      <Show when={content().hasThinking && active() === 'thinking'}>
        <ThinkingTab message={drawer().message} />
      </Show>

      <Show when={content().hasDiffs && active() === 'diffs'}>
        <DiffsTab
          turnDiffs={props.turnDiffs}
          sessionDiffs={drawer().sessionDiffs}
          onOpenDiff={drawer().onOpenDiff}
          onApplyAllDiffs={drawer().onApplyAllDiffs}
          onRejectAllDiffs={drawer().onRejectAllDiffs}
        />
      </Show>

      <Show when={content().hasFrames && active() === 'frames'}>
        <FramesTab frames={drawer().frames!} onLoadDetail={drawer().onLoadFrameDetail} />
      </Show>

      <Show when={content().hasTasks && active() === 'tasks'}>
        <TasksTab tasks={drawer().tasks!} onCycleTaskStatus={drawer().onCycleTaskStatus} />
      </Show>

      <Show when={content().hasAttempts && active() === 'attempts'}>
        <AttemptsTab attempts={drawer().attempts!} />
      </Show>

      <Show when={content().hasContextFiles && active() === 'context'}>
        <ContextFilesTab
          files={drawer().contextFiles!}
          onPreviewContextFile={drawer().onPreviewContextFile}
          onRemoveContextFile={drawer().onRemoveContextFile}
          onCycleContextFileMode={drawer().onCycleContextFileMode}
        />
      </Show>

      <Show when={content().hasSchedules && active() === 'schedules'}>
        <SchedulesTab
          schedules={drawer().schedules ?? []}
          onCreate={drawer().onCreateSchedule}
          onDelete={drawer().onDeleteSchedule}
        />
      </Show>

      <Show when={content().hasBindings && active() === 'bindings'}>
        <BindingsTab
          bindings={drawer().bindings!}
          onSetBlueprint={drawer().onSetBlueprint}
          onSetExpertPack={drawer().onSetExpertPack}
        />
      </Show>

      <Show when={content().hasIntegrations && active() === 'health'}>
        <IntegrationsTab integrations={drawer().integrations!} />
      </Show>
    </>
  );
}
