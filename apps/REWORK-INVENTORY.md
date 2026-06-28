# Interface Rework Inventory

This is the working map for `feat/rework`. It complements the original
architecture in `apps/03-architecture.md` by recording the current cleanup
direction, the seams already created, and the gates that should keep the TUI,
web app, and desktop app from drifting into unreviewable patches.

## Goal

Keep the existing capabilities while making the interfaces readable,
expandable, and fast enough to keep iterating on. The rework is not a visual
rewrite and not a behavior reset. It is a structural pass that turns large
mixed-responsibility files into smaller domain modules with tests close to the
behavior they protect.

## Current Shape

### `apps/core`

Role: shared TypeScript client and wire-facing API. The public `Client` remains
one class, but implementation is split by endpoint domain.

Current direction:

- endpoint functions live in small files such as `session_runs.ts`,
  `agent_blueprints.ts`, `expert_packs.ts`, and `workspace.ts`
- DTO and option types are being moved to sibling `*_types.ts` files when they
  are shared by more than one client layer
- inheritance layers group related client methods, but final consumers still
  import `Client` from `@clio/core`

Recent seams on `feat/rework`:

- public export surface:
  - `public_agent_exports.ts`
  - `public_discovery_exports.ts`
  - `public_session_exports.ts`
  - `public_workspace_exports.ts`
- `session_run_types.ts`
- `session_interaction_types.ts`
- `session_operations_client.ts`, `session_memory_client.ts`,
  `session_coordination_client.ts`
- `agent_blueprint_types.ts`
- `expert_pack_types.ts`
- `catalog_types.ts`
- `workspace_types.ts`
- `agent_types.ts`
- `provider_settings_client.ts`
- `prompt_settings_client.ts`
- `tests/catalog_lifecycle.test.ts`: agent-blueprint and expert-pack catalog
  lifecycle wire-contract coverage split away from the broad client facade suite
- `tests/hooks.test.ts`: hook endpoint wire-contract coverage split away from
  the broad client facade suite
- `tests/mcp_facade.test.ts`, `tests/sse_url.test.ts`, and
  `tests/workspace_files.test.ts`: remaining MCP, SSE URL, and workspace file
  client facade contracts split away from the base transport suite
- `tests/session_endpoints.test.ts`: session list/create/send/summarize,
  attachment upload, retry, and permission-resolution client contracts split
  away from the generic client facade suite

Validation gate:

```sh
cd apps/core
./node_modules/.bin/tsc -p tsconfig.json --noEmit
./node_modules/.bin/vitest run tests/client.test.ts tests/capabilities.test.ts
```

Use the broader deterministic suite when a shared session/client behavior
changes:

```sh
./node_modules/.bin/vitest run \
  tests/capabilities.test.ts \
  tests/transcript.test.ts \
  tests/backends.test.ts \
  tests/sse.test.ts \
  tests/client.test.ts
```

### `apps/web`

Role: browser UI and the WebView UI shipped by desktop. The current cleanup
direction is to keep behavior/state in route or controller modules and move
pure presentational sections into focused components.

Recent seams on `feat/rework`:

- discovery page sections:
  - `discovery-page-cards.css`
  - `AgentsPageModel.ts`
  - `agents-page.css`
  - `MetricsPageModel.ts`
  - `MemorySections.tsx`
  - `MemorySectionsModel.ts`
  - `MemorySearchResults.tsx`
  - `MemoryEventsList.tsx`
  - `memory-sections.css`
  - `ExpertPackSections.tsx`
  - `BlueprintSections.tsx`
  - `BlueprintSourcesPanelModel.ts`
  - `BlueprintSourceRow.tsx`
  - `PluginRegistryPanelsModel.ts`
  - `PluginsPageModel.ts`
  - `WorkspaceSections.tsx`
  - `WorkspacesPageModel.ts`
  - `HooksPageModel.ts`
  - `HooksPageSections.tsx`
  - `DoctorPageModel.ts`
  - `doctor-page.css`
  - `McpPageModel.ts`
  - `ToolsPageModel.ts`
  - `PromptsPageModel.ts`
  - `ProvidersPageModel.ts`
  - `provider-models.css`
  - `PoliciesPageModel.ts`
  - `discovery-prompts.css`
  - `discovery-card-actions.css`
  - `discovery-card-add.css`
  - `discovery-card-content.css`
  - `discovery-card-shell.css`
  - `discovery-card-states.css`
  - `discovery-card-tags.css`
  - `discovery-page-actions.css`
  - `discovery-page-controls.css`
  - `discovery-page-empty.css`
  - `discovery-page-error.css`
  - `discovery-page-header.css`
  - `discovery-page-loading.css`
  - `discovery-page-shell.css`
  - `roadmap-page.css`
  - `discovery-page-forms.css`
  - `discovery-page-search.css`
  - `discovery-page-stats.css`
  - `workspace-card-repo.css`
  - `roadmap-editor.css`
  - `roadmap-form.css`
  - `roadmap-install.css`
  - `roadmap-list.css`
  - `roadmap-pack-cards.css`
  - `roadmap-pretty.css`
- settings page sections:
  - `SettingsAppearanceSections.tsx`
  - `settings-appearance.css`
  - `settings-backend-list.css`
  - `settings-form.css`
  - `SettingsShellContent.tsx`
  - `SettingsShellNav.tsx`
  - `settings-shell-nav.css`
  - `settings-shell-capabilities.css`
  - `settings-shell-fields.css`
  - `settings-shell-layout.css`
  - `settings-shell-links.css`
  - `SettingsModelChooserRows.tsx`
  - `SettingsModelChooserState.ts`
  - `SettingsModelChooserTypes.ts`
  - `SettingsBackendRow.tsx`
  - `SettingsSessionDefaultsModel.ts`
  - `splashBackendStartup.ts`
  - `splashInstallFlow.ts`
  - `splash-error.css`
  - `splash-install.css`
  - `splash-status.css`
  - `AddRemoteBackendController.ts`
  - `AddRemoteBackendHttpFields.tsx`
  - `AddRemoteBackendModeSelector.tsx`
  - `AddRemoteBackendSshFields.tsx`
- chat layout sections:
  - `left-rail-nav.css`
  - `left-rail-nav-buttons.css`
  - `left-rail-nav-groups.css`
  - `preview-rail-browser.css`
  - `preview-rail-preview.css`
  - `ChatScreenLiveController.ts`
  - `LiveReconnect.test.ts`
  - `LiveTranscriptBrowserStream.ts`
  - `LiveTranscriptTauriStream.ts`
  - `LiveTranscriptConnectionListeners.ts`
  - `ChatLayoutSessionsColumn.tsx`
  - `ChatLayoutMainColumn.tsx`
  - `ChatLayoutSidePanels.tsx`
  - `ChatLayoutOverlays.tsx`
  - `chatLayoutCommandWiring.ts`
  - `chatLayoutDerivedState.tsx`
  - `chatLayoutSessionNavigation.ts`
  - `chatLayoutServices.ts`
  - `chatLayoutTranscriptClipboard.ts`
  - `chatWorkspaceSemanticsModel.ts`
  - `ChatConversationTranscript.tsx`
  - `ChatConversationComposer.tsx`
  - `chatCommandHandlerModel.ts`
  - `chatMessageRegenerationActions.ts`
  - `TranscriptRegenMenuSections.tsx`
  - `chat-empty.css`
  - `chat-conversation-transcript.css`
  - `chat-transcript-mobile.css`
  - `chat-transcript-pane.css`
  - `chat-transcript-scroll-pill.css`
  - `chat-transcript-typing.css`
  - `ChatTopbarModel.ts`
  - `chat-topbar-actions.css`
  - `chat-topbar.css`
  - `chat-topbar-crumbs.css`
  - `chat-topbar-meta.css`
  - `InspectorDrawerTabs.tsx`
  - `inspector-attempts.css`
  - `InspectorBindingProvenance.tsx`
  - `InspectorBindingSelect.tsx`
  - `InspectorPackagedProvenance.tsx`
  - `inspector-bindings.css`
  - `inspector-context-files.css`
  - `inspector-empty.css`
  - `InspectorSemanticTimelineModel.ts`
  - `inspector-frames.css`
  - `inspector-integrations.css`
  - `InspectorScheduleCreateForm.tsx`
  - `InspectorScheduleModel.ts`
  - `InspectorScheduleRow.tsx`
  - `inspector-schedules.css`
  - `inspector-tasks.css`
  - `inspector-thinking.css`
  - `inspector-diff-rows.css`
  - `inspector-tool-calls.css`
  - `inspector-tool-diffs.css`
  - `inspector-tool-diff-lists.css`
  - `inspector-timeline.css`
  - `InlineMarkdownBlocks.tsx`
  - `InlineMarkdownInlineTokens.ts`
  - `InlineMarkdownTypes.ts`
  - `inline-markdown-blocks.css`
  - `inline-markdown-code.css`
  - `SessionSemanticsModalModel.ts`
  - `session-semantics-modal.css`
  - `TranscriptToolPartsModel.ts`
  - `TranscriptExecutionProjection.test.tsx`
  - `TranscriptToolEvidence.test.tsx`
  - `TranscriptHashNavigation.ts`
  - `TranscriptSkeleton.tsx`
  - `TranscriptMessageActions.tsx`
  - `TranscriptMessageHeaderModel.ts`
  - `NotificationCenterBell.tsx`
  - `NotificationCenterFilters.tsx`
  - `NotificationCenterList.tsx`
  - `CatalogBrowserModel.ts`: catalog loading, filtering, grouping, and
    category counting live under model tests instead of the modal component
  - `UserQuestionChoiceBody.tsx`
  - `UserQuestionConfirmationBody.tsx`
  - `UserQuestionFreeformBody.tsx`
  - `WorkflowStateFormatting.ts`
  - `DiffPaneEmpty.tsx`
  - `DiffPaneHeader.tsx`
  - `DiffPaneLine.tsx`
  - `diff-pane-empty.css`
  - `diff-pane-hunks.css`
  - `diff-pane-lines.css`
  - `transcript-artifacts.css`
  - `transcript-message.css`
  - `transcript-regenerate.css`
  - `transcript-status.css`
  - `transcript-structured-result.css`
  - `transcript-tool-call.css`
  - `transcript-tool-result.css`
  - `transcript-tools.css`
  - `transcript-command-result.css`
  - `transcript-turn-blocker.css`
  - `transcript-workflow.css`
  - `transcript-workflow-state.css`
