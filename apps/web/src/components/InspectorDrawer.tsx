/**
 * The Inspector side drawer shell: resolves which tabs have content for the
 * selected message and renders the tab list plus the active tab panel.
 */
import { createMemo, createSignal, Show } from 'solid-js';
import { brand } from '@brand';
import { Icon } from './Icon.js';
import { createPersistedString } from '../persisted.js';
import { groupSemanticEvents, type SemanticTurnGroup } from './InspectorTimeline.js';
import type { InspectorDrawerProps, InspectorTab } from './InspectorDrawerTypes.js';
import { InspectorActiveTabPanel, InspectorTabList } from './InspectorDrawerTabs.js';
import {
  availableInspectorTabs,
  inspectorContentState,
  inspectorHasAnyContent,
  messageFileDiffParts,
  resolveInspectorTab,
  type InspectorContentState,
} from './InspectorDrawerModel.js';
import './inspector-drawer.css';

export type { InspectorDrawerProps, InspectorTab } from './InspectorDrawerTypes.js';
export type { BindingOption, PackagedProvenance, SessionBindings } from './InspectorBindings.js';
export type { ContextFrameRow } from './InspectorFrames.js';
export { assembleTimeline, groupSemanticEvents } from './InspectorTimeline.js';
export type { SemanticTimelineRow, SemanticTurnGroup, TimelineEvent } from './InspectorTimeline.js';
export type { SessionDiffRow } from './InspectorDiffs.js';
export type { IntegrationStatus } from './InspectorIntegrations.js';
export type { ScheduleRow } from './InspectorSchedules.js';
export { summarizeToolCalls } from './InspectorToolCalls.js';
export type { ToolCallSummary } from './InspectorToolCalls.js';

export function InspectorDrawer(props: InspectorDrawerProps) {
  // GAP 3: semantic execution trace, gated on the capability flag, with the
  // part-derived duplicates stripped + grouped by turn (newest first).
  const semanticGroups = createMemo<SemanticTurnGroup[]>(() =>
    props.semanticEventsEnabled ? groupSemanticEvents(props.semanticEvents ?? []) : [],
  );

  // Order matters — the picker walks this list and lands on the
  // first tab whose data is present. The Timeline tab also surfaces when a
  // semantic trace exists even if the message has no renderable parts (e.g.
  // a blocked user turn).
  const semanticRowCount = () =>
    semanticGroups().reduce((count, group) => count + group.rows.length, 0);
  const contentState = createMemo<InspectorContentState>(() =>
    inspectorContentState({
      message: props.message,
      model: props.model,
      tokens: props.tokens,
      costUsd: props.costUsd,
      toolCallCount: props.toolCalls.length,
      integrationCount: props.integrations?.length,
      taskCount: props.tasks?.length,
      contextFileCount: props.contextFiles?.length,
      frameCount: props.frames?.length,
      sessionDiffCount: props.sessionDiffs?.length,
      scheduleCount: props.schedules?.length,
      canCreateSchedule: Boolean(props.schedules && props.onCreateSchedule),
      attemptsCount: props.attempts?.length,
      bindings: props.bindings,
      semanticRowCount: semanticRowCount(),
    }),
  );
  const availableTabs = createMemo<InspectorTab[]>(() => availableInspectorTabs(contentState()));

  const [activeTabRaw, setActiveTabRaw] = createPersistedString('clio.inspector.tab.v1', 'turn');
  const [stickyTab, setStickyTab] = createSignal<InspectorTab | null>(null);

  const activeTab = createMemo<InspectorTab>(() =>
    resolveInspectorTab(availableTabs(), stickyTab(), activeTabRaw()),
  );

  function pickTab(t: InspectorTab) {
    setStickyTab(t);
    setActiveTabRaw(t);
  }

  const turnDiffs = createMemo(() => messageFileDiffParts(props.message));

  return (
    <Show when={props.open}>
      <aside class="inspector" data-testid="inspector-drawer" aria-label="Turn inspector">
        <header class="inspector__head">
          <h3 class="inspector__title">Turn inspector</h3>
          <button
            type="button"
            class="inspector__close"
            onClick={props.onClose}
            aria-label="Close inspector"
            data-testid="inspector-close"
          >
            <Icon name="close" size={14} />
          </button>
        </header>

        <Show when={!inspectorHasAnyContent(contentState())}>
          <div class="inspector__empty" data-testid="inspector-empty">
            <div class="inspector__empty-icon">
              <Icon name="sparkle" size={20} />
            </div>
            <p class="inspector__empty-title">Waiting for the first turn</p>
            <p class="inspector__empty-body">
              Stop reason, tokens, cost, tool calls, thinking blocks, diffs, and integration health
              land here once {brand.name} answers.
            </p>
          </div>
        </Show>

        <Show when={availableTabs().length > 0}>
          <InspectorTabList
            tabs={availableTabs()}
            activeTab={activeTab()}
            onPickTab={pickTab}
          />
        </Show>

        <InspectorActiveTabPanel
          drawer={props}
          contentState={contentState()}
          activeTab={activeTab()}
          semanticGroups={semanticGroups()}
          turnDiffs={turnDiffs()}
        />
      </aside>
    </Show>
  );
}
