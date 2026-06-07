# Slash Command Visual Coverage

This ledger tracks operator-visible slash commands separately from the broader
visual corpus in `COVERAGE.md`. Keep it current when commands move between the
palette, help, catalog views, or dedicated modals.

The goal is not one tape per command by default. Prefer one representative tape
for each operator workflow, then add command-specific captures only when the
command opens a distinct surface, has unusual failure modes, or is demo-critical.

## Shared Evidence

These tapes prove the shared command model:

- `codex_palette_operator_surface.tape`: command-area overview, category
  drilldown, canonical search, and alias hiding.
- `semantic_help_commands_operator.tape`: command help as grouped operator
  areas with click-to-stage command rows.
- `semantic_narrow_help_keybindings.tape`: compact keybindings and grouped
  command help at narrow width.
- `semantic_menu_smoke.tape`: shared modal chrome for help, settings, metrics,
  tools, and MCP.
- `semantic_palette_long_category.tape`: long extension-command category
  scrolling.
- `semantic_narrow_operator_surfaces.tape`: narrow palette, tools/MCP,
  permissions, provider setup, and detail surfaces.

## Canonical Commands

| Command | Area | Representative visual proof | Deferred command-specific captures |
| --- | --- | --- | --- |
| `/clear` | Session | `semantic_clear_no_session.tape`, `semantic_clear_confirm_and_cleared.tape`; shared palette/help proof; command listed under Session in `codex_palette_operator_default.png` and `semantic_menu_help_commands.png` | None currently required |
| `/copy` | Session | `codex_help_operator_copy.tape`, `semantic_conversation_block_copy.tape`, `semantic_copy_affordance.tape`, `semantic_mouse_drag_copy_failure.tape`, native-selection tapes | More live terminal permutations for platform clipboard failures |
| `/cancel` | Session | `semantic_cancel_idle_state.tape`, `semantic_cancel_running_recovery.tape`, `semantic_cancel_failure.tape`; shared palette/help proof; streaming/failure surfaces in semantic and live CLIO tapes | None currently required |
| `/compact` | Session | Shared palette/help proof; `/compact` uses the current summarize endpoint and refreshes the selected session summary | Live long-session compaction capture after a real benchmark run |
| `/mode` | Session | Shared palette/help proof; cycles auto/chat/experts routing in place | None currently required |
| `/new` | Session | `semantic_new_session_slash.tape`, `semantic_new_session_failure.tape`; shared palette/help proof; session/sidebar tapes cover new-session controls | None currently required |
| `/rename` | Session | `semantic_session_actions.tape`, `semantic_text_entry_modals.tape`, `semantic_rename_failure.tape` | None currently required |
| `/sessions` | Session | `semantic_sessions_slash_filter.tape`, `semantic_sessions_slash_no_match.tape`, `semantic_session_actions.tape`, sidebar filter tapes | None currently required |
| `/duplicate` | Session | `semantic_duplicate_no_session.tape`, `semantic_duplicate_success.tape`, `semantic_duplicate_failure.tape`; shared palette/help proof | None currently required |
| `/diff` | Workspace | `semantic_diff_clean_workspace.tape`, `semantic_diff_dirty_workspace.tape`, `semantic_diff_large_scroll.tape`, `semantic_diff_actions.tape`, workspace tapes | None currently required |
| `/add` | Workspace | `semantic_add_no_session.tape`, `semantic_add_backend_failure.tape`, `semantic_context_actions.tape`, `semantic_context_add_modal.png`, file picker tapes | None currently required |
| `/drop` | Workspace | `semantic_drop_no_context.tape`, `semantic_drop_backend_failure.tape`, `semantic_context_actions.tape` | None currently required |
| `/tools` | Runtime | `semantic_tools_mcp_catalog.tape`, `semantic_tools_action_detail.tape`, disconnected/unavailable/empty tools tapes, menu smoke | Large live mixed-source catalog with many MCP connections |
| `/mcp` | Runtime | `semantic_mcp_connection_overview_detail.tape`, install/remove/reconnect/failure tapes | Registry-backed marketplace-source install/remove once backend semantics settle |
| `/prompts` | Runtime | `semantic_prompt_catalog.tape`, prompt empty/stress tapes | Successful provider-specific prompt save against a live backend |
| `/skills` | Experts | `semantic_skills_catalog.tape` | Non-empty skill install/update/remove lifecycle once available |
| `/experts` | Experts | `semantic_agent_management.tape`, agent stress/write-failure tapes | Large tree/detail combinations beyond current stress states |
| `/expert-packs` | Experts | `semantic_expert_packs.tape`, empty/stress/install-failure tapes | Successful install/update/delete against a real source |
| `/agent-blueprints` | Experts | `semantic_agent_blueprint_active_marker_catalog.png`, `semantic_agent_blueprint_active_marker_detail.png`, management, sources, failures, tree-stress, and narrow tapes | Real marketplace-source install/update/remove/refresh lifecycle against current CLIO registry semantics |
| `/theme` | Settings | `semantic_settings_lists.tape`, palette theme filter screenshots | None currently required |
| `/agent` | Settings | `semantic_settings_agent_compact.tape`, `semantic_settings_agent_long.tape`, settings lists | None currently required |
| `/model` | Settings | provider setup, settings lists, provider edge/auth tapes | Real ALCF provider failure and recovery capture |
| `/mouse` | Settings | `semantic_mouse_native_selection.tape`, copy/native-selection tapes, help command staging test | None currently required |
| `/theme-next` | Settings | `semantic_theme_cycle.tape`, shared palette/help proof | None currently required |
| `/theme-prev` | Settings | `semantic_theme_cycle.tape`, shared palette/help proof | None currently required |
| `/doctor` | Diagnostics | `semantic_doctor_smoke.tape`, `semantic_doctor_gaps.tape` | Real CLIO doctor output with partial capability gaps |
| `/permissions` | Diagnostics | permission banner, inspector, stress, and narrow tapes | Live MCP permission decision from real CLIO session |
| `/metrics` | Diagnostics | `semantic_menu_metrics.tape` | Live long-running benchmark metrics during active stream |
| `/memory` | Diagnostics | memory inspector/search/stress/unavailable tapes | Real CLIO memory pressure capture after long demo session |
| `/help` | Diagnostics | help commands/operator copy/menu smoke tapes | None currently required |