- card/detail splits:
  - `AgentDetailPanel.tsx`
  - `AgentDetailPanelModel.ts`
  - `McpDetailRowsModel.ts`
  - `McpServerCardModel.ts`
  - `McpServerDetailPanel.tsx`
  - `McpInstallModalStdioFields.tsx`
  - `McpInstallModalUrlField.tsx`
  - `PromptCardModel.ts`
  - `PromptCardPreview.tsx`
  - `PromptCardSummary.tsx`
  - `ProviderCardModel.ts`
  - `ProviderModelsPanel.tsx`
  - `WorkspaceCardModel.ts`
- catalog browser splits:
  - `CatalogBrowserModel.ts`
  - `CatalogBrowserResults.tsx`
- session list splits:
  - `sessions-column-header.css`
  - `sessions-column-header-actions.css`
  - `sessions-column-header-connection.css`
  - `sessions-column-header-filters.css`
  - `sessions-column-header-shell.css`
  - `sessions-column-header-title.css`
  - `sessions-column-workspace.css`
  - `SessionsColumnBody.tsx`
  - `SessionsColumnFooter.tsx`
  - `SessionListItemContent.tsx`
  - `SessionListItemModel.ts`
  - `SessionListItemMenu.tsx`
  - `sessions-column-list-layout.css`
  - `sessions-column-list-states.css`
  - `sessions-column-list.css`
  - `sessions-column-row-content.css`
  - `sessions-column-row-menu.css`
  - `sessions-column-row-shell.css`
  - `sessions-column-row-status.css`
- composer splits:
  - `composer-attachments.css`
  - `composer-actions.css`
  - `composer-pickers.css`
  - `ComposerController.ts`
  - `ComposerPickerModel.ts`
  - `ComposerSubmitModel.ts`
  - `ComposerTextareaController.ts`
  - `ComposerTextareaModel.ts`
- onboarding/provider setup splits:
  - `OnboardingTourController.ts`
  - `ProviderSetupPresetGrid.tsx`
  - `provider-setup-cards.css`
  - `provider-setup-footer.css`
  - `provider-setup-keyform.css`
  - `provider-setup-shell.css`
- theme splits:
  - `ThemePresets.ts`
- global style splits:
  - `base.css`
  - `ui-primitives.css`
  - `motion.css`
- connection setup splits:
  - `AddRemoteBackendModel.ts`
  - `AppRouteModel.ts`
  - `connect-actions.css`
  - `connect-brand.css`
  - `connect-form.css`
  - `connect-status.css`
  - `ConnectScreenController.ts`
  - `ConnectScreenModel.ts`
- modal/form splits:
  - `McpInstallModalFields.tsx`
  - `mcp-install-modal-actions.css`
  - `mcp-install-modal-env.css`
  - `mcp-install-modal-fields.css`
  - `mcp-install-modal-shell.css`
  - `mcp-install-modal-status.css`
- notification/toast splits:
  - `NotificationCenterModel.ts`
  - `notification-center-filters.css`
  - `notification-center-list.css`
  - `notification-center-shell.css`
  - `ToastHost.tsx`
  - `ToastModel.ts`
- visual test harness:
  - `fixtures/demoBaseMessages.ts`
  - `fixtures/demoMessages.ts`
  - `fixtures/demoPermission.ts`
  - `fixtures/demoPreviewMessages.ts`
  - `fixtures/demoSessions.ts`
  - `fixtures/demoStructuredMessages.ts`
  - `tests/visual/mock-backend-fixtures.ts`
  - `tests/visual/audit-helpers.ts`
  - `tests/visual/screenshots-helpers.ts`
  - `tests/visual/ndp-live-helpers.ts`
  - `tests/visual/oneturn-audit-helpers.ts`
  - `tests/visual/audit-settings.spec.ts`
  - `tests/visual/overnight-real-helpers.ts`
  - `tests/visual/overnight-single-backend-helpers.ts`
  - `tests/visual/overnight-real-mcp.spec.ts`
- plugin registry splits:
  - `PluginCard.tsx`
  - `PluginForm.tsx`
- clarification prompt splits:
  - `UserQuestionCardModel.ts`
  - `user-question-card-choices.css`
  - `user-question-card-confirmation.css`
  - `user-question-card-freeform.css`
  - `user-question-card-shell.css`
  - `user-question-card-source.css`
- existing model/helper seams worth preserving:
  - `ChatScreenModel.ts`
  - `InspectorBindingsModel.ts`
  - `chatActiveSessionActions.ts`
  - `chatLiveTranscriptEvents.ts`
  - `chatSessionInspectorActions.ts`
  - `chatSessionBindingActions.ts`
  - `chatSessionContextFileActions.ts`
  - `chatSessionDiffActions.ts`
  - `chatSessionMarkdown.ts`
  - `chatSessionPortabilityActions.ts`
  - `chatSessionScheduleActions.ts`
  - `chatLayoutSelectionModel.ts`
  - `chatLayoutUiState.ts`
  - `chatCommandExecution.ts`
  - `chatPaletteActionItems.ts`
  - `chatPaletteItemBuilders.ts`
  - `chatPaletteNavigationItems.ts`
  - `chatPaletteSessionItems.ts`
  - `chatNotificationToasts.ts`
  - `chatTranscriptSearch.ts`
  - `chatTranscriptScroll.ts`
  - `executionObservationPreview.ts`
  - `executionProjectionEventModel.ts`
  - `executionProjectionSupplements.ts`
  - `LiveTranscriptModel.ts`
  - `LiveTranscriptState.ts`
  - `presentationRecordRows.ts`
  - `PreviewRailController.ts`
  - `PreviewRailData.ts`
  - `PreviewRailDiagnostics.ts`
  - `PreviewRailFileTypes.ts`
  - `PreviewRailModel.ts`
  - `PreviewRailModel.test.ts`

Validation gate:

```sh
cd apps/web
./node_modules/.bin/tsc -p tsconfig.json --noEmit
./node_modules/.bin/vitest run
```

For a narrow edit, run the targeted test first, then the full suite before
commit. Examples:

```sh
./node_modules/.bin/vitest run tests/unit/WorkspacesPage.test.tsx
./node_modules/.bin/vitest run tests/unit/ExpertPacksPage.test.tsx
./node_modules/.bin/vitest run tests/unit/AgentBlueprintsPage.test.tsx
./node_modules/.bin/vitest run tests/unit/AgentsPage.test.tsx
./node_modules/.bin/vitest run tests/unit/PromptSave.test.tsx
```

UI rendering changes need a visual check. For TUI changes, use the
`tui-screenshot` workflow and inspect the rendered PNG or text artifact before
claiming the UI improved.

### `tui`

Role: terminal interface, keyboard/mouse interaction model, and typed Go client
for GACT/CLIO backends.

Current direction:

- keep rendering changes tied to the timeline projection model in
  `codex-proposal-representation.md`
- split endpoint domains out of the typed client when `client.go` mixes
  unrelated API surfaces
- preserve the package-level `client.Client` API while moving route clusters to
  focused files

Recent seams on `feat/rework`:

- `tui/internal/client/agents.go`: agent list/detail/create/update/delete,
  agent extraction, and tool list/detail endpoints moved out of the general
  client file
- `tui/internal/client/catalogs.go`: expert-pack, agent-blueprint, and session
  agent override endpoints moved out of the general client file.
- `tui/internal/client/prompts.go`: prompt registry list/get/save/render,
  validation, reload, and runtime-scope query/body helpers split away from the
  mixed catalog client file.
- `tui/internal/client/commands.go`: command catalog and session command-run
  endpoints moved out of the mixed catalog client file
- `tui/internal/client/files.go`: session context files, attachments,
  workspace file listing, repo map, and raw workspace file read endpoints moved
  out of the general client file
- `tui/internal/client/health.go`: health, capabilities, and capability-gap
  endpoints moved out of the general client file
- `tui/internal/client/hooks.go`: hook list/create/delete endpoints moved out
  of the general client file
- `tui/internal/client/mcp.go`: MCP runtime server listing, handshake,
  resource read, reconnect/install/uninstall, and per-server catalog endpoints
  moved out of the general client file
- `tui/internal/client/memory.go`: memory stats, memory search, and memory tool
  endpoints moved out of the general client file
- `tui/internal/client/metrics.go`: metrics endpoint moved out of the general
  client file
- `tui/internal/client/messages.go`: post/list/search/delete message routes and
  context-frame endpoints moved out of the general client file
- `tui/internal/client/permissions.go`: permission request/decision endpoints
  and permission policy endpoints moved out of the general client file
- `tui/internal/client/providers.go`: provider catalog, LM provider
  configuration, provider model listing, handshake, and auth endpoints moved
  out of the general client file
- `tui/internal/client/questions.go`: user question lifecycle and retry attempt
  endpoints moved out of the general client file
- `tui/internal/client/sessions.go`: session lifecycle, patch, import/export,
  diff apply/reject, summarize, rewind, and undo endpoints moved out of the
  general client file
- `tui/internal/client/tasks.go`: session task list/create/patch/delete
  endpoints moved out of the general client file
- `tui/internal/client/voice.go`: voice transcription endpoint moved out of the
  general client file
- `tui/internal/client/workspaces.go`: workspace list/create/delete endpoints
  moved out of the general client file
- `tui/internal/ui/app_overlay_state.go`: help, settings, provider setup,
  MCP/workspace/session action, retry, edit, and detail modal state grouped
  out of the root `App` field list while preserving direct handler access
- `tui/internal/ui/app_sidebar_state.go`: sidebar filters, section collapse,
  prompt history, delete confirmation, and reload flags grouped out of the root
  `App` field list while preserving direct handler access
- `tui/internal/ui/app_connection_state.go`: SSE channels, reconnect counters,
  replay high-water marks, semantic live cache, and execution timeline ledger
  grouped out of the root `App` field list while preserving direct handler access
