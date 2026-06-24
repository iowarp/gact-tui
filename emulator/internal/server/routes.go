package server

// routes registers all GACT v0.1 endpoints. Each route uses Go 1.22+ method-
// prefixed pattern matching.
func (s *Server) routes() {
	// §3 — Capability discovery + health
	s.mux.HandleFunc("GET /v1/health", s.handleHealth)
	s.mux.HandleFunc("GET /v1/capabilities", s.handleCapabilities)
	s.mux.HandleFunc("GET /v1/capability-gaps", s.handleCapabilityGaps)

	// §6.1 — Workspaces
	s.mux.HandleFunc("GET /v1/workspaces", s.handleListWorkspaces)
	s.mux.HandleFunc("POST /v1/workspaces", s.handleCreateWorkspace)
	s.mux.HandleFunc("GET /v1/workspaces/{id}", s.handleGetWorkspace)
	s.mux.HandleFunc("PATCH /v1/workspaces/{id}", s.handlePatchWorkspace)
	s.mux.HandleFunc("DELETE /v1/workspaces/{id}", s.handleDeleteWorkspace)

	// §6.2 — Sessions (must be registered before /v1/sessions/import to avoid
	// "import" being interpreted as a session ID; Go 1.22+ ServeMux is
	// pattern-matched, so explicit /v1/sessions/import wins over /{id}).
	s.mux.HandleFunc("GET /v1/sessions", s.handleListSessions)
	s.mux.HandleFunc("POST /v1/sessions", s.handleCreateSession)
	s.mux.HandleFunc("POST /v1/sessions/import", s.handleImportSession)
	s.mux.HandleFunc("GET /v1/sessions/{id}", s.handleGetSession)
	s.mux.HandleFunc("PATCH /v1/sessions/{id}", s.handlePatchSession)
	s.mux.HandleFunc("DELETE /v1/sessions/{id}", s.handleDeleteSession)
	s.mux.HandleFunc("POST /v1/sessions/{id}/fork", s.handleForkSession)
	s.mux.HandleFunc("POST /v1/sessions/{id}/cancel", s.handleCancelSession)
	s.mux.HandleFunc("POST /v1/sessions/{id}/summarize", s.handleSummarizeSession)
	s.mux.HandleFunc("GET /v1/sessions/{id}/export", s.handleExportSession)

	// §6.3 — Messages
	s.mux.HandleFunc("GET /v1/sessions/{id}/messages", s.handleListMessages)
	s.mux.HandleFunc("POST /v1/sessions/{id}/messages", s.handlePostMessage)
	s.mux.HandleFunc("GET /v1/sessions/{id}/messages/search", s.handleSearchMessages)
	s.mux.HandleFunc("GET /v1/sessions/{id}/messages/{msg_id}", s.handleGetMessage)
	s.mux.HandleFunc("DELETE /v1/sessions/{id}/messages/{msg_id}", s.handleDeleteMessage)
	s.mux.HandleFunc("PATCH /v1/sessions/{id}/messages/{msg_id}/parts/{part_id}", s.handlePatchPart)
	s.mux.HandleFunc("GET /v1/sessions/{id}/questions", s.handleListQuestions)
	s.mux.HandleFunc("POST /v1/sessions/{id}/questions", s.handleCreateQuestion)
	s.mux.HandleFunc("POST /v1/sessions/{id}/questions/{question_id}/answer", s.handleAnswerQuestion)
	s.mux.HandleFunc("POST /v1/sessions/{id}/questions/{question_id}/cancel", s.handleCancelQuestion)
	s.mux.HandleFunc("POST /v1/sessions/{id}/questions/{question_id}/expire", s.handleExpireQuestion)
	s.mux.HandleFunc("GET /v1/sessions/{id}/attempts", s.handleListAttempts)
	s.mux.HandleFunc("POST /v1/sessions/{id}/messages/{msg_id}/retry", s.handleRetryMessage)

	// §6.11 — Permissions
	s.mux.HandleFunc("GET /v1/permissions", s.handleListPermissions)
	s.mux.HandleFunc("GET /v1/permissions/{id}", s.handleGetPermission)
	s.mux.HandleFunc("POST /v1/permissions/{id}", s.handleRespondPermission)

	// §6.5 — Agents
	s.mux.HandleFunc("GET /v1/agents", s.handleListAgents)
	s.mux.HandleFunc("GET /v1/agents/{id}", s.handleGetAgent)
	s.mux.HandleFunc("POST /v1/agents", s.handleCreateAgent)
	s.mux.HandleFunc("PUT /v1/agents/{id}", s.handleUpdateAgent)
	s.mux.HandleFunc("DELETE /v1/agents/{id}", s.handleDeleteAgent)
	s.mux.HandleFunc("POST /v1/agents/extract", s.handleExtractAgent)

	// §6.6 — Tools
	s.mux.HandleFunc("GET /v1/tools", s.handleListTools)
	s.mux.HandleFunc("GET /v1/tools/{id}", s.handleGetTool)

	// §6.7 — MCP
	s.mux.HandleFunc("GET /v1/mcp/handshake", s.handleMcpHandshake)
	s.mux.HandleFunc("GET /v1/mcp/servers", s.handleListMcpServers)
	s.mux.HandleFunc("GET /v1/mcp/servers/{id}", s.handleGetMcpServer)
	s.mux.HandleFunc("DELETE /v1/mcp/servers/{id}", s.handleDeleteMcpServer)
	s.mux.HandleFunc("POST /v1/mcp/servers/{id}/reconnect", s.handleMcpReconnect)
	s.mux.HandleFunc("GET /v1/mcp/servers/{id}/tools", s.handleMcpServerTools)
	s.mux.HandleFunc("GET /v1/mcp/servers/{id}/resources", s.handleMcpServerResources)
	s.mux.HandleFunc("GET /v1/mcp/servers/{id}/resource_templates", s.handleMcpServerResourceTemplates)
	s.mux.HandleFunc("POST /v1/mcp/servers/{id}/resources/read", s.handleMcpResourceRead)
	s.mux.HandleFunc("POST /v1/mcp/servers/{id}/resources/subscribe", s.handleMcpResourceSubscribe)
	s.mux.HandleFunc("GET /v1/mcp/servers/{id}/prompts", s.handleMcpServerPrompts)
	s.mux.HandleFunc("POST /v1/mcp/servers/{id}/prompts/get", s.handleMcpPromptGet)

	// §6.9 — Files & context
	s.mux.HandleFunc("GET /v1/sessions/{id}/context/files", s.handleListContextFiles)
	s.mux.HandleFunc("GET /v1/sessions/{id}/context/files/content", s.handleContextFileContent)
	s.mux.HandleFunc("POST /v1/sessions/{id}/attachments", s.handleUploadAttachment)
	s.mux.HandleFunc("POST /v1/sessions/{id}/context/files", s.handleAddContextFile)
	s.mux.HandleFunc("DELETE /v1/sessions/{id}/context/files", s.handleDeleteContextFile)
	s.mux.HandleFunc("PATCH /v1/sessions/{id}/context/files", s.handlePatchContextFile)
	s.mux.HandleFunc("GET /v1/sessions/{id}/context/frames", s.handleListContextFrames)
	s.mux.HandleFunc("GET /v1/sessions/{id}/context/frames/{frame_id}", s.handleGetContextFrame)
	s.mux.HandleFunc("GET /v1/workspaces/{id}/files", s.handleWorkspaceFiles)
	s.mux.HandleFunc("GET /v1/workspaces/{id}/files/read", s.handleWorkspaceFileRead)
	s.mux.HandleFunc("GET /v1/workspaces/{id}/repo_map", s.handleRepoMap)

	// §6.10 — Diffs
	s.mux.HandleFunc("GET /v1/sessions/{id}/diffs", s.handleSessionDiffs)
	s.mux.HandleFunc("GET /v1/sessions/{id}/messages/{msg_id}/diffs", s.handleMessageDiffs)
	s.mux.HandleFunc("POST /v1/sessions/{id}/diffs/apply", s.handleDiffApply)
	s.mux.HandleFunc("POST /v1/sessions/{id}/diffs/reject", s.handleDiffReject)
	s.mux.HandleFunc("POST /v1/sessions/{id}/undo", s.handleSessionUndo)
	s.mux.HandleFunc("POST /v1/sessions/{id}/rewind", s.handleSessionRewind)

	// §6.12 — Providers + Models
	s.mux.HandleFunc("GET /v1/providers", s.handleListProviders)
	s.mux.HandleFunc("GET /v1/providers/lm", s.handleGetLMProvider)
	s.mux.HandleFunc("GET /v1/providers/lm/wait", s.handleWaitLMProvider)
	s.mux.HandleFunc("PUT /v1/providers/lm", s.handlePutLMProvider)
	s.mux.HandleFunc("GET /v1/providers/{id}", s.handleGetProvider)
	s.mux.HandleFunc("GET /v1/providers/{id}/handshake", s.handleProviderHandshake)
	s.mux.HandleFunc("GET /v1/providers/{id}/models", s.handleListProviderModels)
	s.mux.HandleFunc("POST /v1/providers/{id}/auth", s.handleProviderAuth)

	// §6.13 — Commands
	s.mux.HandleFunc("GET /v1/commands", s.handleListCommands)
	s.mux.HandleFunc("POST /v1/sessions/{id}/commands/{cmd_id}", s.handleSessionCommand)

	// CLIO prompt registry extension
	s.mux.HandleFunc("GET /v1/prompts", s.handleListPrompts)
	s.mux.HandleFunc("GET /v1/prompts/{id}", s.handleGetPrompt)
	s.mux.HandleFunc("POST /v1/prompts/{id}/render", s.handleRenderPrompt)
	s.mux.HandleFunc("POST /v1/prompts/{id}/validate", s.handleValidatePrompt)
	s.mux.HandleFunc("POST /v1/prompts/reload", s.handleReloadPrompts)
	s.mux.HandleFunc("PUT /v1/prompts/{id}", s.handleSavePrompt)

	// CLIO expert-pack runtime extension
	s.mux.HandleFunc("GET /v1/expert-packs", s.handleListExpertPacks)
	s.mux.HandleFunc("GET /v1/expert-packs/{id}", s.handleGetExpertPack)
	s.mux.HandleFunc("POST /v1/expert-packs/validate", s.handleValidateExpertPack)
	s.mux.HandleFunc("POST /v1/expert-packs/install", s.handleInstallExpertPack)
	s.mux.HandleFunc("POST /v1/expert-packs/{id}/update", s.handleUpdateExpertPack)
	s.mux.HandleFunc("DELETE /v1/expert-packs/{id}", s.handleDeleteExpertPack)
	s.mux.HandleFunc("GET /v1/sessions/{id}/expert-pack", s.handleGetSessionExpertPack)
	s.mux.HandleFunc("POST /v1/sessions/{id}/expert-pack", s.handleSetSessionExpertPack)

	// CLIO agent-blueprint extension
	s.mux.HandleFunc("GET /v1/agent-blueprints", s.handleListAgentBlueprints)
	s.mux.HandleFunc("GET /v1/agent-blueprints/sources", s.handleListAgentBlueprintSources)
	s.mux.HandleFunc("POST /v1/agent-blueprints/sources", s.handleAddAgentBlueprintSource)
	s.mux.HandleFunc("POST /v1/agent-blueprints/sources/{id}/refresh", s.handleRefreshAgentBlueprintSource)
	s.mux.HandleFunc("DELETE /v1/agent-blueprints/sources/{id}", s.handleDeleteAgentBlueprintSource)
	s.mux.HandleFunc("GET /v1/agent-blueprints/{id}", s.handleGetAgentBlueprint)
	s.mux.HandleFunc("POST /v1/agent-blueprints/validate", s.handleValidateAgentBlueprint)
	s.mux.HandleFunc("POST /v1/agent-blueprints/install", s.handleInstallAgentBlueprint)
	s.mux.HandleFunc("POST /v1/agent-blueprints/{id}/update", s.handleUpdateAgentBlueprint)
	s.mux.HandleFunc("DELETE /v1/agent-blueprints/{id}", s.handleDeleteAgentBlueprint)
	s.mux.HandleFunc("POST /v1/agent-blueprints/{id}/hooks/{hook_id}/enable", s.handleEnableAgentBlueprintHook)
	s.mux.HandleFunc("POST /v1/agent-blueprints/{id}/mcp/{descriptor_id}/enable", s.handleEnableAgentBlueprintMCP)
	s.mux.HandleFunc("GET /v1/sessions/{id}/agent-blueprint", s.handleGetSessionAgentBlueprint)
	s.mux.HandleFunc("POST /v1/sessions/{id}/agent-blueprint", s.handleSetSessionAgentBlueprint)
	s.mux.HandleFunc("GET /v1/sessions/{id}/agent-overlay", s.handleGetSessionAgentOverlay)
	s.mux.HandleFunc("PUT /v1/sessions/{id}/agent-overlay", s.handlePutSessionAgentOverlay)

	// §6.14 — Voice
	s.mux.HandleFunc("POST /v1/sessions/{id}/voice/transcribe", s.handleVoiceTranscribe)

	// §6.16 — Metrics
	s.mux.HandleFunc("GET /v1/metrics", s.handleMetrics)

	// §6.19 — Memory stats (v0.2 — CLIO-BBBBBBBBBB3)
	s.mux.HandleFunc("GET /v1/memory/stats", s.handleMemoryStats)
	s.mux.HandleFunc("GET /v1/memory/search", s.handleMemorySearch)
	s.mux.HandleFunc("POST /v1/sessions/{id}/memory/tools/search-sessions", s.handleMemoryToolSearchSessions)
	s.mux.HandleFunc("POST /v1/sessions/{id}/memory/tools/read-session-summary", s.handleMemoryToolReadSessionSummary)
	s.mux.HandleFunc("POST /v1/sessions/{id}/memory/tools/read-context-frame", s.handleMemoryToolReadContextFrame)

	// §6.17 — Hooks (MMM3)
	s.mux.HandleFunc("GET /v1/hooks", s.handleListHooks)
	s.mux.HandleFunc("POST /v1/hooks", s.handleCreateHook)
	s.mux.HandleFunc("DELETE /v1/hooks/{id}", s.handleDeleteHook)

	// §6.11 — Policies (MMM4 — auto-resolve permissions by rule)
	s.mux.HandleFunc("GET /v1/policies", s.handleListPolicies)
	s.mux.HandleFunc("PUT /v1/policies", s.handlePutPolicies)

	// §6.18 — Session tasks (MMM5)
	s.mux.HandleFunc("GET /v1/sessions/{id}/tasks", s.handleListSessionTasks)
	s.mux.HandleFunc("POST /v1/sessions/{id}/tasks", s.handleCreateSessionTask)
	s.mux.HandleFunc("PATCH /v1/tasks/{id}", s.handlePatchTask)
	s.mux.HandleFunc("DELETE /v1/tasks/{id}", s.handleDeleteTask)

	// §7 — SSE event streams
	s.mux.HandleFunc("GET /v1/events", s.handleWorkspaceEvents)
	s.mux.HandleFunc("GET /v1/sessions/{id}/events", s.handleSessionEvents)
}