## Hidden Or Folded Commands

These commands may still route for compatibility but should not appear as
primary operator choices in the default palette or help command catalog.

| Command | Operator treatment | Visual proof |
| --- | --- | --- |
| `/catalog` | Folded into `/tools` | Palette tests and `codex_palette_operator_surface.tape` hide it from default discovery |
| `/agents-list` | Folded into `/experts` | Palette/help tests hide it from primary discovery |
| `/blueprints` | Folded into `/agent-blueprints` | Palette tests resolve searches to canonical `/agent-blueprints` |
| `/theme-export` | Action inside Settings/Theme, not top-level discovery | Palette/help tests hide it from primary discovery |
| `/mcp-install`, `/mcp-remove` | Actions inside `/mcp` | MCP install/remove tapes |

## Dynamic Commands

Workflow commands from active blueprints and backend extension commands are
shown under dedicated groups instead of being mixed into core commands.

| Command class | Visual proof | Deferred captures |
| --- | --- | --- |
| Workflow Commands | Prompt/blueprint provenance tests and active-blueprint command palette tape | Real benchmark blueprint command pack once final graph is installed |
| Extension Commands | `semantic_palette_long_category.tape` | Backend extension command detail/action failure |

## Maintenance Rules

- Add a row here when a command becomes an operator-facing command.
- If a command becomes an in-view action, move it to "Hidden Or Folded
  Commands" and name the owning view.
- Do not require a standalone tape for every command unless the command opens a
  unique surface, has demo risk, or changes the UX model.
- Keep deferred rows specific enough that a later pass can record exactly the
  missing state instead of regenerating the whole corpus.