- `tui/internal/ui/app_conversation_state.go`: loaded transcript messages,
  viewport scroll, body part selection, copy-drag state, hit registry, and
  render caches grouped out of the root `App` field list while preserving direct
  handler access
- `tui/internal/ui/app_file_viewer_state.go`: local file tree root, entries,
  expansion map, selection, refresh flags, and last-update timestamp grouped out
  of the root `App` field list while preserving direct handler access
- `tui/internal/ui/app_agent_hierarchy_state.go`: right-sidebar agent hierarchy
  entries, loading error, selection, and collapse state grouped out of the root
  `App` field list while preserving direct handler access
- `tui/internal/ui/app_interaction_overlays.go`: active overlay/modal key
  precedence and help-modal key handling split away from the root key dispatcher.
- `tui/internal/ui/agent_hierarchy_rows.go`: visible agent tree construction,
  workflow-agent filtering, row metadata, and tier/source labels split away
  from sidebar module rendering.
- `tui/internal/ui/catalog_blueprint_hook_descriptors.go`: message-hook
  descriptor title, summary, detail, and label formatting split away from MCP
  descriptor formatting.
- `tui/internal/ui/catalog_blueprint_source_format.go`: source title
  compaction, marketplace status/state labels, inline summaries, source detail
  formatting, and attention detection split away from source grouping.
- `tui/internal/ui/catalog_text_helpers.go`: shared catalog wording helpers own
  cross-catalog operator/source labels used by agents, hints, and blueprint
  descriptors.
- `tui/internal/ui/command_palette_tiles.go`: command palette tile/grid
  rendering, tile copy fitting, and hit targets split away from dense list and
  footer hint rendering.
- `tui/internal/ui/execution_observation_line_model.go`: execution observation
  line classification split away from theme coloring so artifact previews,
  diffs, tables, and expansion affordances have one testable semantic model.
- `tui/internal/ui/execution_timeline_nodes.go`: CLIO semantic payload to
  handoff, ReAct-step, expert-report, and tool-run node construction split away
  from timeline ordering, dedupe, and current-agent state.
- `tui/internal/ui/execution_timeline_reports.go`: expert extract and
  delegation-return report dedupe/replacement split away from event dispatch.
- `tui/internal/ui/execution_timeline_tools.go`: standalone semantic tool
  start/completion projection split away from the main execution event
  dispatcher.
- `tui/internal/ui/execution_timeline_lifecycle.go`: expert start, delegation
  start, and ReAct-step lifecycle mutations split away from the sorted event
  dispatch loop.
- `tui/internal/ui/command_palette_builtins.go`: built-in palette command
  definitions and localized label normalization split away from palette source
  matching and visibility filtering.
- `tui/internal/ui/chrome_footer.go`: footer rendering, reconnect and memory
  chips, footer action hit registration, and sidebar footer-key routing split
  away from global chrome focus/modal helpers.
- `tui/internal/ui/detail_bulky_parts.go`: Ctrl+E fallback scans for latest
  bulky text/tool-result content split away from selected-part detail routing.
- `tui/internal/ui/live_message_parts.go`: `message.part.*` SSE mutation
  handlers split away from message/session completion and cost handling.
- `tui/internal/ui/live_message_expert_handoffs.go`: expert-handoff metadata
  normalization, noisy/resumed-event filtering, direct-tool dedupe, and
  synthetic handoff part construction split away from the normalization
  entrypoint.
- `tui/internal/ui/workspace_create_git.go`: Git workspace URL parsing, derived
  workspace name/root synchronization, and default clone-base selection split
  away from workspace-create modal lifecycle and key handling.
- `tui/internal/ui/agent_hierarchy_test.go`: agent hierarchy tree rendering,
  mouse-open detail behavior, skills/validation badges, workflow scoping, and
  workflow-owner sidebar coverage kept focused on the static hierarchy module.
- `tui/internal/ui/agent_hierarchy_runtime_test.go`: runtime provenance,
  nested semantic agent references, live semantic delegation, and final
  provenance settling coverage split out of the hierarchy rendering suite.
- `tui/internal/ui/agent_hierarchy_session_test.go`: session active-blueprint
  indicator and activation metadata coverage split out of the hierarchy suite.
- `tui/internal/ui/app_input_state.go`: composer textarea, paste buffering,
  compose modal, file picker, per-session drafts, and compressed paste records
  grouped out of the root `App` field list while preserving direct handler
  access
- `tui/internal/ui/context_add_test.go`: add/drop slash-command dispatch,
  add-context key handling, backend POST command behavior, success/failure
  mirroring, and stale-response guards kept focused on context add flow state.
- `tui/internal/ui/context_add_interaction_test.go`: add-context mode chips,
  save/cancel buttons, shared-header alignment, and editor cursor hit-target
  coverage split out of the context add flow suite.
- `tui/internal/ui/app_command_state.go`: slash command data, plugin command
  extensions, `/clear` confirmation, and command-palette search state grouped
  out of the root `App` field list while preserving direct handler access
- `tui/internal/ui/app_catalog_state.go`: catalog-browser modal state and
  disabled-tool display filters grouped out of the root `App` field list while
  preserving direct handler access
- `tui/internal/ui/app_session_state.go`: active capabilities, memory stats,
  workspace/session selection, context files, task counts, status, and pending
  permission state grouped out of the root `App` field list while preserving
  direct handler access
- `tui/internal/ui/app_feedback_state.go`: transient operator hints and
  localization state grouped out of the root `App` field list while preserving
  direct handler access
- `tui/internal/ui/app_lifecycle_state.go`: splash/intro animation state,
  attach targeting, clean-detach metadata, and detached-session markers grouped
  out of the root `App` field list while preserving direct handler access
- `tui/internal/ui/app_config_state.go`: backend/theme/runtime knobs,
  persistence callbacks, mouse/alt-screen preferences, and startup selectors
  grouped out of the root `App` field list while preserving promoted access for
  main.go wiring and tests
- `tui/internal/ui/ask_user_modal.go`: agent-question modal editing,
  answer/cancel controls, option selection, and cursor helpers split out of the
  mixed ask-user/retry event bridge.
- `tui/internal/ui/ask_user_retry_test.go`: agent-question rendering, detail
  text, SSE lifecycle updates, modal source copy, paste routing, and cancel
  backend flow kept focused on ask-user behavior.
- `tui/internal/ui/retry_attempt_test.go`: retry-attempt rendering/detail text,
  retry notes/model paste routing, model warning copy, explicit model override
  request shape, and invalid model rejection split out of ask-user coverage.
- `tui/internal/ui/mcp_install_modal.go`: MCP install prompt state, examples,
  parsing dispatch, and text-entry rendering split out from the MCP remove
  picker.
- `tui/internal/ui/text_entry_editing.go`: shared text-entry cursor insertion
  helper moved out of feature-specific modal files.
- `tui/internal/ui/interaction_palette_test.go`: command-palette dispatch,
  mouse toggle, filter editing, close behavior, and scoped command-loading
  coverage split out of the oversized interaction test suite.
- `tui/internal/ui/interaction_palette_layout_test.go`: command-palette shared
  frame alignment, category sizing, scroll-window affordances, compact operator
  copy, and subtitle formatting coverage split out of the mixed palette suite.
- `tui/internal/ui/interaction_palette_search_test.go`: command-palette search
  query cursor, result-list wheel, close, result jump, and scroll affordance
  coverage split out of the palette interaction suite.
- `tui/internal/ui/interaction_catalog_picker_test.go`: catalog-browser and
  agent-blueprint catalog hit target, wheel, modal surface, back/close, and
  install-shortcut coverage split out of the oversized interaction test suite.
- `tui/internal/ui/interaction_file_picker_test.go`: file-picker row,
  close-button, scroll-affordance, non-row click, and wheel interaction coverage
  split out of the mixed catalog picker suite.
- `tui/internal/ui/interaction_conversation_test.go`: conversation transcript
  hit targets, shared pane geometry, selected-part detail opening, raw-result
  detail copy, and diff action coverage split out of the oversized interaction
  test suite.
- `tui/internal/ui/interaction_conversation_actions_test.go`: conversation
  action-menu copy/operator wording, rewind dispatch, and rewind completion
  lifecycle coverage split out of the broader conversation interaction suite.
- `tui/internal/ui/interaction_conversation_footer_test.go`: conversation
  footer copy, retry, delete, and selected semantic-block copy coverage split
  out of the conversation interaction suite.
- `tui/internal/ui/conversation_copy_drag_test.go`: visible transcript
  selection slicing, mouse drag lifecycle, click-target suppression, and
  Alt-drag escape hatch coverage kept focused on copy behavior.
- `tui/internal/ui/conversation_copy_highlight_test.go`: transcript/detail
  selection highlight rendering and coordinate mapping coverage split out of
  the drag behavior suite.
- `tui/internal/ui/conversation_copy_footer_test.go`: mouse-enabled copy
  affordance footer hints and native-selection fallback coverage split out of
  the drag behavior suite.
- `tui/internal/ui/interaction_sidebar_test.go`: sidebar session rows,
  headers, filters, child-session toggles, count toggles, and shared row
  geometry coverage split out of the oversized interaction test suite.
- `tui/internal/ui/interaction_sidebar_actions_test.go`: sidebar footer
  action shortcuts and right-click session action-menu coverage split out of
  the sidebar interaction suite.
- `tui/internal/ui/sidebar_status_test.go`: sidebar busy/detached filters,
  freshness/status lines, detached markers, delete pruning, and task badge
  coverage split out of the mixed intro/splash suite.
- `tui/internal/ui/sidebar_nav_test.go`: sidebar paging, first/last jumps,
  section collapse, header focus, and collapsed-section keyboard navigation
  kept focused on navigation state.
- `tui/internal/ui/sidebar_child_sessions_test.go`: child-session metadata,
  compact branch rendering, grouping, sorting, scoped expansion, and
  variable-height visible range coverage split out of sidebar navigation.
- `tui/internal/ui/intro_test.go`: intro splash lifecycle, empty-state detached
  resume hint, transient hint dwell, plugin palette merge, and custom intro-file
  coverage after sidebar status behavior moved out.
- `tui/internal/ui/session_drafts.go`: per-session composer draft and file
  mention stash/restore helpers split away from session selection and reload
  orchestration.
- `tui/internal/ui/interaction_context_test.go`: context-file rows, content
  preview, removal, keyboard parity, and overflow interaction coverage split
  out of the oversized interaction test suite.
- `tui/internal/ui/interaction_context_actions_test.go`: context-file action
  menu copy, detail, and remove interaction coverage split out from context
  row rendering and state update tests.
- `tui/internal/ui/interaction_mcp_test.go`: MCP remove modal rows,
  confirmation flow, failure recovery, and bounded scrolling coverage split out
  of the oversized interaction test suite.
- `tui/internal/ui/interaction_mcp_mouse_test.go`: MCP remove wheel routing,
  non-row click behavior, cancel-button state, and header alignment split away
  from row and confirmation tests.
- `tui/internal/ui/interaction_mcp_install_test.go`: MCP install modal buttons,
  editor cursor, examples, line editing, and outside-close coverage split out
  of the mixed MCP interaction suite.
- `tui/internal/ui/interaction_input_detail_test.go`: input command chip,
  paste placeholder, input focus surface, and detail-modal close interaction
  coverage split out of the oversized interaction test suite
- `tui/internal/ui/detail_part_refs.go`: selected-part detail reference
  construction, bulky-part lookup, tool-call detail text, and tool-result
  flattening split away from the detail selection entrypoint.
- `tui/internal/ui/detail_view_semantic_operator.go`: operator-facing
  semantic event result summaries, workflow/provider/status fields, and compact
  semantic detail wording split away from semantic detail section assembly.
- `tui/internal/ui/sidebar_key_navigation.go`: collapsed-sidebar key handling,
  up/down navigation, first/last jumps, and sidebar paging split away from the
  sidebar command dispatcher.
- `tui/internal/ui/sidebar_module_layout.go`: persisted sidebar module id
  parsing, left/right placement, hidden placement handling, and config export
  helpers split away from sidebar module registry and rendering.
- `tui/internal/ui/sidebar_layout_model.go`: sidebar layout editor column
  constants, available-module calculation, selection clamping, and module
  lookup split away from key handling and layout mutation.
- `tui/internal/ui/sidebar_modules_test.go`: module id normalization,
  left/right placement, unknown module rendering, section ordering, and
  right-sidebar module rendering kept focused on module configuration.
- `tui/internal/ui/sidebar_layout_editor_test.go`: layout-editor transfer,
  reorder, keyboard, mouse, hidden-column, and unknown-module explanation
  coverage split out of the module configuration suite.
- `tui/internal/ui/lm_config_editing.go`: LM configuration text input,
  paste sanitization, backspace handling, and advanced numeric steppers split
  away from provider/model navigation.
- `tui/internal/ui/lm_config_catalog_fetch.go`: LM configuration model-catalog
  refresh, cache invalidation, background provider probes, and retry
  orchestration split away from catalog filtering and preset synchronization.
- `tui/internal/ui/lm_config_catalog_handlers.go`: LM model-catalog load
  message handling, cache source/warning updates, suggested-model snapping, and
  retry dispatch split away from provider lifecycle handlers.
- `tui/internal/ui/lm_config_provider_list.go` and
  `tui/internal/ui/lm_config_provider_details.go`: LM provider list/windowing
  and selected-provider detail rows split away from the former mixed provider
  renderer.
- `tui/internal/ui/lm_config_layout.go`: LM provider modal row budgeting,
  grid-width calculation, layout struct, and modal width helpers split away
  from modal assembly and provider lifecycle handling.
- `tui/internal/ui/context_file_messages.go`: context-file add/remove API
  commands, upload/add/remove/list message types, and session-scoped state
  handlers split away from the add-context prompt editor and renderer.
- `tui/internal/ui/live_semantic_event_failures.go`: semantic failure
  summaries, generic-failure detection, and stream-fallback text extraction
  split away from the general semantic event summary selector.
- `tui/internal/ui/live_semantic_tool_projection.go`: semantic tool-call
  started/completed projection, tool payload extraction, redaction-aware
  argument previews, and tool completion summaries split away from the generic
  semantic event dispatcher.
- `tui/internal/ui/live_semantic_tool_summary.go`: operator-facing semantic
  tool completion summaries, evidence-payload filtering, argument preview
  redaction handling, and shared semantic payload helpers split away from live
  message mutation.
- `tui/internal/ui/render_tool_result_grep.go`,
  `tui/internal/ui/render_tool_result_diff.go`, and
  `tui/internal/ui/render_tool_result_pseudo.go`: grep gutter rendering,
  absorbed edit-diff rendering, and non-JSON geocode summarization split away
  from the generic tool-result dispatch path.
- `tui/internal/ui/settings_view_helpers.go`: settings modal tab hit
  construction, current model/agent labels, and shared settings row rendering
  split away from the five-tab view assembly.
- `tui/internal/ui/settings_model_agent_view.go`: model-tab LM-config entry
  rows and agent-tab list/default rows split away from settings modal frame
  assembly and shared hit registration.
- `tui/internal/ui/settings_theme_language_view.go`: theme palette and
  language option row builders split away from settings modal frame assembly.
- `tui/internal/ui/memory_inspector_operator.go`: memory inspector operator
  summary wording, context/retrieval status text, memory-tool access labels,
  and callable-memory proof rows split away from report section assembly.
- `tui/internal/ui/memory_chip_test.go`: footer memory-chip rendering,
  semantic hit targets, `/memory` palette behavior, and footer width fallback
  coverage kept focused on the command surface.
- `tui/internal/ui/memory_inspector_format_test.go`: memory inspector operator
  summary, compaction, transcript evidence, search provenance, context-frame,
  and agent-callable memory-tool formatting coverage split out of the footer
  memory-chip suite.
- `tui/internal/ui/execution_render_format.go`: execution timeline prose
  cleanup, prefix wrapping, tool-call line rendering, observation coloring, and
  indentation helpers split away from node composition.
- `tui/internal/ui/live_event_helpers.go`: shared SSE payload extraction,
  semantic event part IDs, stream metadata promotion, optional bool parsing,
  and stable ID fragments split away from semantic live-message cache merging.
- `tui/internal/ui/live_message_clone.go`: message, part, metadata, model, and
  error-info clone helpers split away from semantic live-message cache merging
  for reuse by session reload and cache restoration paths.
- `tui/internal/ui/file_picker_view.go`: file-reference picker modal rendering,
  result-window sizing, row metadata, and rail actions split away from picker
  lifecycle, loading, keyboard, and insertion handling.
- `tui/internal/ui/file_viewer_delimited_preview.go`: CSV/TSV streaming table
  parsing, cell sizing, and row formatting split away from file-detail mode
  selection and unsupported-file handling.
- `tui/internal/ui/file_viewer_preview_test.go`: local file preview modes,
  external renderer fallbacks, large-file guards, binary unsupported-state
  checks, and preview benchmarks split out of the oversized file viewer suite.
- `tui/internal/ui/file_viewer_upload_test.go`: file-detail attachment upload
  success and unsupported-backend behavior split away from file tree/root
  refresh and navigation coverage.
- `tui/internal/ui/conversation_part_cursor.go`: addressable conversation part
  selection, selected-part ID lookup, and cross-message cursor stepping split
  away from bottom/search scroll positioning.
- `tui/internal/ui/conversation_viewport_hits.go`: conversation transcript
  mouse hit registration, detail/diff hit dispatch, and pane hit geometry split
  away from viewport scroll clipping and selected-part scroll anchoring.
- `tui/internal/ui/agent_blueprint_manage_view.go`: agent-blueprint install,
  validate, and marketplace-source text-entry modal rendering split away from
  manage state, key handling, backend commands, and validation formatting.
- `tui/internal/ui/detail_metadata.go`: part-detail metadata remainder filtering
  and route-source labelling split away from detail text assembly and modal
  rendering.
- `tui/internal/ui/conversation_action_items.go`: selected conversation action
  menu item definitions, per-part action titles, and action context summaries
  split away from conversation action open/close and key dispatch state.
- `tui/internal/ui/file_viewer_python_previews.go`: embedded Python preview
  programs for Parquet/Arrow, HDF5, and NumPy split away from external renderer
  selection, command execution, and unavailable-renderer guidance.
- `tui/internal/ui/render_duplicate_tools.go`: repeated tool call/result
  compaction, duplicate pair keys, and operator-facing repeat notices split
  away from conversation part hit-block geometry.
- `tui/internal/ui/render_message_headers.go`: conversation role headers,
  semantic-live header hiding, standalone tool-result headers, and hidden-part
  checks split away from message body assembly.
- `tui/internal/ui/render_model_swap.go`: model/provider swap marker
  detection, labels, and divider rendering split away from general message
  rendering.
- `tui/internal/ui/render_part_text.go`: assistant text, generic text,
  expandable thinking markers, stream-provenance notes, and text-part metadata
  helpers split away from non-text part-kind rendering.
- `tui/internal/ui/render_part_tool_diff.go`: tool-call headers and file-diff
  transcript rendering split away from miscellaneous part-kind rendering.
- `tui/internal/ui/render_part_misc.go`: subagent, error, compaction,
  runtime-provenance, and unknown-part rendering kept as the remaining support
  part renderer after decomposing the old part-kind catch-all.
- `tui/internal/ui/render_part_workflow.go`: routing-decision and expert
  handoff transcript rendering split away from tool, diff, and support
  part-kind renderers.
- `tui/internal/ui/render_tool_result_pairing.go`: assistant tool-call to
  following tool-result pairing and absorbed-message bookkeeping split away
  from message body assembly.
- `tui/internal/ui/render_handoff_workflow_state.go`: handoff-specific
  workflow-state trimming, dominance detection, and state-summary attachment
  split away from core handoff output selection and scoring.
- `tui/internal/ui/chrome_footer_hint_variants.go`: focus-specific and global
  footer shortcut variant tables split away from footer width-fitting and
  cluster fallback selection.
- `tui/internal/ui/chrome_header_actions.go`: global header help/settings/quit
  action definitions, button-cell rendering, and action hitboxes split away
  from header line composition.
- `tui/internal/ui/app_update_dispatch.go`: Bubble Tea message-family dispatch
  split away from `App.Update` tracing, timing, and transient-hint bookkeeping.
- `tui/internal/ui/app_view_test.go`: deterministic whole-view golden tests
  kept focused on app-level rendering states.
- `tui/internal/ui/app_update_test.go`: attach-session index selection, clean
  detach, and focus cycling split away from app-view golden tests.
- `tui/internal/ui/app_header_test.go`: backend, workspace, model, agent,
  routing, historical-session, and narrow-width header behavior split out of
  the app-view golden suite.
- `tui/internal/ui/settings_agent_detail.go`: settings-agent detail rows,
  expanded detail text, capability reference text, and metadata-list helpers
  split away from agent-list selection/windowing.
- `tui/internal/ui/permissions_history_policy.go`: resolved permission request
  history rows, policy conflict detection, policy action labels, and resolved
  request body formatting split away from permissions inspector section
  assembly.
- `tui/internal/ui/interaction_doctor_test.go`: doctor modal tabs, buttons,
  wheel handling, and shared detail row interaction coverage split out of the
  oversized interaction test suite
- `tui/internal/ui/doctor_test.go`: Doctor health rendering, modal sizing,
  loading/error, key, and wheel coverage kept focused on the TUI modal surface.
- `tui/internal/ui/doctor_capability_rows_test.go`: capability row coverage,
  support-row labels, operator surface names, and current CLIO route notes split
  away from Doctor modal state tests.
- `tui/internal/ui/doctor_capability_matrix_test.go`: capability-matrix
  release-gate documentation coverage split out of the Doctor modal render
  suite.
- `tui/internal/ui/workspace_switch_create_test.go`: workspace open-folder and
  Git-clone create-form rendering, field navigation, derived defaults,
  success/failure handling, and clone-error filtering split out of the
  oversized workspace switcher suite
- `tui/internal/ui/workspace_switch_layout_test.go`: workspace switcher row
  hit targets, close button, wheel routing, shared modal list markers, inset
  width, bounded scroll window, and non-row click behavior split out of the
  switch/delete flow suite.
- `tui/internal/ui/workspace_switch_delete_test.go`: workspace delete
  confirmation, current-workspace guard, and delete-failure recovery split away
  from workspace switch navigation tests.
- `tui/internal/ui/interaction_settings_test.go`: settings tabs, modal close
  behavior, model/agent/language rows, and settings wheel interaction coverage
  split out of the oversized interaction test suite
- `tui/internal/ui/interaction_settings_tui_test.go`: TUI settings rows,
  selected-row detail space, and layout-editor launch coverage split out of
  `interaction_settings_test.go`.
- `tui/internal/ui/interaction_settings_tui_steppers_test.go`: TUI settings
  stepper controls, visible arrow hit areas, and editable-row mouse control
  coverage split away from row rendering tests.
- `tui/internal/ui/settings_theme_test.go`: Settings Theme-tab navigation,
  live theme switching, custom theme import/export actions, semantic hit
  targets, and theme mode round-trip coverage split out of the oversized
  settings-tabs suite.
- `tui/internal/ui/theme_palettes.go`: built-in Theme palette constructors
  split away from the core Theme struct, style finalization, and preference
  defaults in `styles.go`.
- `tui/internal/ui/settings_agent_tab_test.go`: Settings Agent-tab session
  patch confirmation, selectable-agent filtering, agent list scrolling,
  detail text, validation evidence, and Enter-open-detail coverage split out of
  the oversized settings-tabs suite.
- `tui/internal/ui/interaction_footer_test.go`: global footer action hit-target
  coverage split out of `interaction_settings_test.go` so settings interactions
  no longer own app-chrome behavior.
- `tui/internal/ui/interaction_header_test.go`: global header action labels,
  right-edge alignment, settings/help/quit actions, and header-chip hit-target
  coverage split out of `interaction_settings_test.go`.
- `tui/internal/ui/execution_timeline_artifacts_test.go`: execution
  observation previews, Ctrl+E artifact expansion, semantic Enter details, and
  collapsed reasoning expansion split out of `execution_timeline_test.go`.
- `tui/internal/ui/execution_observation_known.go`: geocode, NDP search, point
  ranking, staged-resource, shell, and plot observation routing split away from
  generic execution observation preview fallback logic.
- `tui/internal/ui/execution_timeline_text.go`: assistant text buffering,
  text-part agent attribution, overlap cleanup, and duplicate text replacement
  split out of the semantic execution timeline projector.
- `tui/internal/ui/execution_timeline_projection_test.go`: projected execution
  conversation rendering, user-turn grouping, assistant/semantic stream joining,
  and persisted artifact supplements split out of `execution_timeline_test.go`.
- `tui/internal/ui/execution_timeline_render_test.go`: execution timeline
  renderer formatting, indentation, observation previews, structured-report
  summaries, and markdown/prose spacing coverage split out of projection tests.
- `tui/internal/ui/detail_payload_test.go`: detail preview collapse,
  bulky-part selection, selected-part detail extraction, and promoted evidence
  provenance coverage split out of the detail modal suite.
- `tui/internal/ui/stream_provenance_detail_test.go`: semantic event detail
  provenance, readable delegation intent, and raw-debug event detail coverage
  split out of the semantic provenance ingestion suite.
- `tui/internal/ui/stream_provenance_tool_events_test.go`: semantic/live tool
  payload summaries, artifact evidence, and redacted argument handling
  split out of `stream_provenance_test.go`.
- `tui/internal/ui/stream_provenance_live_tool_events_test.go`: nested semantic
  tool rendering, live tool-result deduplication, missing-ok fallbacks, and
  semantic-live tool labeling split out of the tool provenance suite.
- `tui/internal/ui/interaction_help_test.go`: help overlay tabs, close button,
  and body/surface wheel interaction coverage split out of the oversized
  interaction test suite
- `tui/internal/ui/interaction_metrics_test.go`: metrics modal buttons, wheel
  behavior, cost rows, and latency detail interaction coverage split out of the
  oversized interaction test suite
- `tui/internal/ui/interaction_permission_test.go`: permission banner copy,
  action hit targets, clipping, and right-sidebar containment coverage split out
  of the oversized interaction test suite
- `tui/internal/ui/interaction_context_detail_test.go`: CLIO context-file
  content preview loading, capability probing, backend error reporting, binary
  summarization, and text media-type preview coverage split out of the broad
  context interaction suite.
- `tui/internal/ui/mouse_scroll_right_sidebar_test.go`: right-sidebar focus
  geometry, context/file/agent row hit isolation, independent file-wheel
  selection split out of the oversized mouse-scroll suite.
- `tui/internal/ui/mouse_scroll_right_sidebar_actions_test.go`: right-sidebar
  context and agent right-click behavior split away from geometry, row
  isolation, and wheel-selection tests.
- `tui/internal/ui/mouse_scroll_sidebar_test.go`: left-sidebar mouse focus,
  session selection, section toggles, child-session expansion, and rendered row
  hit geometry split out of the oversized mouse-scroll suite.
- `tui/internal/ui/mouse_scroll_test.go`: base mouse enablement, conversation
  wheel movement, sticky-bottom transitions, and keyboard return-to-bottom
  coverage kept focused on transcript scrolling.
- `tui/internal/ui/mouse_scroll_overlays_test.go`: overlay wheel isolation,
  shared outside-click policy, detail/catalog/file-picker hit routing, and
  command-chip mouse coverage split out of the base mouse-scroll suite.
- `tui/internal/ui/interaction_quit_confirm_test.go`: quit-confirm modal
  buttons, labels, header alignment, and click-policy coverage split out of the
  oversized interaction test suite
- `tui/internal/ui/interaction_modal_chrome_test.go`: shared modal header,
  surface layering, header-button state, and action-row hitbox coverage split
  out of the oversized interaction test suite
- `tui/internal/ui/interaction_text_entry_test.go`: text-entry modal geometry,
  paste handling, cursor/status hit targets, surface wheel blocker, and intro
  list coverage split out of the oversized interaction test suite
- `tui/internal/ui/rename_test.go`: rename modal lifecycle, session-title patch
  behavior, failure recovery, and keyboard editing coverage.
- `tui/internal/ui/rename_interaction_test.go`: rename modal button hit targets,
  shared-header alignment, cursor click placement, and wheel blocker coverage
  split away from rename lifecycle tests.
- `tui/internal/ui/interaction_modal_list_test.go`: shared modal-list
  description wrapping, nested alignment, selected marker, and list-region hit
  coverage split out of the oversized interaction test suite
- `tui/internal/ui/interaction_modal_controls_test.go`: shared modal wheel,
  cell hit, inline option, button, action row, tab, and frame registration
  coverage split out of the oversized interaction test suite
- `tui/internal/ui/interaction_scrollable_modal_test.go`: bounded scroll
  windows, scrollable modal frame behavior, body wheel routing, tabs/buttons,
  and selectable list rails split out of the oversized interaction test suite
- `tui/internal/ui/interaction_modal_window_hits_test.go`: modal index rails,
  indexed-list rails, clipped/offset windowed list hits, and cursor-centered
  indexed list windows split out of scrollable modal frame coverage.
- `tui/internal/ui/interaction_help_commands_test.go`: Help command catalog,
  copy guidance, compact sizing, capability gating, and global-row rendering
  coverage split out of the oversized interaction test suite
- `tui/internal/ui/interaction_hit_geometry_test.go`: modal key hints,
  stepper hit areas, textarea cursor/wheel regions, text span hits, screen
  surfaces, and pane focus geometry coverage split out of the oversized
  interaction test suite
- `tui/internal/ui/interaction_modal_rows_test.go`: modal-list column geometry,
  scrollable modal row hit clipping, and row-detail footer hint coverage split
  out of the oversized interaction test suite
- `tui/internal/ui/interaction_hit_dispatch_test.go`: hit registry ordering,
  overlay hit isolation, overlay wheel isolation, and wheel-vs-click dispatch
  precedence coverage split out of the oversized interaction test suite
- `tui/internal/ui/detail_view_interaction_test.go`: detail modal copy,
  drag-selection, footer hint, Ctrl+E open, close, and scroll-key coverage
  split out of the oversized detail-view suite
- `tui/internal/ui/catalog_browser_modal_test.go`: disabled tool toggles,
  catalog modal escape/slash handling, and catalog title mapping split out of
  the oversized catalog-browser regression suite.
- `tui/internal/ui/catalog_browser_agents_test.go`: agent catalog navigation,
  one-turn override, write/edit helpers, clone/delete actions, and child-agent
  catalog loading split out of the oversized catalog-browser regression suite.
- `tui/internal/ui/catalog_browser_agent_detail_test.go`: agent detail modal
  rows, planner command rows, tool/child/MCP drill-down, capability refs, and
  skill/validation formatting split out of the oversized catalog-browser
  regression suite.
- `tui/internal/ui/catalog_browser_blueprints_test.go`: agent-blueprint detail
  action-bar rendering, embedded expert detail, activation state, and backend
  enum humanization coverage kept focused on the detail surface.
- `tui/internal/ui/catalog_browser_blueprint_management_test.go`: packaged
  hook enablement, update/delete confirmation, delete cancellation, and update
  shortcut dispatch coverage split out of the blueprint detail suite.
- `tui/internal/ui/catalog_browser_blueprint_messages_test.go`: agent-blueprint
  management/source error normalization and post-update detail reload coverage
  split away from catalog-browser action tests.
- `tui/internal/ui/catalog_browser_blueprint_catalog_test.go`:
  agent-blueprint source registry rows, blueprint catalog grouping, and
  hierarchy stress coverage split out of the oversized catalog-browser
  regression suite.
- `tui/internal/ui/catalog_browser_blueprint_sources_test.go`:
  marketplace-source remove confirmation, add/refresh/remove commands, and
  source-blueprint install action coverage split out of blueprint catalog rows.
- `tui/internal/ui/catalog_browser_mcp_test.go`: MCP detail loading,
  connection summary formatting, reconnect handling, and resource detail
  coverage split out of the oversized catalog-browser regression suite.
- `tui/internal/ui/catalog_browser_tools_test.go`: tool detail loading,
  schema/annotation formatting, dense tool catalog metadata, and unified
  Tools/MCP source-row management coverage split out of the oversized
  catalog-browser regression suite.
- `tui/internal/ui/catalog_browser_tool_summary_test.go`: tool summary and
  catalog-description helper coverage split away from server-backed detail
  loading and catalog interaction tests.
- `tui/internal/ui/catalog_browser_detail_test.go`: generic catalog drill-down,
  detail modal loading, detail error copy, sanitized backend labels, and
  detail-kind hint coverage split out of the former catalog-browser catch-all.
- `tui/internal/ui/catalog_browser_scroll_test.go`: catalog selection
  scroll-into-view behavior and shared rail rendering split out of the former
  catalog-browser catch-all.
- `tui/internal/ui/catalog_browser_test_helpers_test.go`: shared catalog
  browser fixtures retained after deleting the former catch-all
  `catalog_browser_lll2_test.go`.
- `tui/internal/ui/catalog_browser_guidance.go`: catalog empty-state guidance
  rows, context-line copy, and guidance step labels split away from modal
  assembly and hit registration.
- `tui/internal/ui/catalog_mcp_support.go`: MCP connection status tags, live
  handshake enrichment, capability-count summaries, and tool-server extraction
  split away from generic tool catalog item construction.
- `tui/internal/ui/catalog_blueprint_detail_items.go`: agent-blueprint detail
  rows, activation blocking, overview formatting, and inline status summaries
  split away from blueprint catalog list grouping.
- `tui/internal/ui/render_handoff_summaries.go`: expert-handoff output
  normalization, workflow-state stripping, structured/error summaries, and
  summary scoring split away from lifecycle status rendering.
- `tui/internal/ui/mouse_input.go`: composer command-chip rendering, input
  focus geometry, textarea cursor hits, and compressed-paste mouse expansion
  split away from global mouse event dispatch.
- `tui/internal/ui/input_event_helpers.go`: shared wheel movement helpers and
  synthetic key-message constructors split away from mouse event dispatch.
- `tui/internal/ui/clipboard_message_text.go`: message-level clipboard and
  retry text extraction split away from semantic part/tool/handoff copy
  formatting.
- `tui/internal/ui/clipboard_message_text_test.go`: last-assistant extraction,
  selected semantic block formatting, full conversation export, and copy-cache
  invalidation coverage split out of the oversized clipboard behavior suite.
- `tui/internal/ui/clipboard_native_test.go`: native clipboard utility
  probing, platform bridge fallbacks, cached command reuse, and unavailable
  backend diagnostics split out of the oversized clipboard behavior suite.
- `tui/internal/ui/clipboard_adapter_test.go`: high-level clipboard adapter
  empty-text handling, OSC52 fallback, diagnostic failure hints, forced-failure
  path, and exact-copy success hints split out of the clipboard behavior suite.
- `tui/internal/ui/clipboard_test.go`: body/sidebar copy keybindings,
  full-conversation export shortcuts, and `/copy` selected-block fallback
  routing kept focused on user-facing clipboard commands.
- `tui/internal/ui/doctor_capability_labels.go`: capability display names,
  plain support labels, scope labels, and detail meanings split away from
  doctor capability table rendering.
- `tui/internal/ui/interaction_latency_summary.go`: interaction latency DTOs,
  percentile summaries, and operator-facing latency text split away from JSON
  report writing.
- `tui/internal/ui/interaction_latency_targets.go`: TUI interaction hit-target
  labels and target-to-surface routing split away from latency sample
  recording.
- `tui/internal/ui/prompt_catalog_rows_test.go`: prompt catalog provider rows,
  prompt profile summaries, validation text, and title normalization split out
  of the oversized prompt/catalog regression suite.
- `tui/internal/ui/prompt_catalog_empty_state_test.go`: prompt rendering,
  validation/reload formatting, prompt empty-state guidance, catalog context
  line, and prompt-provider hint coverage split out of the oversized
  prompt/catalog regression suite.
- `tui/internal/ui/prompt_detail_test.go`: prompt detail opening, profile
  management controls, prompt-resolution copy, and prompt edit modal coverage
  split out of the oversized prompt/catalog regression suite.
- `tui/internal/ui/agent_blueprint_manage_modal_test.go`: agent-blueprint
  install/validate/source modal copy, paste behavior, prefill state, and
  semantic hit-target coverage split out of the oversized prompt/catalog
  regression suite.
- `tui/internal/ui/command_palette_overview_test.go`: command-palette
  discoverability, default area overview rendering, representative command
  examples, and alias hiding split out of the oversized prompt/catalog
  regression suite.
- `tui/internal/ui/expert_pack_catalog_test.go`: expert-pack catalog rows,
  empty-state guidance, install modal lifecycle, lifecycle label, and
  operation-status coverage split out of the oversized prompt/catalog
  regression suite.
- `tui/internal/ui/expert_pack_detail_test.go`: expert-pack detail overview,
  action placement, expert hierarchy, delete confirmation, and invalid
  activation coverage split out of the oversized prompt/catalog regression
  suite.
- `tui/internal/ui/agent_blueprint_catalog_items_test.go`:
  agent-blueprint catalog rows, source provenance, source-backed grouping,
  active markers, lifecycle status tags, and validation warning coverage split
  out of the oversized prompt/catalog regression suite.
- `tui/internal/ui/agent_blueprint_detail_test.go`: agent-blueprint detail
  overview, packaged MCP/hook rows, command provenance, validation formatting,
  activation state, and installed-management action coverage split out of the
  oversized prompt/catalog regression suite.
- `tui/internal/ui/skills_catalog_test.go`: skills catalog empty-state and
  operator-facing skill row coverage retained after deleting the final
  `prompt_catalog_test.go` mixed suite.
- `tui/internal/ui/tool_evidence_live_test.go`: live and metadata-backed tool
  evidence promotion, duplicate suppression, `message.completed` merge,
  part-replacement, and semantic preview rendering split out of the oversized
  tool evidence regression suite.
- `tui/internal/ui/tool_evidence_generic_test.go`: generic tool-evidence
  normalization, point-filter summaries, and compact structured-result previews
  retained after deleting the final `tool_evidence_test.go` mixed suite.
- `tui/internal/ui/tool_evidence_handoff_test.go`: expert-handoff promotion,
  started-handoff copy, adapter-section parsing, nested indentation, and
  workflow-state summary coverage split out of the oversized tool evidence
  regression suite.
- `tui/internal/ui/tool_evidence_handoff_format_test.go`: expert-handoff
  inline preview, lifecycle wording, region/typed-state cleanup, markdown table
  recovery, and parent-resumed filtering split out of the oversized tool
  evidence regression suite.
- `tui/internal/ui/tool_evidence_handoff_workflow_test.go`: end-to-end Reno
  EarthScope handoff/tool rendering fixture split away from atomic handoff
  formatting cases.
- `tui/internal/ui/tool_evidence_dedup_test.go`: redundant direct-tool handoff
  filtering, duplicate metadata evidence compaction, and repeated inline tool
  run collapsing split out of the oversized tool evidence regression suite.
- `tui/internal/ui/tool_evidence_ndp_test.go`: NDP dataset, visualization
  artifact, and NDP feature collection transcript preview coverage split out of
  the oversized tool evidence regression suite.
- `tui/internal/ui/tool_evidence_scientific_test.go`: SAC, Parquet, HDF5, CSV,
  and EarthScope waveform summary/path-shortening coverage split out of the
  oversized tool evidence regression suite.
- `tui/internal/ui/tool_evidence_compaction_test.go`: compacted-context
  promotion and collapsed preview coverage split out of the oversized tool
  evidence regression suite.
- `tui/internal/ui/tool_evidence_error_test.go`: tool error, message error,
  stop-reason partial, and failed/partial handoff coverage split out of the
  oversized tool evidence regression suite.
- `tui/internal/ui/tool_evidence_render_test.go`: tool-result hard wrapping and
  detached live-result semantic preview/detail coverage retained after deleting
  the final `tool_evidence_test.go` mixed suite.
- `tui/internal/ui/stream_provenance_text_test.go`: text delta provenance,
  post-hoc transcript badges, live-stream badge suppression, and empty
  assistant shell hiding split out of the oversized stream provenance suite.
- `tui/internal/ui/stream_provenance_live_cache_test.go`: semantic live-trace
  session restoration, per-session cache namespacing, and running-vs-idle
  reload merge behavior split out of the oversized stream provenance suite.
- `tui/internal/ui/stream_provenance_delegation_test.go`: delegation handoff
  wording, contract stripping, workflow-state summaries, and output summaries
  split out of the oversized stream provenance suite.
- `tui/internal/ui/stream_provenance_agent_routing_test.go`: generic agent
  invocation fallback and selected-expert routing summaries split away from
  delegation-specific semantic provenance tests.
- `tui/internal/ui/stream_provenance_dedup_test.go`: duplicate semantic
  workflow-row suppression and loaded transcript vs semantic-live cache
  de-duplication split out of the delegation provenance suite.
- `tui/internal/ui/stream_provenance_failures_test.go`: provider, LLM, hook,
  and redacted-tool semantic failure rendering/detail coverage split out of the
  oversized stream provenance suite.
- `tui/internal/ui/layout_input_paste_test.go`: composer placeholder,
  newline-entry, bracketed-paste Enter safety, and long-input border coverage
  split out of the oversized `layout_fixes_test.go` mixed suite.
- `tui/internal/ui/layout_paste_compression_test.go`: paste
  compression/expansion, CRLF normalization, Ctrl+P expansion, and post-failure
  draft restoration split away from input layout tests.
- `tui/internal/ui/layout_compose_test.go`: compose modal open/commit/cancel,
  semantic buttons, copy, textarea hit targets, wheel handling, outside-click
  cancel, and compose paste normalization coverage split out of the oversized
  `layout_fixes_test.go` mixed suite.
- `tui/internal/ui/layout_file_picker_test.go`: input `@` file-picker open,
  selection insertion, load-failure containment, fuzzy scoring, and mid-word
  passthrough coverage split out of the oversized `layout_fixes_test.go` mixed
  suite.
- `tui/internal/ui/layout_help_footer_test.go`: long-conversation footer
  containment and help-overlay tab/viewport coverage split out of the oversized
  `layout_fixes_test.go` mixed suite.
- `tui/internal/ui/layout_session_commands_test.go`: delete, clear, cancel,
  sessions focus, duplicate, and new-session command coverage split out of the
  oversized `layout_fixes_test.go` mixed suite.
- `tui/internal/ui/layout_settings_theme_test.go`: theme cycling, command
  palette theme hints, threshold persistence, cost and paste settings, and
  intro-toggle coverage split out of the oversized `layout_fixes_test.go` mixed
  suite.
- `tui/internal/ui/layout_input_state_test.go`: per-session draft retention,
  post-send draft clearing, transient hint expiry, textarea cursor hit targets,
  and multi-line input-pane growth coverage split out of the oversized
  `layout_fixes_test.go` mixed suite.
- `tui/internal/ui/layout_body_navigation_test.go`: body cursor movement,
  selected-message deletion, search-hit marking, and timestamp-toggle rendering
  coverage split out of the oversized `layout_fixes_test.go` mixed suite.
- `tui/internal/ui/layout_status_window_test.go`: SSE health-dot rendering,
  active-session window-title state, and detached-session title badges split out
  of the removed `layout_fixes_test.go` mixed suite.
- `tui/internal/ui/layout_catalog_routes_test.go`: catalog command routing and
  open/load/escape-close state-machine coverage split out of the removed
  `layout_fixes_test.go` mixed suite.
- `tui/internal/ui/layout_render_bounds_test.go`: viewport-height render
  bounding coverage split out of the removed `layout_fixes_test.go` mixed suite.
- `tui/internal/ui/i18n_test.go`: locale catalog parity, language option,
  placeholder, transient hint, and general translated chrome coverage.
- `tui/internal/ui/i18n_lm_config_test.go`: LM configuration localization,
  provider body copy, and wide Unicode box-width coverage split away from core
  localizer behavior.
- `tui/internal/ui/lm_config_auth_test.go`: Argonne/ALCF OAuth readiness,
  failure, and post-auth model-refresh coverage split out of the oversized LM
  configuration artifact suite.
- `tui/internal/ui/lm_config_render_artifact_test.go`: optional LM provider
  visual artifact writer split away from the behavioral LM configuration suite.
- `tui/internal/ui/lm_config_advanced_test.go`: advanced LM configuration
  numeric row navigation, arrow hit-target value changes, and row/hit ordering
  split out of the oversized LM configuration artifact suite.
- `tui/internal/ui/lm_config_lifecycle_test.go`: save, close,
  unsupported-endpoint, and async-ready lifecycle coverage split out of the
  oversized LM configuration artifact suite.
- `tui/internal/ui/lm_config_hit_targets_test.go`: provider row, filter,
  provider details, provider rail, and provider-window semantic hit-target
  coverage split out of the oversized LM configuration artifact suite.
- `tui/internal/ui/lm_config_header_hit_targets_test.go`: provider modal
  save/close/refresh buttons, header glyph/background styling, and surface
  wheel-blocking coverage split out of the LM configuration hit-target suite.
- `tui/internal/ui/lm_config_model_hit_targets_test.go`: model row, wheel,
  rail, and visible-window semantic hit-target coverage split out of the
  broader LM configuration hit-target suite.
- `tui/internal/ui/lm_config_paste_test.go`: API-key, provider filter, model
  filter, and API-base paste routing coverage split out of the oversized LM
  configuration artifact suite.
- `tui/internal/ui/lm_config_catalog_test.go`: fallback/live/static model
  catalog selection, background provider checks, and typed provider/model
  filter coverage split out of the oversized LM configuration artifact suite.
- `tui/internal/ui/lm_config_dispatch_test.go`: preset API-base synchronization,
  global LM save dispatch, and per-session model patch request coverage split
  out of the oversized LM configuration artifact suite.
- `tui/internal/ui/lm_config_artifact_test.go`: remaining LM configuration
  visible-field and keyboard navigation coverage after lifecycle, catalog,
  dispatch, paste, hit-target, layout, and artifact-writer splits.
- `tui/internal/ui/lm_config_layout_test.go`: LM configuration modal sizing,
  box geometry, warning wrapping, context-label wording, and short-terminal
  render coverage split away from field navigation behavior.
- `tui/internal/ui/command_palette_behavior_test.go`: command-palette
  category classification, category navigation, footer copy, command subtitle,
  and normalized built-in command behavior split out of the oversized
  prompt/catalog regression suite.
- `tui/internal/ui/interaction_focus_test.go`: Ctrl+I pane-cycle behavior split
  out of the former catch-all interaction test suite.
- `tui/internal/ui/interaction_selection_test.go`: selection movement, scroll
  movement, and selected-item window helper coverage split out of the former
  catch-all interaction test suite.
- `tui/internal/ui/interaction_modal_layout_test.go`: shared modal top-corner,
  width, and compact help placement coverage split out of the former catch-all
  interaction test suite.
- `tui/internal/ui/interaction_test_helpers_test.go`: shared interaction test
  helpers retained as package-level fixtures after removing the catch-all
  interaction test file.
- `tui/main_diag_test.go`: local CLI diagnostic probe coverage split out of
  the oversized CLI integration test suite, keeping backend-free diagnostics
  separate from emulator-backed command tests.
- `tui/main_theme_test.go`: local theme show/list/set CLI coverage split out
  of the oversized CLI integration test suite, keeping config-file behavior
  separate from emulator-backed command tests.
- `tui/main_version_test.go`: CLI version output and build metadata override
  coverage split out of the oversized CLI integration test suite.
- `tui/cli_plugins.go`: plugin directory/listing command implementation kept
  separate from backend-backed automation command families.
- `tui/main_plugins_test.go`: local plugin manifest discovery/listing coverage
  split out of the oversized CLI integration test suite.
- `tui/cli_tasks.go`: task list/add/set/remove/summary command implementation
  split out of the mixed automation CLI file.
- `tui/main_tasks_test.go`: task summary, status filtering, and task lifecycle
  CLI coverage split out of the oversized CLI integration test suite.
- `tui/main_list_test.go`: session list filtering, sorting, and detached-only
  CLI coverage split out of the oversized CLI integration test suite.
- `tui/main_mcp_test.go`: MCP list, resource-read, reconnect, and detail CLI
  coverage split out of the oversized CLI integration test suite.
- `tui/cli_hooks.go`: hook list/add/remove command implementation split out of
  the mixed automation CLI file.
- `tui/main_hooks_test.go`: hook list filtering and hook lifecycle CLI
  coverage split out of the oversized CLI integration test suite.
- `tui/main_permissions_test.go`: permission rules, permission list JSON, and
  permission allow flow CLI coverage split out of the oversized CLI integration
  test suite.
- `tui/main_grep_test.go`: cross-session grep, grep limit, and grep role
  filter CLI coverage split out of the oversized CLI integration test suite.
- `tui/main_dashboard_test.go`: dashboard rendering, watch mode, status
  filtering, and sort CLI coverage split out of the oversized CLI integration
  test suite.
- `tui/cli_dashboard_render.go`: dashboard one-shot fetch, detached registry
  decoration, JSON/TSV/pretty formatting, sorting, and compact value helpers
  split away from command flag parsing and watch-loop orchestration.
- `tui/main_log_test.go`: log rendering, JSON output, role filtering, grep
  filtering, and since-window CLI coverage split out of the oversized CLI
  integration test suite.
- `tui/main_context_test.go`: context list filters, JSON output, file previews,
  upload handling, backend errors, and add/remove round-trip CLI coverage split
  out of the oversized CLI integration test suite.
- `tui/cli_context_mutation.go`: context upload/add/remove command
  implementations split away from context list/show preview rendering.
- `tui/main_agent_deploy_test.go`: agent deploy/list/stop/remove lifecycle
  coverage, CLIO deploy coverage, startup timeout defaults, and Python
  entrypoint resolution split out of the oversized CLI integration test suite.
- `tui/cli_agent_registry.go`: local agent registry list/stop/remove/connect
  commands split away from adapter deployment and process spawning.
- `tui/main_attach_test.go`: attach print-only behavior, detached registry
  probing, and default attach target selection split out of the oversized CLI
  integration test suite.
- `tui/main_files_test.go`: workspace file listing, glob filtering, JSON
  output, and file-read CLI coverage split out of the oversized CLI integration
  test suite.
- `tui/main_export_import_test.go`: single-session export, bulk export,
  import round trips, stdin import, malformed import, and missing-session export
  coverage split out of the oversized CLI integration test suite.
- `tui/cli_dump_bundle.go`: dump-bundle command orchestration split away from
  local diagnostic report and terminal capability probe formatting.
- `tui/main_dump_bundle_test.go`: dump-bundle layout, bounded fanout, and
  since-window CLI coverage split out of the oversized CLI integration test
  suite.
- `tui/main_info_test.go`: info command metadata, include sections, permission
  summaries, JSON output, and detached-flag coverage split out of the oversized
  CLI integration test suite.
- `tui/cli_session_revisions.go`: undo and rewind session revision commands
  split away from single-session metadata inspection.
- `tui/main_env_test.go`: environment/config text and JSON CLI output coverage
  split out of the oversized CLI integration test suite.
- `tui/cli_manual_content.go`: static text and roff manual payloads split away
  from `gact man` command parsing and shell integration installation.
- `tui/main_manual_test.go`: text, roff, and unsupported-format coverage for
  the `gact man` command.
- `tui/main_follow_test.go`: follow command snapshot and streamed output
  coverage in text and NDJSON modes split out of the oversized CLI integration
  test suite.
- `tui/main_tail_test.go`: tail command filtering, JSON stream output, and
  human-readable text formatting coverage split out of the oversized CLI
  integration test suite.
- `tui/main_stream_test.go`: stream command filtering and human-readable SSE
  timeline coverage split out of the oversized CLI integration test suite.
- `tui/main_session_lifecycle_test.go`: session creation, rename, delete,
  archive/unarchive, fork, workspace list, and `session` alias lifecycle
  coverage split out of the oversized CLI integration test suite.
- `tui/cli_workflow_actions.go`: summarize and quick one-shot workflow command
  implementations split away from primitive session/message actions.
- `tui/main_turn_actions_test.go`: ask, send, run, wait, cancel, tell,
  asynchronous tell, and wait-any CLI coverage split out of the oversized CLI
  integration test suite.
- `tui/main_capabilities_test.go`: capability command text/JSON output and
  decoded capability flag coverage split out of the oversized CLI integration
  test suite.
- `tui/main_watch_test.go`: watch command status transition coverage in TSV and
  NDJSON modes split out of the oversized CLI integration test suite.
- `tui/main_history_test.go`: diff, rewind, and undo mutation coverage split
  out of the oversized CLI integration test suite.
- `tui/main_system_test.go`: ping, conformance, bench, and metrics coverage
  split out of the oversized CLI integration test suite.
- `tui/main_discovery_test.go`: agent/tool show, repo-map, models, search,
  and catalog coverage split out of the oversized CLI integration test suite.
- `tui/main_workflow_test.go`: voice, replay, summarize, and quick workflow
  command coverage split out of the oversized CLI integration test suite.
- `tui/main_help_test.go`: shell completion and top-level help coverage split
  out of the oversized CLI integration test suite.

Validation gate:

```sh
go test ./tui/internal/client
go test ./tui/...
```

### `apps/desktop`

Role: Tauri shell, native sidecar supervision, OS integrations, SSH tunnels,
SSE bridge, and native command surface.

Current shape is already more modular than the web route layer:

- Tauri command wrappers live in `commands.rs`; `lib.rs` stays focused on app
  setup, managed state, menu/tray wiring, and shutdown hooks
- `gact_http.rs` owns the desktop CORS-bypass HTTP command while
  `gact_http_tests.rs` owns the live-backend proxy contract tests
- `sidecar-launcher/resolve.go` owns `clio-agent-gact` runtime discovery and
  candidate ordering; `sidecar-launcher/main.go` stays focused on CLI parsing
  and child process execution
- supervisor lifecycle is split across `supervisor_*` modules
  - `supervisor_state.rs` owns the mutex-protected backend handle and child process slot
  - `supervisor_spawn_command.rs` owns the sidecar launcher command line so the spawn contract is unit-tested without booting a child process
- SSE bridge is split across `sse_*` modules
- SSH tunnel behavior is split across `ssh_*` modules
- `lib.rs` is still the Tauri command registry and app setup boundary

Safe desktop changes should preserve Tauri command names and frontend contracts.
Avoid splitting `lib.rs` mechanically unless the extracted module owns a real
domain such as install commands, app setup, or shutdown handlers.

Validation gate:

```sh
cd apps/desktop/src-tauri
cargo fmt
cargo test --lib

cd apps/desktop
pnpm test
```

## Rework Rules

1. Keep behavior/state owners stable. Extract rendering or type surfaces first;
   move state machines only when tests cover the transition.
2. Each commit should describe one seam. Do not bundle unrelated cleanups.
3. Preserve public imports through re-exports when splitting core client files.
4. Do not rename test IDs or visible copy during structural splits.
5. Run `git diff --check` on touched files before committing.
6. Leave generated audit screenshots and capture folders out of source commits
   unless the task explicitly asks to update them.
7. Prefer targeted tests first, then the package-level suite before push.

## Next Safe Seams

High-confidence web seams:

- `SettingsModelChooser.tsx`: provider/model rows have been split from
  apply/auth behavior. Further changes should add direct component coverage if
  they alter the rendered control structure.
- `ChatLayout.tsx`: split static layout regions only after identifying the
  exact prop groups. This file is central, so prefer extracting typed prop
  mappers before moving behavior.
- `ChatScreenLiveDriven.tsx`: split runtime assembly into hooks only when each
  returned object has a stable domain name. This is high blast radius because it
  wires live sessions, transcript, inspector, workspace semantics, and turn
  actions.
- `CatalogBrowser.tsx`: backend hit mapping and result-list rendering have been
  split. Further work should add component-level coverage before moving modal
  lifecycle or keyboard behavior.
- `PreviewRail.tsx`: already has Browser, Preview, and Model splits. Further
  work should be performance-focused, not file-count-driven.

Core seams:

- continue only when a type/helper is consumed from multiple files or a client
  layer mixes endpoint domains
- avoid splitting already small endpoint files just to reduce line count

Recent TUI source splits:

- `tui/internal/ui/sidebar_session_rows.go`: session row height, selected-session summary, and active-blueprint indicator helpers split away from sidebar section focus and visible-range calculations.
- `tui/internal/ui/doctor_integration_detail.go`: Doctor integration row hit targets and shared detail-view opening split away from Doctor fetch/key/modal frame orchestration.
- `tui/internal/ui/conversation_empty_states.go`: first-run and empty-selected-session conversation bodies split away from conversation pane geometry, scrolling, and transcript rendering.
- `tui/internal/ui/catalog_agent_identity.go`: reusable agent metadata, parent lookup, title normalization, prompt-resolution, and model label helpers split away from agent catalog row construction.
- `tui/internal/ui/agent_edit_view.go`: edit-agent modal frame, buttons, cursor row rendering, and row-value presentation split away from edit fetch/update and mutation handling.
- `tui/internal/ui/agent_write_view.go`: create/clone/extract agent modal frame and text-entry presentation split away from agent write command, lifecycle, and input mutation handling.
- `tui/internal/ui/agent_write_commands.go`: create, clone, extract, and delete
  agent backend commands plus agent-id/title/metadata helpers split away from
  agent write modal lifecycle and text editing.
- `tui/internal/ui/help_tabs.go`: help-overlay tab catalog, keybinding IDs, and localized tab labels split away from the help modal renderer and scroll/window sizing logic.
- `tui/internal/ui/interaction_selectable_list_modal.go`: selectable-list modal framing, scroll window, wheel, tab, button, and rail hit registration split away from reusable modal list row/column rendering.
- `tui/internal/ui/interaction_modal_buttons.go`: menu button model, close-button action helper, centered action row rendering, and button hit registration split away from tab/stepper/inline-option controls.
- `tui/internal/ui/interaction_scrollable_modal_frame.go`: scrollable modal
  frame assembly, body wheel/surface registration, scroll rail hits, row hit
  clipping, and row-detail footer hints split away from base modal chrome.
- `tui/internal/ui/presentation_summary_values.go`: shared structured-value extraction, compact numeric formatting, named-item summaries, and case-folded field lookup split away from top-level tool-result dispatch.
- `tui/internal/ui/presentation_workflow_state_parse.go`: embedded CLIO workflow-state text detection, JSON-object boundary matching, and workflow-state JSON parsing split away from normalized workflow-state summary formatting.
- `tui/internal/ui/execution_artifact_details.go`: execution artifact path discovery, artifact-like path detection, de-duplication, and shell diff generation split away from selected-node detail reference orchestration.
- `tui/internal/ui/execution_report_structured.go`: structured execution report row construction for acquisition, station catalog, profile, region, and artifact fields split away from report parsing and control-section cleanup.
- `tui/internal/ui/render_perf_test.go`: large semantic transcript and detail
  rendering benchmarks plus reusable benchmark fixtures kept separate from
  cache correctness assertions.
- `tui/internal/ui/render_cache_test.go`: conversation render-cache
  invalidation and visible-metadata fingerprint coverage split away from
  benchmark definitions.

Desktop seams:

- prefer tests around command behavior and sidecar lifecycle over cosmetic
  reshuffling
- do not move Tauri commands without preserving `tauri::generate_handler!`
  coverage and running Rust tests

## Current Risk Register

- Large live orchestration files (`ChatScreenLiveDriven.tsx`,
  `chatLayoutModel.tsx`, `ChatLayout.tsx`) remain central and high-risk.
- Full visual correctness for the TUI execution timeline is governed by
  `codex-proposal-representation.md`; web/desktop should adapt those semantics
  to their medium rather than copying terminal key hints literally.
- Existing generated visual/audit artifacts are intentionally dirty in the
  worktree. They are evidence from prior TUI capture work, not source cleanup.

## Completion Definition

This rework is not complete just because files are smaller. Completion requires:

- core client domains have clear ownership and stable public exports
- web route/controller files separate behavior from large presentational blocks
- desktop command/supervisor code keeps clear native boundaries
- TUI execution rendering follows the timeline projection model in
  `codex-proposal-representation.md`
- package validation and relevant visual checks pass for the changed surfaces
- the remaining large files have documented reasons for staying large or a
  concrete next seam
