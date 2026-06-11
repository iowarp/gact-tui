// Catalog-browser modal (L5). Used by the /mcp, /tools, /experts, and
// /skills slash commands to open a scoped list of items from the
// corresponding catalog endpoint. /experts shows a browseable
// hierarchy; Settings > Agent remains the narrow session-agent picker.
package ui

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// catalogBrowserKind identifies which slash command spawned the modal —
// also drives the fetch path and item rendering.
type catalogBrowserKind int

const (
	catalogKindMcp catalogBrowserKind = iota
	catalogKindTools
	catalogKindSkills
	// catalogKindMcpDetail shows one MCP server's tools+resources+prompts
	// in a single list. Pushed on Enter from the MCP server list (LLL2).
	catalogKindMcpDetail
	catalogKindAgentDetail
	// catalogKindAgents lists all agents from /v1/agents. Distinct from
	// the Settings > Agent picker which is for selecting; this one is
	// for browsing. LLL3.
	catalogKindAgents
	catalogKindPrompts
	catalogKindPromptDetail
	catalogKindExpertPacks
	catalogKindExpertPackDetail
	catalogKindAgentBlueprints
	catalogKindAgentBlueprintDetail
	catalogKindAgentBlueprintSources
)

// catalogBrowserState holds the runtime for the list modal.
type catalogBrowserState struct {
	kind    catalogBrowserKind
	title   string
	items   []catalogItem
	loading bool
	errText string
	sel     int
	offset  int
	// LLL2: when kind=catalogKindMcpDetail, mcpServerID identifies
	// which server's catalog we're viewing. parent is preserved so
	// Esc/Backspace can pop back to the server list rather than
	// closing the whole modal.
	mcpServerID               string
	agentID                   string
	promptID                  string
	promptProfile             string
	expertPackID              string
	pendingDeleteExpertPackID string
	blueprintID               string
	sourceID                  string
	pendingDeleteAgentID      string
	pendingDeleteBlueprintID  string
	pendingDeleteSourceID     string
	parent                    *catalogBrowserState
}

// catalogItem is the common shape we flatten each backend response into
// for uniform rendering. Backends return typed structs; we translate on
// the loaded message to keep viewCatalogBrowser kind-agnostic.
type catalogItem struct {
	id         string
	title      string
	desc       string
	inlineDesc string
	statusTag  string // e.g. "connected" / "disconnected" for MCP
	disabled   bool
}

// catalogBrowserLoadedMsg delivers the fetch result.
type catalogBrowserLoadedMsg struct {
	kind    catalogBrowserKind
	items   []catalogItem
	errText string
	// mcpServerID echoes the server context for catalogKindMcpDetail
	// loads — protects against late-arriving messages overwriting a
	// browser the user has since navigated back from.
	mcpServerID   string
	promptID      string
	promptProfile string
	expertPackID  string
	blueprintID   string
	sourceID      string
}

func (a *App) applyCapabilityGatesToCatalogItems(kind catalogBrowserKind, items []catalogItem) []catalogItem {
	out := append([]catalogItem(nil), items...)
	for i := range out {
		switch {
		case kind == catalogKindAgentDetail && strings.HasPrefix(out[i].id, "agent-action/"):
			out[i].disabled = !a.caps.Capabilities.AgentWrite
			if out[i].disabled {
				out[i].desc = "backend does not advertise agent_write"
			}
		}
	}
	return out
}

type promptSavedMsg struct {
	promptID string
	profile  string
	err      error
}

type agentBlueprintActivatedMsg struct {
	blueprintID string
	state       gact.SessionAgentBlueprintState
	err         error
}

type agentBlueprintMCPEnabledMsg struct {
	blueprintID  string
	descriptorID string
	result       map[string]any
	err          error
}

type agentBlueprintHookEnabledMsg struct {
	blueprintID string
	hookID      string
	result      map[string]any
	err         error
}

type agentBlueprintManagedMsg struct {
	blueprintID string
	action      string
	result      map[string]any
	err         error
}

type agentBlueprintSourceManagedMsg struct {
	sourceID string
	action   string
	source   gact.AgentBlueprintSource
	err      error
}

type catalogDetailLoadedMsg struct {
	title      string
	text       string
	err        error
	standalone bool
}

func loadToolDetailCmd(c *client.Client, scope client.RuntimeScope, toolID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		tool, err := c.GetTool(ctx, toolID)
		if err != nil {
			return catalogDetailLoadedMsg{title: "Tool · " + toolID, err: err}
		}
		agents, _ := c.ListAgentsScoped(ctx, scope)
		return catalogDetailLoadedMsg{
			title: "Tool · " + firstNonEmpty(tool.Title, tool.Name, tool.ID),
			text:  formatToolDetailWithAgents(tool, agents),
		}
	}
}

func loadMcpResourceDetailCmd(c *client.Client, serverID, uri, title string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		contents, err := c.McpResourceRead(ctx, serverID, uri)
		if err != nil {
			return catalogDetailLoadedMsg{title: firstNonEmpty(title, uri), err: err}
		}
		return catalogDetailLoadedMsg{
			title: firstNonEmpty(title, uri),
			text:  formatMcpResourceContents(contents),
		}
	}
}

func plural(n int) string {
	if n == 1 {
		return ""
	}
	return "s"
}

// loadCatalogBrowserCmd dispatches the right fetch based on kind.
func loadCatalogBrowserCmd(c *client.Client, kind catalogBrowserKind, scope client.RuntimeScope) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		switch kind {
		case catalogKindMcp:
			servers, err := c.ListMcpServers(ctx)
			if err != nil {
				return catalogBrowserLoadedMsg{kind: kind, errText: err.Error()}
			}
			handshake, _ := c.McpHandshake(ctx, scope)
			servers = annotateMcpServersWithHandshake(servers, handshake)
			items := make([]catalogItem, 0, len(servers))
			for _, s := range servers {
				items = append(items, catalogItem{
					id:         s.ID,
					title:      firstNonEmpty(s.Name, s.ID),
					desc:       mcpServerCatalogDescription(s),
					inlineDesc: mcpSourceInlineSummary(s, 0),
					statusTag:  mcpConnectionStatusTag(s),
				})
			}
			return catalogBrowserLoadedMsg{kind: kind, items: items}
		case catalogKindTools:
			tools, err := c.ListTools(ctx)
			if err != nil {
				return catalogBrowserLoadedMsg{kind: kind, errText: err.Error()}
			}
			servers, _ := c.ListMcpServers(ctx)
			handshake, _ := c.McpHandshake(ctx, scope)
			servers = annotateMcpServersWithHandshake(servers, handshake)
			items := toolCatalogItems(tools, servers)
			if len(items) == 0 {
				items = append(items, catalogItem{
					id:         "none",
					title:      "No callable actions available",
					desc:       "Add an MCP connection, enable a workflow blueprint, or check integration health if actions were expected.",
					inlineDesc: "add connection or blueprint",
					statusTag:  "empty",
				})
			}
			return catalogBrowserLoadedMsg{kind: kind, items: items}
		case catalogKindAgents, catalogKindSkills:
			// Skills are represented by skill-backed agents in the backend,
			// but the catalog copy below keeps that implementation detail out
			// of the operator-facing empty state.
			agents, err := c.ListAgentsScoped(ctx, scope)
			if err != nil {
				return catalogBrowserLoadedMsg{kind: kind, errText: err.Error()}
			}
			items := agentCatalogItems(agents, kind)
			if len(items) == 0 && kind == catalogKindAgents {
				items = append(items, catalogItem{
					id:        "none",
					title:     "(no agents on this server)",
					desc:      "press c to create one when agent_write is available",
					statusTag: "empty",
					disabled:  true,
				})
			}
			if len(items) == 0 && kind == catalogKindSkills {
				items = append(items, catalogItem{
					id:        "none",
					title:     "No skills available",
					desc:      "Install or activate an agent blueprint that includes skills, then reopen this view.",
					statusTag: "empty",
				})
			}
			return catalogBrowserLoadedMsg{kind: kind, items: items}
		case catalogKindPrompts:
			prompts, err := c.ListPromptsScoped(ctx, scope)
			if err != nil {
				return catalogBrowserLoadedMsg{kind: kind, errText: err.Error()}
			}
			items := promptCatalogItems(prompts, scope)
			return catalogBrowserLoadedMsg{kind: kind, items: items}
		case catalogKindExpertPacks:
			packs, err := c.ListExpertPacks(ctx, scope)
			if err != nil {
				return catalogBrowserLoadedMsg{kind: kind, errText: err.Error()}
			}
			return catalogBrowserLoadedMsg{kind: kind, items: expertPackCatalogItems(packs)}
		case catalogKindAgentBlueprints:
			blueprints, err := c.ListAgentBlueprints(ctx, scope)
			if err != nil {
				return catalogBrowserLoadedMsg{kind: kind, errText: err.Error()}
			}
			return catalogBrowserLoadedMsg{kind: kind, items: agentBlueprintCatalogItems(blueprints)}
		case catalogKindAgentBlueprintSources:
			sources, err := c.ListAgentBlueprintSources(ctx)
			if err != nil {
				return catalogBrowserLoadedMsg{kind: kind, errText: err.Error()}
			}
			return catalogBrowserLoadedMsg{kind: kind, items: agentBlueprintSourceRegistryItems(sources)}
		}
		return catalogBrowserLoadedMsg{kind: kind, errText: "unknown catalog kind"}
	}
}

func (a *App) openExpertPackDetail(packID, packTitle string) tea.Cmd {
	parent := a.catalogBrowser
	title := firstNonEmpty(packTitle, packID)
	a.catalogBrowser = &catalogBrowserState{
		kind:         catalogKindExpertPackDetail,
		title:        "Expert Pack · " + title,
		loading:      true,
		expertPackID: packID,
		parent:       parent,
	}
	return loadExpertPackDetailCmd(a.c, a.runtimeScope(), packID)
}

func (a *App) openAgentBlueprintDetail(blueprintID, blueprintTitle string) tea.Cmd {
	parent := a.catalogBrowser
	title := firstNonEmpty(blueprintTitle, blueprintID)
	a.catalogBrowser = &catalogBrowserState{
		kind:        catalogKindAgentBlueprintDetail,
		title:       "Agent Blueprint · " + title,
		loading:     true,
		blueprintID: blueprintID,
		parent:      parent,
	}
	return loadAgentBlueprintDetailCmd(a.c, a.runtimeScope(), blueprintID)
}

func (a *App) openAgentBlueprintSourceBrowser() tea.Cmd {
	parent := a.catalogBrowser
	a.catalogBrowser = &catalogBrowserState{
		kind:    catalogKindAgentBlueprintSources,
		title:   "Marketplace sources",
		loading: true,
		parent:  parent,
	}
	return loadCatalogBrowserCmd(a.c, catalogKindAgentBlueprintSources, a.runtimeScope())
}

func (a *App) openPromptDetail(promptID, promptTitle string) tea.Cmd {
	parent := a.catalogBrowser
	title := stripPromptRowPrefix(firstNonEmpty(promptTitle, promptID))
	a.catalogBrowser = &catalogBrowserState{
		kind:     catalogKindPromptDetail,
		title:    "Prompt · " + title,
		loading:  true,
		promptID: promptID,
		parent:   parent,
	}
	return loadPromptDetailCmd(a.c, promptID, a.runtimeScope())
}

// openCatalogBrowser pops the modal for a given kind and starts the
// fetch. Skill list is synthetic (see cmd above) so it returns an
// immediate result instead of a round-trip.
func (a *App) openCatalogBrowser(kind catalogBrowserKind) tea.Cmd {
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:    kind,
		title:   catalogBrowserTitle(kind),
		loading: true,
	}
	return loadCatalogBrowserCmd(a.c, kind, a.runtimeScope())
}

// openMcpDetail pushes a new browser state showing one server's
// tools+resources+prompts. Called on Enter from the MCP server list
// (LLL2). Preserves the parent so backspace/esc can pop back.
func (a *App) openMcpDetail(serverID, serverName string) tea.Cmd {
	parent := a.catalogBrowser
	serverName = mcpDetailDisplayName(serverID, serverName)
	a.catalogBrowser = &catalogBrowserState{
		kind:        catalogKindMcpDetail,
		title:       "MCP · " + serverName,
		loading:     true,
		mcpServerID: serverID,
		parent:      parent,
	}
	return loadMcpDetailCmd(a.c, a.runtimeScope(), serverID)
}

func mcpDetailDisplayName(serverID, serverName string) string {
	name := strings.TrimSpace(serverName)
	for _, prefix := range []string{"Source · MCP · ", "MCP tools · ", "MCP connection · ", "MCP source · ", "MCP server · ", "MCP · "} {
		name = strings.TrimPrefix(name, prefix)
	}
	return firstNonEmpty(name, serverID)
}

func (a *App) openAgentDetail(agentID, agentTitle string) tea.Cmd {
	parent := a.catalogBrowser
	title := agentTitle
	if title == "" {
		title = agentID
	}
	a.catalogBrowser = &catalogBrowserState{
		kind:    catalogKindAgentDetail,
		title:   "Expert · " + stripAgentHierarchyRolePrefix(title),
		loading: true,
		agentID: agentID,
		parent:  parent,
	}
	return loadAgentDetailCmd(a.c, agentID, a.runtimeScope())
}

// loadMcpDetailCmd fetches tools, resources, and prompts for one MCP
// server and merges them into one operator-facing capability list.
// Failures per slice are surfaced inline rather than aborting — partial
// data is still useful.
func loadMcpDetailCmd(c *client.Client, scope client.RuntimeScope, serverID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		var items []catalogItem
		var errs []string
		agents, _ := c.ListAgentsScoped(ctx, scope)
		servers, _ := c.ListMcpServers(ctx)
		handshake, _ := c.McpHandshake(ctx, scope)
		servers = annotateMcpServersWithHandshake(servers, handshake)
		for _, server := range servers {
			if server.ID == serverID {
				items = append(items, catalogItem{
					id:         "server/" + serverID,
					title:      "Connection overview",
					desc:       formatMcpServerSummary(server),
					inlineDesc: mcpServerDetailInlineSummary(server),
					statusTag:  firstNonEmpty(server.Status, "server"),
				})
				break
			}
		}

		if tools, err := c.McpServerTools(ctx, serverID); err != nil {
			errs = append(errs, "tools: "+err.Error())
		} else {
			for _, t := range tools {
				toolID := firstNonEmpty(t.ID, t.Name)
				desc := mcpDetailToolSummary(t)
				if owners := owningAgentsForTool(t, agents); len(owners) > 0 {
					if desc != "" {
						desc += " · "
					}
					desc += "agents: " + strings.Join(owners, ", ")
				}
				items = append(items, catalogItem{
					id:        "tool/" + toolID,
					title:     "Tool · " + firstNonEmpty(t.Name, toolID),
					desc:      desc,
					statusTag: "tool",
				})
			}
		}
		if rs, err := c.McpServerResources(ctx, serverID); err != nil {
			errs = append(errs, "resources: "+err.Error())
		} else {
			for _, r := range rs {
				name := r.Name
				if name == "" {
					name = r.URI
				}
				desc := r.Description
				if desc == "" {
					desc = r.URI
				} else if r.URI != "" && r.URI != desc {
					desc += " · uri: " + r.URI
				}
				items = append(items, catalogItem{
					id:        "res/" + r.URI,
					title:     "Resource · " + name,
					desc:      desc,
					statusTag: "resource",
				})
			}
		}
		if ps, err := c.McpServerPrompts(ctx, serverID); err != nil {
			errs = append(errs, "prompts: "+err.Error())
		} else {
			for _, p := range ps {
				desc := p.Description
				if desc == "" {
					desc = "prompt template exposed by this MCP connection"
				}
				items = append(items, catalogItem{
					id:        "prompt/" + p.Name,
					title:     "Prompt · " + p.Name,
					desc:      desc,
					statusTag: "prompt",
				})
			}
		}
		errText := ""
		if len(errs) > 0 {
			errText = strings.Join(errs, "; ")
		}
		return catalogBrowserLoadedMsg{
			kind: catalogKindMcpDetail, items: items,
			errText: errText, mcpServerID: serverID,
		}
	}
}

func loadAgentDetailCmd(c *client.Client, agentID string, scope client.RuntimeScope) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		agent, err := c.GetAgentScoped(ctx, agentID, scope)
		if err != nil {
			return catalogBrowserLoadedMsg{
				kind: catalogKindAgentDetail, errText: err.Error(), mcpServerID: agentID,
			}
		}
		allAgents, _ := c.ListAgentsScoped(ctx, scope)
		allTools, _ := c.ListTools(ctx)
		plannerCommands, _ := c.ListCommandsScoped(ctx, client.CommandFilter{
			RuntimeScope: scope,
			AgentID:      agent.ID,
			Planner:      true,
		})
		visibleTools := toolsForAgent(agent, allTools)
		items := []catalogItem{{
			id:        "agent/" + agent.ID,
			title:     "Expert · " + operatorAgentTitle(agent),
			desc:      agent.Description,
			statusTag: agent.Source,
		}}
		if parent := agentParentID(agent); parent != "" {
			items = append(items, catalogItem{
				id: "agent/" + parent, title: "Reports to · " + agentTitleByID(allAgents, parent),
			})
		}
		for _, child := range childAgentsOf(allAgents, agent.ID) {
			items = append(items, catalogItem{
				id: "agent/" + child.ID, title: "Delegates to · " + operatorAgentTitle(child), desc: child.Description, statusTag: child.Source,
			})
		}
		if agent.Specialization != "" {
			items = append(items, catalogItem{
				id: "specialization", title: "Specialization · " + agent.Specialization,
			})
		}
		items = append(items, catalogItem{
			id: "model", title: "Model · default", desc: agentModelText(agent),
		})
		if text := compactJSONDescription(agent.Module); text != "" {
			items = append(items, catalogItem{
				id: "dspy-module", title: "DSPy module", desc: text, statusTag: "dspy",
			})
		}
		if text := compactJSONDescription(agent.Signature); text != "" {
			items = append(items, catalogItem{
				id: "dspy-signature", title: "DSPy signature", desc: text, statusTag: "dspy",
			})
		}
		if text := compactJSONDescription(agent.StructuredOutputs); text != "" {
			items = append(items, catalogItem{
				id: "structured-outputs", title: "Structured outputs", desc: text, statusTag: "dspy",
			})
		}
		if text := compactJSONDescription(agent.Fanout); text != "" {
			items = append(items, catalogItem{
				id: "fanout", title: "Fanout", desc: text, statusTag: "dspy",
			})
		}
		for _, ref := range agent.CapabilityRefs {
			title := firstNonEmpty(ref.Title, ref.ID)
			items = append(items, catalogItem{
				id:        "capability/" + ref.Kind + "/" + ref.ID,
				title:     "Capability · " + title,
				desc:      agentCapabilityRefDescription(ref),
				statusTag: firstNonEmpty(ref.Status, ref.Kind),
			})
		}
		if routes := stringListFromMetadata(agent.Metadata, "routes_to"); len(routes) > 0 {
			items = append(items, catalogItem{
				id: "routes", title: "Routes to", desc: strings.Join(routes, ", "),
			})
		}
		if delegates := stringListFromMetadata(agent.Metadata, "delegates_to"); len(delegates) > 0 {
			items = append(items, catalogItem{
				id: "delegates", title: "Delegates to", desc: strings.Join(delegates, ", "),
			})
		}
		if len(agent.Skills) > 0 {
			items = append(items, catalogItem{
				id:        "skills",
				title:     "Declared skills",
				desc:      strings.Join(agent.Skills, ", "),
				statusTag: "skills",
			})
		}
		if len(agent.ValidationWarnings) > 0 {
			items = append(items, catalogItem{
				id:        "validation-warnings",
				title:     "Validation warnings",
				desc:      strings.Join(agent.ValidationWarnings, "; "),
				statusTag: "warning",
			})
		}
		if len(agent.Keywords) > 0 {
			items = append(items, catalogItem{
				id: "keywords", title: "Routing keywords", desc: strings.Join(agent.Keywords, ", "),
			})
		}
		if len(agent.ValidationErrors) > 0 {
			items = append(items, catalogItem{
				id:        "validation",
				title:     "Validation errors",
				desc:      strings.Join(agent.ValidationErrors, "; "),
				statusTag: "error",
			})
		}
		if desc := agentPromptResolutionDescription(agent); desc != "" {
			items = append(items, catalogItem{
				id: "prompt-resolution", title: "Prompt provenance", desc: desc,
			})
		}
		if len(plannerCommands) > 0 {
			for _, command := range plannerCommands {
				items = append(items, catalogItem{
					id:        "command/" + command.ID,
					title:     "Planner command · " + firstNonEmpty(command.Title, command.ID),
					desc:      paletteCommandSubtitle(command),
					statusTag: firstNonEmpty(command.CommandSource, command.Source, "command"),
				})
			}
		}
		if len(visibleTools) == 0 {
			items = append(items, catalogItem{id: "tools/none", title: "Can use · none declared"})
		} else {
			for _, tool := range visibleTools {
				toolID := firstNonEmpty(tool.ID, tool.Name)
				items = append(items, catalogItem{
					id:        "tool/" + toolID,
					title:     "Can use · " + firstNonEmpty(tool.Name, toolID),
					desc:      toolSummary(tool),
					statusTag: tool.Owner,
				})
			}
			for _, server := range mcpServersForTools(visibleTools) {
				items = append(items, catalogItem{
					id:    "mcpserver/" + server,
					title: "MCP connection · " + server,
					desc:  "connection that provides visible tools",
				})
			}
		}
		if agent.SystemPrompt != "" {
			items = append(items, catalogItem{id: "prompt", title: "Prompt", desc: agent.SystemPrompt})
		}
		return catalogBrowserLoadedMsg{
			kind: catalogKindAgentDetail, items: items, mcpServerID: agentID,
		}
	}
}

func loadExpertPackDetailCmd(c *client.Client, scope client.RuntimeScope, packID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		detail, err := c.GetExpertPack(ctx, packID, scope)
		if err != nil {
			return catalogBrowserLoadedMsg{kind: catalogKindExpertPackDetail, errText: err.Error(), expertPackID: packID}
		}
		items := expertPackDetailItems(detail)
		return catalogBrowserLoadedMsg{kind: catalogKindExpertPackDetail, items: items, expertPackID: packID}
	}
}

type expertPackActivatedMsg struct {
	packID string
	state  gact.SessionExpertPackState
	err    error
}

type expertPackManagedMsg struct {
	packID string
	action string
	result map[string]any
	err    error
}

func activateExpertPackCmd(c *client.Client, sessionID, packID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		state, err := c.SetSessionExpertPack(ctx, sessionID, gact.SetSessionExpertPackRequest{PackID: packID})
		return expertPackActivatedMsg{packID: packID, state: state, err: err}
	}
}

func updateExpertPackCmd(c *client.Client, packID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		result, err := c.UpdateExpertPack(ctx, packID)
		return expertPackManagedMsg{packID: packID, action: "update", result: result, err: err}
	}
}

func deleteExpertPackCmd(c *client.Client, packID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		err := c.DeleteExpertPack(ctx, packID)
		return expertPackManagedMsg{packID: packID, action: "delete", err: err}
	}
}

func loadPromptDetailCmd(c *client.Client, promptID string, scope client.RuntimeScope) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		prompts, err := c.ListPromptsScoped(ctx, scope)
		if err != nil {
			return catalogBrowserLoadedMsg{kind: catalogKindPromptDetail, errText: err.Error(), promptID: promptID}
		}
		var def gact.PromptDefinition
		for _, row := range prompts {
			if row.ID == promptID {
				def = row
				break
			}
		}
		if def.ID == "" {
			return catalogBrowserLoadedMsg{kind: catalogKindPromptDetail, errText: "prompt not found: " + promptID, promptID: promptID}
		}
		items := []catalogItem{{
			id:         "prompt/" + def.ID,
			title:      "Definition · " + stripPromptRowPrefix(firstNonEmpty(def.Title, def.ID)),
			desc:       promptDefinitionDescription(def),
			inlineDesc: promptDefinitionInlineSummary(def),
			statusTag:  firstNonEmpty(def.Scope, "prompt"),
		}}
		defaultProfile := firstNonEmpty(def.DefaultProfile, "default")
		profiles := sortedPromptProfiles(def.Profiles)
		for _, profile := range profiles {
			p := def.Profiles[profile]
			status := firstNonEmpty(p.Scope, def.Scope)
			if profile == def.DefaultProfile {
				status = firstNonEmpty(status, "builtin") + " default"
			}
			items = append(items, catalogItem{
				id:        "profile/" + profile,
				title:     "└─ " + profile,
				desc:      promptProfileDescription(profile, p, profile == def.DefaultProfile),
				statusTag: status,
			})
		}
		if len(def.ValidationErrors) > 0 {
			items = append(items, catalogItem{
				id: "errors", title: "Validation errors", desc: strings.Join(def.ValidationErrors, "; "), statusTag: "error",
			})
		}
		return catalogBrowserLoadedMsg{kind: catalogKindPromptDetail, items: items, promptID: promptID, promptProfile: defaultProfile}
	}
}

func loadAgentBlueprintDetailCmd(c *client.Client, scope client.RuntimeScope, blueprintID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		detail, err := c.GetAgentBlueprint(ctx, blueprintID, scope)
		if err != nil {
			return catalogBrowserLoadedMsg{kind: catalogKindAgentBlueprintDetail, errText: err.Error(), blueprintID: blueprintID}
		}
		return catalogBrowserLoadedMsg{
			kind:        catalogKindAgentBlueprintDetail,
			items:       agentBlueprintDetailItems(detail),
			blueprintID: blueprintID,
		}
	}
}

func activateAgentBlueprintCmd(c *client.Client, sessionID, blueprintID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		state, err := c.SetSessionAgentBlueprint(ctx, sessionID, gact.SetSessionAgentBlueprintRequest{BlueprintID: blueprintID})
		return agentBlueprintActivatedMsg{blueprintID: blueprintID, state: state, err: err}
	}
}

func enableAgentBlueprintMCPCmd(c *client.Client, scope client.RuntimeScope, blueprintID, descriptorID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		result, err := c.EnableAgentBlueprintMCP(ctx, blueprintID, descriptorID, gact.AgentBlueprintMCPEnableRequest{WorkspaceID: scope.WorkspaceID})
		return agentBlueprintMCPEnabledMsg{blueprintID: blueprintID, descriptorID: descriptorID, result: result, err: err}
	}
}

func enableAgentBlueprintHookCmd(c *client.Client, scope client.RuntimeScope, blueprintID, hookID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		result, err := c.EnableAgentBlueprintHook(ctx, blueprintID, hookID, gact.AgentBlueprintHookEnableRequest{
			WorkspaceID: scope.WorkspaceID,
			Trust:       true,
		})
		return agentBlueprintHookEnabledMsg{blueprintID: blueprintID, hookID: hookID, result: result, err: err}
	}
}

func updateAgentBlueprintCmd(c *client.Client, scope client.RuntimeScope, blueprintID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		result, err := c.UpdateAgentBlueprint(ctx, blueprintID, gact.AgentBlueprintUpdateRequest{WorkspaceID: scope.WorkspaceID, Scope: "workspace"})
		return agentBlueprintManagedMsg{blueprintID: blueprintID, action: "updated", result: result, err: err}
	}
}

func deleteAgentBlueprintCmd(c *client.Client, scope client.RuntimeScope, blueprintID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		result, err := c.DeleteAgentBlueprint(ctx, blueprintID, "workspace", scope.WorkspaceID)
		return agentBlueprintManagedMsg{blueprintID: blueprintID, action: "deleted", result: result, err: err}
	}
}

func refreshAgentBlueprintSourceCmd(c *client.Client, sourceID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		source, err := c.RefreshAgentBlueprintSource(ctx, sourceID)
		return agentBlueprintSourceManagedMsg{sourceID: sourceID, action: "refreshed", source: source, err: err}
	}
}

func deleteAgentBlueprintSourceCmd(c *client.Client, sourceID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		err := c.DeleteAgentBlueprintSource(ctx, sourceID)
		return agentBlueprintSourceManagedMsg{sourceID: sourceID, action: "deleted", err: err}
	}
}

func installAgentBlueprintFromSourceCmd(c *client.Client, scope client.RuntimeScope, sourceID, blueprintID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		result, err := c.InstallAgentBlueprint(ctx, gact.AgentBlueprintInstallRequest{
			SourceID:    sourceID,
			BlueprintID: blueprintID,
			Scope:       "workspace",
			WorkspaceID: scope.WorkspaceID,
		})
		return agentBlueprintManagedMsg{blueprintID: blueprintID, action: "installed", result: result, err: err}
	}
}

func loadPromptResolvedDetailCmd(c *client.Client, scope client.RuntimeScope, promptID, profile string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		prompt, err := c.GetPromptScoped(ctx, promptID, profile, scope)
		if err != nil {
			return catalogDetailLoadedMsg{title: "Prompt · " + promptID, err: err}
		}
		return catalogDetailLoadedMsg{
			title: "Prompt · " + prompt.ID + " · " + prompt.Profile,
			text:  formatResolvedPrompt(prompt),
		}
	}
}

func loadPromptRenderedDetailCmd(c *client.Client, scope client.RuntimeScope, promptID, profile string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		prompt, err := c.RenderPromptScoped(ctx, promptID, profile, scope)
		if err != nil {
			return catalogDetailLoadedMsg{title: "Rendered prompt · " + promptID, err: err}
		}
		return catalogDetailLoadedMsg{
			title: "Rendered prompt · " + prompt.ID + " · " + prompt.Profile,
			text:  formatRenderedPrompt(prompt),
		}
	}
}

func loadPromptValidationDetailCmd(c *client.Client, scope client.RuntimeScope, promptID, profile string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		result, err := c.ValidatePromptScoped(ctx, promptID, profile, "", scope)
		if err != nil {
			return catalogDetailLoadedMsg{title: "Prompt validation · " + promptID, err: err}
		}
		return catalogDetailLoadedMsg{
			title: "Prompt validation · " + promptID,
			text:  formatPromptValidation(result),
		}
	}
}

func loadPromptReloadDetailCmd(c *client.Client, scope client.RuntimeScope) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		result, err := c.ReloadPrompts(ctx, scope)
		if err != nil {
			return catalogDetailLoadedMsg{title: "Prompt reload", err: err}
		}
		return catalogDetailLoadedMsg{
			title: "Prompt reload",
			text:  formatPromptReload(result),
		}
	}
}

func savePromptProfileCmd(c *client.Client, scope client.RuntimeScope, promptID, sourceProfile, targetProfile string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		prompt, err := c.GetPromptScoped(ctx, promptID, sourceProfile, scope)
		if err != nil {
			return promptSavedMsg{promptID: promptID, profile: targetProfile, err: err}
		}
		_, err = c.SavePromptScoped(ctx, promptID, gact.PromptSaveRequest{
			Profile:     targetProfile,
			Title:       prompt.Title,
			Description: prompt.Description,
			Text:        prompt.Text,
			Provider:    prompt.Provider,
			Model:       prompt.Model,
			Metadata: map[string]any{
				"copied_from_profile": sourceProfile,
				"saved_by":            "gact-tui",
			},
		}, scope)
		return promptSavedMsg{promptID: promptID, profile: targetProfile, err: err}
	}
}

func catalogBrowserTitle(kind catalogBrowserKind) string {
	switch kind {
	case catalogKindMcp:
		return "MCP Connections"
	case catalogKindTools:
		return "Actions and MCP"
	case catalogKindSkills:
		return "Skills"
	case catalogKindMcpDetail:
		return "MCP detail"
	case catalogKindAgentDetail:
		return "Agent detail"
	case catalogKindAgents:
		return "Experts"
	case catalogKindPrompts:
		return "Prompts"
	case catalogKindPromptDetail:
		return "Prompt detail"
	case catalogKindExpertPacks:
		return "Expert Packs"
	case catalogKindExpertPackDetail:
		return "Expert Pack detail"
	case catalogKindAgentBlueprints:
		return "Agent Blueprints"
	case catalogKindAgentBlueprintDetail:
		return "Agent Blueprint detail"
	case catalogKindAgentBlueprintSources:
		return "Marketplace sources"
	}
	return "Catalog"
}

// closeCatalogBrowser drops modal state.
func (a *App) closeCatalogBrowser() {
	a.catalogBrowserOpen = false
	a.catalogBrowser = nil
}

func (a *App) handleCatalogBrowserWheel(button tea.MouseButton) tea.Cmd {
	if a.catalogBrowser == nil {
		return nil
	}
	cb := a.catalogBrowser
	delta := mouseWheelDelta(button)
	if delta == 0 {
		cb.sel = moveSelectionByWheel(cb.sel, len(cb.items), button)
		cb.offset = catalogBrowserClampOffsetForKind(cb.kind, cb.sel, cb.offset, len(cb.items))
		a.cancelCatalogPendingDeletesOutsideSelection()
		return nil
	}
	catalogBrowserMoveSelection(cb, delta)
	a.cancelCatalogPendingDeletesOutsideSelection()
	return nil
}

// handleCatalogBrowserKey handles keypresses while the modal is open.
// Up/down navigates, Esc closes (or pops detail views back to parent),
// Enter opens the selected row's detail/drill-down view, and Space toggles a
// tool's enabled state (LLL2).
func (a *App) handleCatalogBrowserKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	if a.catalogBrowser == nil {
		a.closeCatalogBrowser()
		return a, nil
	}
	cb := a.catalogBrowser
	key := k.String()
	if cb.pendingDeleteAgentID != "" && !catalogBrowserKeyConfirmsAgentDelete(cb, key) {
		cb.pendingDeleteAgentID = ""
		a.transientHint = ""
	}
	if cb.pendingDeleteBlueprintID != "" && !catalogBrowserKeyConfirmsBlueprintDelete(cb, key) {
		cb.pendingDeleteBlueprintID = ""
		a.transientHint = ""
	}
	if cb.pendingDeleteExpertPackID != "" && !catalogBrowserKeyConfirmsExpertPackDelete(cb, key) {
		cb.pendingDeleteExpertPackID = ""
		a.transientHint = ""
	}
	if cb.pendingDeleteSourceID != "" && !catalogBrowserKeyConfirmsSourceDelete(cb, key) {
		cb.pendingDeleteSourceID = ""
		a.transientHint = ""
	}
	switch key {
	case "esc", "escape", "ctrl+c":
		// LLL2: in MCP detail, esc pops back to parent server list
		// rather than closing the whole modal — gives back-out
		// affordance without juggling separate keys.
		if catalogBrowserCanPop(cb.kind) && cb.parent != nil {
			a.catalogBrowser = cb.parent
			return a, nil
		}
		a.closeCatalogBrowser()
	case "/":
		a.closeCatalogBrowser()
		a.focus = FocusInput
		a.input.Focus()
		a.input.SetValue("/")
		a.input.CursorEnd()
	case "backspace":
		if catalogBrowserCanPop(cb.kind) && cb.parent != nil {
			a.catalogBrowser = cb.parent
		}
	case "enter":
		// Drill into an MCP server when selected.
		if cb.kind == catalogKindMcp && cb.sel >= 0 && cb.sel < len(cb.items) {
			it := cb.items[cb.sel]
			return a, a.openMcpDetail(it.id, it.title)
		}
		if (cb.kind == catalogKindAgents || cb.kind == catalogKindSkills) && cb.sel >= 0 && cb.sel < len(cb.items) {
			it := cb.items[cb.sel]
			if it.disabled {
				a.transientHint = "action disabled: " + strings.TrimSpace(it.desc)
				return a, scheduleHintExpire(a.transientHint)
			}
			if it.id == "none" {
				return a, nil
			}
			return a, a.openAgentDetail(it.id, it.title)
		}
		if cb.kind == catalogKindPrompts && cb.sel >= 0 && cb.sel < len(cb.items) {
			it := cb.items[cb.sel]
			if it.id == "none" {
				return a, nil
			}
			if strings.HasPrefix(it.id, "provider/") {
				a.openCatalogDetail(it.title, it.desc)
				return a, nil
			}
			return a, a.openPromptDetail(it.id, it.title)
		}
		if cb.kind == catalogKindExpertPacks && cb.sel >= 0 && cb.sel < len(cb.items) {
			it := cb.items[cb.sel]
			if it.id == "none" {
				return a, nil
			}
			return a, a.openExpertPackDetail(it.id, it.title)
		}
		if cb.kind == catalogKindAgentBlueprints && cb.sel >= 0 && cb.sel < len(cb.items) {
			it := cb.items[cb.sel]
			switch it.id {
			case "action/install-blueprint":
				a.openAgentBlueprintManage(agentBlueprintManageInstall)
				return a, nil
			case "action/validate-blueprint":
				a.openAgentBlueprintManage(agentBlueprintManageValidate)
				return a, nil
			case "action/source-registry":
				return a, a.openAgentBlueprintSourceBrowser()
			}
			if strings.HasPrefix(it.id, "source/") || strings.HasPrefix(it.id, "provider/") {
				a.openCatalogDetail(it.title, it.desc)
				return a, nil
			}
			return a, a.openAgentBlueprintDetail(it.id, it.title)
		}
		if cb.kind == catalogKindAgentBlueprintSources && cb.sel >= 0 && cb.sel < len(cb.items) {
			it := cb.items[cb.sel]
			switch {
			case strings.HasPrefix(it.id, "source/"):
				a.openCatalogDetail(it.title, it.desc)
				return a, nil
			case strings.HasPrefix(it.id, "source-blueprint/"):
				sourceID, blueprintID, ok := parseSourceBlueprintItemID(it.id)
				if ok {
					return a, installAgentBlueprintFromSourceCmd(a.c, a.runtimeScope(), sourceID, blueprintID)
				}
			}
			return a, nil
		}
		if cb.kind == catalogKindTools && cb.sel >= 0 && cb.sel < len(cb.items) {
			it := cb.items[cb.sel]
			if strings.HasPrefix(it.id, "mcpserver/") {
				return a, a.openMcpDetail(strings.TrimPrefix(it.id, "mcpserver/"), it.title)
			}
			if strings.HasPrefix(it.id, "toolsource/") {
				a.openCatalogDetail(it.title, it.desc)
				return a, nil
			}
			if it.id == "none" {
				return a, nil
			}
			return a, loadToolDetailCmd(a.c, a.runtimeScope(), it.id)
		}
		if cb.kind == catalogKindMcpDetail && cb.sel >= 0 && cb.sel < len(cb.items) {
			it := cb.items[cb.sel]
			switch {
			case it.id == "mcp-action/reconnect":
				return a, mcpReconnectCmd(a.c, cb.mcpServerID)
			case strings.HasPrefix(it.id, "tool/"):
				return a, loadToolDetailCmd(a.c, a.runtimeScope(), strings.TrimPrefix(it.id, "tool/"))
			case strings.HasPrefix(it.id, "res/"):
				uri := strings.TrimPrefix(it.id, "res/")
				return a, loadMcpResourceDetailCmd(a.c, cb.mcpServerID, uri, it.title)
			default:
				text := strings.TrimSpace(it.desc)
				if text == "" {
					text = it.title
				}
				a.openCatalogDetail(it.title, text)
				return a, nil
			}
		}
		if cb.kind == catalogKindAgentDetail && cb.sel >= 0 && cb.sel < len(cb.items) {
			it := cb.items[cb.sel]
			if it.disabled {
				a.transientHint = "action disabled for this agent"
				return a, scheduleHintExpire(a.transientHint)
			}
			if strings.HasPrefix(it.id, "agent/") {
				return a, a.openAgentDetail(strings.TrimPrefix(it.id, "agent/"), it.title)
			}
			if it.id == "agent-action/edit" {
				return a, loadAgentForEditCmd(a.c, a.runtimeScope(), a.catalogBrowser.agentID)
			}
			if it.id == "agent-action/clone" {
				seed := a.catalogBrowser.agentID + "-copy"
				a.openAgentWrite(agentWriteModeClone, a.catalogBrowser.agentID, seed)
				return a, nil
			}
			if it.id == "agent-action/delete" {
				return a, a.confirmOrDeleteAgent()
			}
			if strings.HasPrefix(it.id, "tool/") {
				return a, loadToolDetailCmd(a.c, a.runtimeScope(), strings.TrimPrefix(it.id, "tool/"))
			}
			if strings.HasPrefix(it.id, "mcpserver/") {
				serverID := strings.TrimPrefix(it.id, "mcpserver/")
				return a, a.openMcpDetail(serverID, it.title)
			}
			text := strings.TrimSpace(it.desc)
			if text == "" {
				text = it.title
			}
			a.openCatalogDetail(it.title, text)
			return a, nil
		}
		if cb.kind == catalogKindAgentBlueprintDetail && cb.sel >= 0 && cb.sel < len(cb.items) {
			it := cb.items[cb.sel]
			if it.disabled {
				a.transientHint = "action disabled: " + strings.TrimSpace(it.desc)
				return a, scheduleHintExpire(a.transientHint)
			}
			switch {
			case it.id == "activate":
				sid := a.currentSessionID()
				if sid == "" {
					a.transientHint = "No active session for blueprint activation"
					return a, scheduleHintExpire(a.transientHint)
				}
				return a, activateAgentBlueprintCmd(a.c, sid, cb.blueprintID)
			case strings.HasPrefix(it.id, "agent/"):
				return a, a.openAgentDetail(strings.TrimPrefix(it.id, "agent/"), it.title)
			case strings.HasPrefix(it.id, "mcp/"):
				return a, enableAgentBlueprintMCPCmd(a.c, a.runtimeScope(), cb.blueprintID, strings.TrimPrefix(it.id, "mcp/"))
			case strings.HasPrefix(it.id, "hook/"):
				return a, enableAgentBlueprintHookCmd(a.c, a.runtimeScope(), cb.blueprintID, strings.TrimPrefix(it.id, "hook/"))
			case it.id == "blueprint-action/update":
				return a, updateAgentBlueprintCmd(a.c, a.runtimeScope(), cb.blueprintID)
			case it.id == "blueprint-action/delete":
				return a, a.confirmOrDeleteAgentBlueprint()
			default:
				text := strings.TrimSpace(it.desc)
				if text == "" {
					text = it.title
				}
				a.openCatalogDetail(it.title, text)
				return a, nil
			}
		}
		if cb.kind == catalogKindPromptDetail && cb.sel >= 0 && cb.sel < len(cb.items) {
			it := cb.items[cb.sel]
			switch {
			case strings.HasPrefix(it.id, "profile/"):
				profile := strings.TrimPrefix(it.id, "profile/")
				return a, loadPromptResolvedDetailCmd(a.c, a.runtimeScope(), cb.promptID, profile)
			}
			text := strings.TrimSpace(it.desc)
			if text == "" {
				text = it.title
			}
			a.openCatalogDetail(it.title, text)
			return a, nil
		}
		if cb.kind == catalogKindExpertPackDetail && cb.sel >= 0 && cb.sel < len(cb.items) {
			it := cb.items[cb.sel]
			switch {
			case it.id == "activate":
				if it.disabled {
					a.transientHint = "action disabled: " + strings.TrimSpace(it.desc)
					return a, scheduleHintExpire(a.transientHint)
				}
				if sid := a.currentSessionID(); sid != "" && cb.expertPackID != "" {
					return a, activateExpertPackCmd(a.c, sid, cb.expertPackID)
				}
				a.transientHint = "select a session before activating an expert pack"
				return a, scheduleHintExpire(a.transientHint)
			case it.id == "expert-pack-action/update":
				return a, updateExpertPackCmd(a.c, cb.expertPackID)
			case it.id == "expert-pack-action/delete":
				return a, a.confirmOrDeleteExpertPack()
			case strings.HasPrefix(it.id, "agent/"):
				return a, a.openAgentDetail(strings.TrimPrefix(it.id, "agent/"), it.title)
			default:
				text := strings.TrimSpace(it.desc)
				if text == "" {
					text = it.title
				}
				a.openCatalogDetail(it.title, text)
				return a, nil
			}
		}
		// Other kinds: enter still closes (back-compat).
		a.closeCatalogBrowser()
	case " ", "space":
		// LLL2: toggle disabled state on a tool row. Persists to
		// config.json so the choice survives restart. Pure TUI
		// filter for now — backends that respect an allowed_tools
		// list could honour this on session create.
		if cb.kind == catalogKindTools && cb.sel >= 0 && cb.sel < len(cb.items) {
			id := cb.items[cb.sel].id
			if strings.HasPrefix(id, "mcpserver/") || strings.HasPrefix(id, "toolsource/") || id == "none" {
				return a, nil
			}
			a.toggleToolDisabled(id)
		}
	case "v":
		if cb.kind == catalogKindPromptDetail {
			return a, a.validatePromptDefaultProfile()
		}
		if cb.kind == catalogKindAgentBlueprints {
			a.openAgentBlueprintManage(agentBlueprintManageValidate)
			return a, nil
		}
	case "u":
		if cb.kind == catalogKindPromptDetail {
			return a, a.reloadPromptRegistry()
		}
		if cb.kind == catalogKindExpertPackDetail {
			return a, a.runCatalogBrowserItemAction("expert-pack-action/update")
		}
		if cb.kind == catalogKindAgentBlueprintDetail {
			return a, a.runCatalogBrowserItemAction("blueprint-action/update")
		}
	case "c":
		if cb.kind == catalogKindAgents {
			return a, a.openAgentCreateFromCatalog()
		}
		if cb.kind == catalogKindAgentDetail {
			return a, a.runAgentDetailAction("agent-action/clone")
		}
	case "s":
		if cb.kind == catalogKindAgentBlueprints {
			return a, a.openAgentBlueprintSourceBrowser()
		}
		if cb.kind == catalogKindAgentBlueprintSources && cb.sel >= 0 && cb.sel < len(cb.items) {
			it := cb.items[cb.sel]
			if strings.HasPrefix(it.id, "source/") {
				a.openCatalogDetail(it.title, it.desc)
				return a, nil
			}
		}
		if cb.kind == catalogKindPromptDetail && cb.sel >= 0 && cb.sel < len(cb.items) {
			it := cb.items[cb.sel]
			if strings.HasPrefix(it.id, "profile/") {
				profile := strings.TrimPrefix(it.id, "profile/")
				return a, savePromptProfileCmd(a.c, a.runtimeScope(), cb.promptID, profile, "codex")
			}
		}
	case "x":
		if cb.kind == catalogKindAgents {
			return a, a.openAgentExtractFromCatalog()
		}
	case "o":
		if cb.kind == catalogKindAgents && cb.sel >= 0 && cb.sel < len(cb.items) {
			it := cb.items[cb.sel]
			if it.id == "none" || strings.HasPrefix(it.id, "action/") {
				return a, nil
			}
			a.setNextTurnAgent(it.id, it.title)
			a.closeCatalogBrowser()
			return a, scheduleHintExpire(a.transientHint)
		}
		if cb.kind == catalogKindAgentDetail && cb.agentID != "" {
			a.setNextTurnAgent(cb.agentID, stripAgentHierarchyRolePrefix(cb.title))
			a.closeCatalogBrowser()
			return a, scheduleHintExpire(a.transientHint)
		}
	case "e":
		if cb.kind == catalogKindAgentDetail {
			return a, a.runAgentDetailAction("agent-action/edit")
		}
		if cb.kind == catalogKindPromptDetail && cb.sel >= 0 && cb.sel < len(cb.items) {
			it := cb.items[cb.sel]
			if strings.HasPrefix(it.id, "profile/") {
				profile := strings.TrimPrefix(it.id, "profile/")
				return a, loadPromptEditCmd(a.c, a.runtimeScope(), cb.promptID, profile)
			}
		}
	case "up", "k":
		catalogBrowserMoveSelection(cb, -1)
	case "down", "j":
		catalogBrowserMoveSelection(cb, 1)
	case "i":
		// Install a third-party MCP server. Closes the catalog and opens the
		// small inline install overlay. Exposed from the unified tools catalog
		// so operators can manage sources where they inspect callable tools.
		if cb.kind == catalogKindMcp || cb.kind == catalogKindTools {
			a.closeCatalogBrowser()
			a.openMcpInstallModal()
			return a, nil
		}
		if cb.kind == catalogKindAgentBlueprints {
			a.openAgentBlueprintManage(agentBlueprintManageInstall)
			return a, nil
		}
		if cb.kind == catalogKindExpertPacks {
			a.openExpertPackInstall()
			return a, nil
		}
		if cb.kind == catalogKindAgentBlueprintSources && cb.sel >= 0 && cb.sel < len(cb.items) {
			it := cb.items[cb.sel]
			if strings.HasPrefix(it.id, "source-blueprint/") {
				sourceID, blueprintID, ok := parseSourceBlueprintItemID(it.id)
				if ok {
					return a, installAgentBlueprintFromSourceCmd(a.c, a.runtimeScope(), sourceID, blueprintID)
				}
			}
		}
	case "d":
		if cb.kind == catalogKindAgentDetail {
			return a, a.runAgentDetailAction("agent-action/delete")
		}
		if cb.kind == catalogKindExpertPackDetail {
			return a, a.runCatalogBrowserItemAction("expert-pack-action/delete")
		}
		if cb.kind == catalogKindAgentBlueprintDetail {
			return a, a.runCatalogBrowserItemAction("blueprint-action/delete")
		}
		// Delete the highlighted MCP server. Bundled in_process
		// servers are non-removable; the existing remove flow already
		// filters those out and reports the "no third-party MCPs" toast.
		if cb.kind == catalogKindMcp {
			a.closeCatalogBrowser()
			return a, a.openMcpRemoveModal()
		}
		if cb.kind == catalogKindTools && selectedCatalogMcpServerID(cb) != "" {
			a.closeCatalogBrowser()
			return a, a.openMcpRemoveModal()
		}
		if cb.kind == catalogKindAgentBlueprintSources && cb.sel >= 0 && cb.sel < len(cb.items) {
			it := cb.items[cb.sel]
			if strings.HasPrefix(it.id, "source/") {
				return a, a.confirmOrDeleteAgentBlueprintSource(strings.TrimPrefix(it.id, "source/"))
			}
		}
	case "r":
		if cb.kind == catalogKindPromptDetail {
			return a, a.renderPromptDefaultProfile()
		}
		if cb.kind == catalogKindMcpDetail && cb.mcpServerID != "" {
			return a, mcpReconnectCmd(a.c, cb.mcpServerID)
		}
		if cb.kind == catalogKindTools {
			if serverID := selectedCatalogMcpServerID(cb); serverID != "" {
				return a, mcpReconnectCmd(a.c, serverID)
			}
		}
		if cb.kind == catalogKindAgentBlueprintSources && cb.sel >= 0 && cb.sel < len(cb.items) {
			it := cb.items[cb.sel]
			sourceID := ""
			if strings.HasPrefix(it.id, "source/") {
				sourceID = strings.TrimPrefix(it.id, "source/")
			} else if strings.HasPrefix(it.id, "source-blueprint/") {
				var ok bool
				sourceID, _, ok = parseSourceBlueprintItemID(it.id)
				if !ok {
					sourceID = ""
				}
			}
			if sourceID != "" {
				return a, refreshAgentBlueprintSourceCmd(a.c, sourceID)
			}
		}
	case "a":
		if cb.kind == catalogKindAgentBlueprintDetail {
			if catalogItemStatusTag(cb.items, "activate") == "active" {
				a.transientHint = "Blueprint already active for this session"
				return a, scheduleHintExpire(a.transientHint)
			}
			return a, a.runCatalogBrowserItemAction("activate")
		}
	}
	return a, nil
}

func selectedCatalogMcpServerID(cb *catalogBrowserState) string {
	if cb == nil || cb.sel < 0 || cb.sel >= len(cb.items) {
		return ""
	}
	id := strings.TrimSpace(cb.items[cb.sel].id)
	if !strings.HasPrefix(id, "mcpserver/") {
		return ""
	}
	return strings.TrimSpace(strings.TrimPrefix(id, "mcpserver/"))
}

func catalogBrowserCanPop(kind catalogBrowserKind) bool {
	return kind == catalogKindMcpDetail ||
		kind == catalogKindAgentDetail ||
		kind == catalogKindPromptDetail ||
		kind == catalogKindExpertPackDetail ||
		kind == catalogKindAgentBlueprintDetail ||
		kind == catalogKindAgentBlueprintSources
}

// toggleToolDisabled flips a tool id in/out of App.disabledTools and
// persists. Used by the catalog browser's space key.
func (a *App) toggleToolDisabled(id string) {
	if a.disabledTools == nil {
		a.disabledTools = map[string]bool{}
	}
	if a.disabledTools[id] {
		delete(a.disabledTools, id)
	} else {
		a.disabledTools[id] = true
	}
	if a.SaveConfig != nil {
		_ = a.SaveConfig()
	}
}

func (a *App) openCatalogDetail(title, text string) {
	a.detailView = &bulkyPartRef{
		messageID: "catalog",
		partID:    strings.ToLower(strings.ReplaceAll(title, " ", "-")),
		title:     title,
		fullText:  sanitizeCatalogDetailText(text),
	}
	a.detailViewOpen = true
	a.detailScroll = 0
}

func sanitizeCatalogDetailText(text string) string {
	if strings.TrimSpace(text) == "" {
		return text
	}
	lines := strings.Split(text, "\n")
	for i, line := range lines {
		lines[i] = sanitizeCatalogDetailLine(line)
	}
	return strings.Join(lines, "\n")
}

func sanitizeCatalogDetailLine(line string) string {
	trimmed := strings.TrimLeft(line, " \t")
	indent := line[:len(line)-len(trimmed)]
	if strings.HasPrefix(trimmed, "\"") {
		return line
	}
	key, rest, ok := strings.Cut(trimmed, ":")
	if !ok {
		return line
	}
	label := catalogDetailLabel(key)
	if label == key {
		return line
	}
	return indent + label + ":" + rest
}

func catalogDetailLabel(key string) string {
	switch strings.TrimSpace(key) {
	case "agent_blueprint_id":
		return "workflow"
	case "base64_data":
		return "base64 data"
	case "default_model":
		return "default model"
	case "definition_path":
		return "definition file"
	case "display_path":
		return "display path"
	case "input_schema":
		return "inputs"
	case "installed_path":
		return "installed file"
	case "media_type", "mime_type":
		return "media type"
	case "model_id":
		return "model"
	case "output_schema":
		return "outputs"
	case "owner":
		return "workflow area"
	case "permission_default":
		return "approval needed"
	case "provider_id":
		return "provider"
	case "server_id":
		return "connection"
	case "session_id":
		return "session"
	case "source_path":
		return "source file"
	case "visible_to":
		return "available to"
	case "workspace_id":
		return "workspace"
	default:
		return key
	}
}

func (a *App) catalogBrowserHeaderButtons() []menuButton {
	if a.catalogBrowser != nil &&
		catalogBrowserCanPop(a.catalogBrowser.kind) &&
		a.catalogBrowser.parent != nil {
		return []menuButton{{
			id:    "catalog:back",
			label: "back",
			action: func(app *App) tea.Cmd {
				if app.catalogBrowser != nil && app.catalogBrowser.parent != nil {
					app.catalogBrowser = app.catalogBrowser.parent
				}
				return nil
			},
		}}
	}
	return []menuButton{closeMenuButton("catalog:close", func(app *App) { app.closeCatalogBrowser() })}
}

func agentBlueprintCatalogActionButtons() []menuButton {
	return []menuButton{
		{
			id:    "agent-blueprints:install",
			label: "install from path",
			action: func(app *App) tea.Cmd {
				app.openAgentBlueprintManage(agentBlueprintManageInstall)
				return nil
			},
		},
		{
			id:    "agent-blueprints:validate",
			label: "validate path",
			action: func(app *App) tea.Cmd {
				app.openAgentBlueprintManage(agentBlueprintManageValidate)
				return nil
			},
		},
		{
			id:    "agent-blueprints:sources",
			label: "browse sources",
			action: func(app *App) tea.Cmd {
				return app.openAgentBlueprintSourceBrowser()
			},
		},
	}
}

func (a *App) promptDetailActionButtons() []menuButton {
	return []menuButton{
		{
			id:    "prompts:render",
			label: "render default",
			action: func(app *App) tea.Cmd {
				return app.renderPromptDefaultProfile()
			},
		},
		{
			id:    "prompts:validate",
			label: "validate default",
			action: func(app *App) tea.Cmd {
				return app.validatePromptDefaultProfile()
			},
		},
		{
			id:    "prompts:reload",
			label: "reload registry",
			action: func(app *App) tea.Cmd {
				return app.reloadPromptRegistry()
			},
		},
	}
}

func (a *App) agentDetailActionButtons() []menuButton {
	cb := a.catalogBrowser
	if cb == nil || cb.kind != catalogKindAgentDetail || cb.agentID == "" {
		return nil
	}
	disabled := !a.caps.Capabilities.AgentWrite
	deleteLabel := "delete"
	if a.catalogBrowserAgentDeleteArmed() {
		deleteLabel = "confirm delete"
	}
	buttons := []menuButton{{
		id:       "agent-detail:clone",
		label:    "clone",
		disabled: disabled,
		action: func(app *App) tea.Cmd {
			return app.runAgentDetailAction("agent-action/clone")
		},
	}}
	if catalogBrowserAgentIsUserOwned(cb) {
		buttons = append(buttons, menuButton{
			id:       "agent-detail:edit",
			label:    "edit",
			disabled: disabled,
			action: func(app *App) tea.Cmd {
				return app.runAgentDetailAction("agent-action/edit")
			},
		})
		buttons = append(buttons, menuButton{
			id:       "agent-detail:delete",
			label:    deleteLabel,
			disabled: disabled,
			action: func(app *App) tea.Cmd {
				return app.runAgentDetailAction("agent-action/delete")
			},
		})
	}
	return buttons
}

func (a *App) expertPackDetailActionButtons() []menuButton {
	if a.catalogBrowser == nil {
		return nil
	}
	activateLabel := "activate"
	if catalogItemStatusTag(a.catalogBrowser.items, "activate") == "active" {
		activateLabel = "active"
	}
	deleteLabel := "delete"
	if a.catalogBrowserExpertPackDeleteArmed() {
		deleteLabel = "confirm delete"
	}
	return a.catalogActionButtonsFromItems("expert-pack-detail", []catalogActionButtonSpec{
		{id: "activate", label: activateLabel, disabledLabel: "activation blocked"},
		{id: "expert-pack-action/update", label: "update"},
		{id: "expert-pack-action/delete", label: deleteLabel},
	})
}

func (a *App) agentBlueprintDetailActionButtons() []menuButton {
	if a.catalogBrowser == nil {
		return nil
	}
	deleteLabel := "delete"
	if a.catalogBrowserBlueprintDeleteArmed() {
		deleteLabel = "confirm delete"
	}
	specs := []catalogActionButtonSpec{
		{id: "blueprint-action/update", label: "update"},
		{id: "blueprint-action/delete", label: deleteLabel},
	}
	if catalogItemStatusTag(a.catalogBrowser.items, "activate") != "active" {
		specs = append([]catalogActionButtonSpec{{id: "activate", label: "activate", disabledLabel: "activation blocked"}}, specs...)
	}
	return a.catalogActionButtonsFromItems("blueprint-detail", specs)
}

func (a *App) agentBlueprintSourceActionButtons() []menuButton {
	cb := a.catalogBrowser
	if cb == nil || cb.kind != catalogKindAgentBlueprintSources || cb.sel < 0 || cb.sel >= len(cb.items) {
		return nil
	}
	item := cb.items[cb.sel]
	switch {
	case strings.HasPrefix(item.id, "source-blueprint/"):
		sourceID, blueprintID, ok := parseSourceBlueprintItemID(item.id)
		if !ok {
			return nil
		}
		return []menuButton{
			{
				id:    "agent-blueprint-source:install",
				label: "install blueprint",
				action: func(app *App) tea.Cmd {
					return installAgentBlueprintFromSourceCmd(app.c, app.runtimeScope(), sourceID, blueprintID)
				},
			},
			{
				id:    "agent-blueprint-source:refresh",
				label: "refresh source",
				action: func(app *App) tea.Cmd {
					return refreshAgentBlueprintSourceCmd(app.c, sourceID)
				},
			},
		}
	case strings.HasPrefix(item.id, "source/"):
		sourceID := strings.TrimPrefix(item.id, "source/")
		deleteLabel := "remove source"
		if cb.pendingDeleteSourceID == sourceID {
			deleteLabel = "confirm remove"
		}
		return []menuButton{
			{
				id:    "agent-blueprint-source:refresh",
				label: "refresh source",
				action: func(app *App) tea.Cmd {
					return refreshAgentBlueprintSourceCmd(app.c, sourceID)
				},
			},
			{
				id:    "agent-blueprint-source:remove",
				label: deleteLabel,
				action: func(app *App) tea.Cmd {
					return app.confirmOrDeleteAgentBlueprintSource(sourceID)
				},
			},
		}
	default:
		return nil
	}
}

type catalogActionButtonSpec struct {
	id            string
	label         string
	disabledLabel string
}

func (a *App) catalogActionButtonsFromItems(prefix string, specs []catalogActionButtonSpec) []menuButton {
	cb := a.catalogBrowser
	if cb == nil {
		return nil
	}
	buttons := make([]menuButton, 0, len(specs))
	for _, spec := range specs {
		itemIndex := -1
		disabled := false
		for i, item := range cb.items {
			if item.id == spec.id {
				itemIndex = i
				disabled = item.disabled
				break
			}
		}
		if itemIndex < 0 {
			continue
		}
		idx := itemIndex
		label := spec.label
		if disabled && spec.disabledLabel != "" {
			label = spec.disabledLabel
		}
		buttons = append(buttons, menuButton{
			id:       prefix + ":" + spec.label,
			label:    label,
			disabled: disabled,
			action: func(app *App) tea.Cmd {
				if app.catalogBrowser == nil || idx < 0 || idx >= len(app.catalogBrowser.items) {
					return nil
				}
				app.catalogBrowser.sel = idx
				_, cmd := app.handleCatalogBrowserKey(keyMsg("enter"))
				return cmd
			},
		})
	}
	return buttons
}

func (a *App) promptDefaultProfile() string {
	if a.catalogBrowser == nil {
		return "default"
	}
	return firstNonEmpty(a.catalogBrowser.promptProfile, "default")
}

func (a *App) renderPromptDefaultProfile() tea.Cmd {
	if a.catalogBrowser == nil || a.catalogBrowser.promptID == "" {
		return nil
	}
	return loadPromptRenderedDetailCmd(a.c, a.runtimeScope(), a.catalogBrowser.promptID, a.promptDefaultProfile())
}

func (a *App) validatePromptDefaultProfile() tea.Cmd {
	if a.catalogBrowser == nil || a.catalogBrowser.promptID == "" {
		return nil
	}
	return loadPromptValidationDetailCmd(a.c, a.runtimeScope(), a.catalogBrowser.promptID, a.promptDefaultProfile())
}

func (a *App) reloadPromptRegistry() tea.Cmd {
	return loadPromptReloadDetailCmd(a.c, a.runtimeScope())
}

func (a *App) openAgentCreateFromCatalog() tea.Cmd {
	if !a.caps.Capabilities.AgentWrite {
		a.transientHint = "create agent unavailable: backend does not advertise agent_write"
		return scheduleHintExpire(a.transientHint)
	}
	a.openAgentWrite(agentWriteModeCreate, "", "new-agent")
	return nil
}

func (a *App) openAgentExtractFromCatalog() tea.Cmd {
	if !a.caps.Capabilities.SkillsExtraction {
		a.transientHint = "extract agent unavailable: backend does not advertise skills_extraction"
		return scheduleHintExpire(a.transientHint)
	}
	sessionID := a.currentSessionID()
	if sessionID == "" {
		a.transientHint = "select a session before extracting an agent"
		return scheduleHintExpire(a.transientHint)
	}
	seed := "extracted-" + strings.TrimPrefix(sessionID, "sess_")
	a.openAgentWrite(agentWriteModeExtract, "", seed)
	return nil
}

const catalogBrowserRowBudget = 12
const catalogBrowserBodyRows = catalogBrowserRowBudget * 2
const catalogBrowserMinBodyRows = 8

func catalogBrowserClampOffset(sel, offset, itemCount int) int {
	return catalogBrowserClampOffsetForBudget(sel, offset, itemCount, catalogBrowserRowBudget)
}

func catalogBrowserClampOffsetForKind(kind catalogBrowserKind, sel, offset, itemCount int) int {
	return catalogBrowserClampOffsetForBudget(sel, offset, itemCount, catalogBrowserVisibleItemBudget(kind))
}

func catalogBrowserContentIndexes(kind catalogBrowserKind, items []catalogItem) []int {
	indexes := make([]int, 0, len(items))
	for i, item := range items {
		if catalogBrowserItemIsInlineAction(kind, item) {
			continue
		}
		indexes = append(indexes, i)
	}
	return indexes
}

func catalogBrowserItemIsInlineAction(kind catalogBrowserKind, item catalogItem) bool {
	switch kind {
	case catalogKindAgentDetail:
		return strings.HasPrefix(item.id, "agent-action/")
	case catalogKindExpertPackDetail:
		return item.id == "activate" || strings.HasPrefix(item.id, "expert-pack-action/")
	case catalogKindAgentBlueprintDetail:
		return item.id == "activate" || strings.HasPrefix(item.id, "blueprint-action/")
	default:
		return false
	}
}

func catalogBrowserAgentIsUserOwned(cb *catalogBrowserState) bool {
	if cb == nil || cb.kind != catalogKindAgentDetail || cb.agentID == "" {
		return false
	}
	for _, item := range cb.items {
		if item.id == "agent/"+cb.agentID {
			return item.statusTag == "user"
		}
	}
	return false
}

func catalogBrowserSelectionPosition(indexes []int, sel int) int {
	for pos, idx := range indexes {
		if idx == sel {
			return pos
		}
	}
	return 0
}

func catalogBrowserNormalizeSelection(cb *catalogBrowserState) {
	if cb == nil || len(cb.items) == 0 {
		return
	}
	indexes := catalogBrowserContentIndexes(cb.kind, cb.items)
	if len(indexes) == 0 {
		cb.sel = 0
		cb.offset = 0
		return
	}
	for _, idx := range indexes {
		if idx == cb.sel {
			return
		}
	}
	for _, idx := range indexes {
		if idx > cb.sel {
			cb.sel = idx
			return
		}
	}
	cb.sel = indexes[len(indexes)-1]
}

func catalogBrowserMoveSelection(cb *catalogBrowserState, delta int) {
	if cb == nil || len(cb.items) == 0 {
		return
	}
	indexes := catalogBrowserContentIndexes(cb.kind, cb.items)
	if len(indexes) == 0 {
		cb.sel = 0
		cb.offset = 0
		return
	}
	pos := catalogBrowserSelectionPosition(indexes, cb.sel)
	pos = clampInt(pos+delta, 0, len(indexes)-1)
	cb.sel = indexes[pos]
	cb.offset = catalogBrowserClampOffsetForKind(cb.kind, pos, cb.offset, len(indexes))
}

func (a *App) cancelCatalogPendingDeletesOutsideSelection() {
	cb := a.catalogBrowser
	if cb == nil {
		return
	}
	cleared := false
	if cb.pendingDeleteAgentID != "" && !catalogBrowserKeyConfirmsAgentDelete(cb, "enter") {
		cb.pendingDeleteAgentID = ""
		cleared = true
	}
	if cb.pendingDeleteBlueprintID != "" && !catalogBrowserKeyConfirmsBlueprintDelete(cb, "enter") {
		cb.pendingDeleteBlueprintID = ""
		cleared = true
	}
	if cb.pendingDeleteExpertPackID != "" && !catalogBrowserKeyConfirmsExpertPackDelete(cb, "enter") {
		cb.pendingDeleteExpertPackID = ""
		cleared = true
	}
	if cb.pendingDeleteSourceID != "" && !catalogBrowserKeyConfirmsSourceDelete(cb, "d") {
		cb.pendingDeleteSourceID = ""
		cleared = true
	}
	if cleared {
		a.transientHint = ""
	}
}

func agentBlueprintSourceActionSectionTitle(cb *catalogBrowserState) string {
	if cb != nil && cb.kind == catalogKindAgentBlueprintSources && cb.sel >= 0 && cb.sel < len(cb.items) &&
		strings.HasPrefix(cb.items[cb.sel].id, "source-blueprint/") {
		return "Blueprint actions"
	}
	return "Source actions"
}

func catalogBrowserHasItem(cb *catalogBrowserState, itemID string) bool {
	if cb == nil {
		return false
	}
	for _, item := range cb.items {
		if item.id == itemID {
			return true
		}
	}
	return false
}

func (a *App) runCatalogBrowserItemAction(itemID string) tea.Cmd {
	if a.catalogBrowser == nil {
		return nil
	}
	if a.catalogBrowser.kind == catalogKindAgentDetail && strings.HasPrefix(itemID, "agent-action/") {
		return a.runAgentDetailAction(itemID)
	}
	for i, item := range a.catalogBrowser.items {
		if item.id == itemID {
			a.catalogBrowser.sel = i
			_, cmd := a.handleCatalogBrowserKey(keyMsg("enter"))
			return cmd
		}
	}
	return nil
}

func (a *App) runAgentDetailAction(itemID string) tea.Cmd {
	cb := a.catalogBrowser
	if cb == nil || cb.kind != catalogKindAgentDetail || cb.agentID == "" {
		return nil
	}
	if !a.caps.Capabilities.AgentWrite {
		a.transientHint = "expert action unavailable: backend does not advertise agent_write"
		return scheduleHintExpire(a.transientHint)
	}
	switch itemID {
	case "agent-action/clone":
		seed := cb.agentID + "-copy"
		a.openAgentWrite(agentWriteModeClone, cb.agentID, seed)
		return nil
	case "agent-action/edit":
		if !catalogBrowserAgentIsUserOwned(cb) {
			a.transientHint = "edit is available for user-owned experts"
			return scheduleHintExpire(a.transientHint)
		}
		return loadAgentForEditCmd(a.c, a.runtimeScope(), cb.agentID)
	case "agent-action/delete":
		if !catalogBrowserAgentIsUserOwned(cb) {
			a.transientHint = "delete is available for user-owned experts"
			return scheduleHintExpire(a.transientHint)
		}
		return a.confirmOrDeleteAgent()
	default:
		return nil
	}
}

func (a *App) catalogBrowserAgentDeleteArmed() bool {
	cb := a.catalogBrowser
	return cb != nil &&
		cb.kind == catalogKindAgentDetail &&
		cb.agentID != "" &&
		cb.pendingDeleteAgentID == cb.agentID
}

func (a *App) catalogBrowserBlueprintDeleteArmed() bool {
	cb := a.catalogBrowser
	return cb != nil &&
		cb.kind == catalogKindAgentBlueprintDetail &&
		cb.blueprintID != "" &&
		cb.pendingDeleteBlueprintID == cb.blueprintID
}

func (a *App) catalogBrowserExpertPackDeleteArmed() bool {
	cb := a.catalogBrowser
	return cb != nil &&
		cb.kind == catalogKindExpertPackDetail &&
		cb.expertPackID != "" &&
		cb.pendingDeleteExpertPackID == cb.expertPackID
}

func catalogBrowserKeyConfirmsAgentDelete(cb *catalogBrowserState, key string) bool {
	if cb == nil || cb.kind != catalogKindAgentDetail || cb.pendingDeleteAgentID == "" {
		return false
	}
	return key == "d" || key == "enter"
}

func catalogBrowserKeyConfirmsExpertPackDelete(cb *catalogBrowserState, key string) bool {
	if cb == nil || cb.kind != catalogKindExpertPackDetail || cb.pendingDeleteExpertPackID == "" {
		return false
	}
	if key == "d" {
		return true
	}
	return key == "enter" &&
		cb.sel >= 0 &&
		cb.sel < len(cb.items) &&
		cb.items[cb.sel].id == "expert-pack-action/delete"
}

func catalogBrowserKeyConfirmsBlueprintDelete(cb *catalogBrowserState, key string) bool {
	if cb == nil || cb.kind != catalogKindAgentBlueprintDetail || cb.pendingDeleteBlueprintID == "" {
		return false
	}
	if key == "d" {
		return true
	}
	return key == "enter" &&
		cb.sel >= 0 &&
		cb.sel < len(cb.items) &&
		cb.items[cb.sel].id == "blueprint-action/delete"
}

func catalogBrowserKeyConfirmsSourceDelete(cb *catalogBrowserState, key string) bool {
	if cb == nil || cb.kind != catalogKindAgentBlueprintSources || cb.pendingDeleteSourceID == "" {
		return false
	}
	if key != "d" {
		return false
	}
	if cb.sel < 0 || cb.sel >= len(cb.items) {
		return false
	}
	return cb.items[cb.sel].id == "source/"+cb.pendingDeleteSourceID
}

func (a *App) confirmOrDeleteExpertPack() tea.Cmd {
	cb := a.catalogBrowser
	if cb == nil || cb.kind != catalogKindExpertPackDetail || cb.expertPackID == "" {
		return nil
	}
	if cb.pendingDeleteExpertPackID == cb.expertPackID {
		packID := cb.expertPackID
		cb.pendingDeleteExpertPackID = ""
		return deleteExpertPackCmd(a.c, packID)
	}
	cb.pendingDeleteExpertPackID = cb.expertPackID
	label := firstNonEmpty(cb.expertPackID, "this expert pack")
	a.transientHint = "press d or Enter again to confirm deleting " + label + " (any other key cancels)"
	return scheduleHintExpire(a.transientHint)
}

func (a *App) confirmOrDeleteAgent() tea.Cmd {
	cb := a.catalogBrowser
	if cb == nil || cb.kind != catalogKindAgentDetail || cb.agentID == "" {
		return nil
	}
	if cb.pendingDeleteAgentID == cb.agentID {
		agentID := cb.agentID
		cb.pendingDeleteAgentID = ""
		a.closeCatalogBrowser()
		return deleteAgentCmd(a.c, agentID)
	}
	cb.pendingDeleteAgentID = cb.agentID
	label := firstNonEmpty(cb.agentID, "this expert")
	a.transientHint = "press d or Enter again to confirm deleting " + label + " (any other key cancels)"
	return scheduleHintExpire(a.transientHint)
}

func (a *App) confirmOrDeleteAgentBlueprintSource(sourceID string) tea.Cmd {
	cb := a.catalogBrowser
	sourceID = strings.TrimSpace(sourceID)
	if cb == nil || cb.kind != catalogKindAgentBlueprintSources || sourceID == "" || sourceID == "none" {
		return nil
	}
	if cb.pendingDeleteSourceID == sourceID {
		cb.pendingDeleteSourceID = ""
		return deleteAgentBlueprintSourceCmd(a.c, sourceID)
	}
	cb.pendingDeleteSourceID = sourceID
	a.transientHint = "press d again to confirm removing source " + sourceID + " (any other key cancels)"
	return scheduleHintExpire(a.transientHint)
}

func (a *App) confirmOrDeleteAgentBlueprint() tea.Cmd {
	cb := a.catalogBrowser
	if cb == nil || cb.kind != catalogKindAgentBlueprintDetail || cb.blueprintID == "" {
		return nil
	}
	if cb.pendingDeleteBlueprintID == cb.blueprintID {
		blueprintID := cb.blueprintID
		cb.pendingDeleteBlueprintID = ""
		return deleteAgentBlueprintCmd(a.c, a.runtimeScope(), blueprintID)
	}
	cb.pendingDeleteBlueprintID = cb.blueprintID
	label := firstNonEmpty(cb.blueprintID, "this blueprint")
	a.transientHint = "press d or Enter again to confirm deleting " + label + " (any other key cancels)"
	return scheduleHintExpire(a.transientHint)
}

func catalogBrowserVisibleItemBudget(kind catalogBrowserKind) int {
	if kind == catalogKindTools {
		return catalogBrowserBodyRows
	}
	if kind == catalogKindPrompts {
		return catalogBrowserBodyRows
	}
	if kind == catalogKindAgentBlueprintSources {
		return catalogBrowserBodyRows
	}
	return catalogBrowserRowBudget
}

func catalogBrowserClampOffsetForBudget(sel, offset, itemCount, budget int) int {
	if budget < 1 {
		budget = 1
	}
	if itemCount <= budget {
		return 0
	}
	maxOffset := itemCount - budget
	if offset > maxOffset {
		offset = maxOffset
	}
	if offset < 0 {
		offset = 0
	}
	if sel < offset {
		return sel
	}
	if sel >= offset+budget {
		return sel - budget + 1
	}
	return offset
}

func catalogBrowserBodyRowsForContent(renderedRows int, itemCount int, itemBudget int) int {
	if itemBudget < 1 {
		itemBudget = 1
	}
	if itemCount > itemBudget {
		return catalogBrowserBodyRows
	}
	return clampInt(renderedRows, catalogBrowserMinBodyRows, catalogBrowserBodyRows)
}

// SetDisabledTools seeds the disabled-tools set from main on startup
// (LLL2). Called once after Load() before the program runs.
func (a *App) SetDisabledTools(ids []string) {
	a.disabledTools = make(map[string]bool, len(ids))
	for _, id := range ids {
		a.disabledTools[id] = true
	}
}

// GetDisabledTools returns the disabled-tools set as a sorted slice
// for config persistence (LLL2). Stable order keeps config diffs
// readable.
func (a *App) GetDisabledTools() []string {
	out := make([]string, 0, len(a.disabledTools))
	for id := range a.disabledTools {
		out = append(out, id)
	}
	sort.Strings(out)
	return out
}

// viewCatalogBrowser renders the modal: title + rows + hint bar.
// Fixed result-height so the hint bar stays anchored regardless of
// how many items come back.
func (a *App) viewCatalogBrowser() string {
	t := a.Theme
	if a.catalogBrowser == nil {
		return ""
	}
	// Catalog rows carry descriptions, routing metadata, and source tags.
	// Use the inspection-pane width so lists remain readable without
	// consuming the whole application frame.
	w := a.detailModalWidth()

	buttons := a.catalogBrowserHeaderButtons()
	rows := make([]string, 0, catalogBrowserBodyRows)
	if a.catalogBrowser.loading && len(a.catalogBrowser.items) == 0 {
		rows = append(rows, t.HintLabel.Italic(true).Render("loading…"))
	}
	if a.catalogBrowser.errText != "" {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.Danger).
			Render("error: "+a.catalogBrowser.errText))
	}
	if intro := catalogBrowserIntro(a.catalogBrowser.kind); intro != "" {
		rows = append(rows, t.HintLabel.Render(intro), "")
	}
	if context := a.catalogBrowserContextLine(a.catalogBrowser.kind); context != "" {
		rows = append(rows, t.HintLabel.Render(context), "")
	}
	if guide := catalogBrowserWorkflowGuide(a.catalogBrowser.kind); guide != "" {
		rows = append(rows, t.HintLabel.Render(guide), "")
	}
	actionRow := -1
	actionCol := 0
	actionButtons := []menuButton(nil)
	listW := modalInsetListWidth(w)
	renderActionButtons := func(buttons []menuButton) string {
		row, col := a.renderCenteredModalButtons(listW, buttons, -1)
		actionCol = col
		return row
	}
	if a.catalogBrowser.kind == catalogKindAgents {
		rows = append(rows, t.HintLabel.Render("Expert hierarchy"))
	}
	if a.catalogBrowser.kind == catalogKindMcpDetail {
		rows = append(rows, t.HintLabel.Render("Connection capabilities"))
	}
	if a.catalogBrowser.kind == catalogKindAgentDetail {
		actionButtons = a.agentDetailActionButtons()
		if len(actionButtons) > 0 {
			actionRow = len(rows) + 1
			rows = append(rows,
				t.HintLabel.Render("Expert actions"),
				renderActionButtons(actionButtons),
				"",
				t.HintLabel.Render("Expert structure"),
			)
		}
	}
	if a.catalogBrowser.kind == catalogKindAgentBlueprints {
		rows = append(rows, t.HintLabel.Render("Blueprint library"))
	}
	if a.catalogBrowser.kind == catalogKindAgentBlueprintDetail {
		actionButtons = a.agentBlueprintDetailActionButtons()
		if len(actionButtons) > 0 {
			actionRow = len(rows) + 1
			rows = append(rows,
				t.HintLabel.Render("Blueprint actions"),
				renderActionButtons(actionButtons),
			)
		}
		if status := activeAgentBlueprintDetailStatus(a.catalogBrowser.items); status != "" {
			rows = append(rows,
				t.HintLabel.Render("Blueprint status"),
				status,
			)
		}
		rows = append(rows,
			"",
			t.HintLabel.Render("Blueprint structure"),
		)
	}
	if a.catalogBrowser.kind == catalogKindAgentBlueprintSources {
		actionButtons = a.agentBlueprintSourceActionButtons()
		if len(actionButtons) > 0 {
			actionRow = len(rows) + 1
			rows = append(rows,
				t.HintLabel.Render(agentBlueprintSourceActionSectionTitle(a.catalogBrowser)),
				renderActionButtons(actionButtons),
				"",
				t.HintLabel.Render("Marketplace source tree"),
			)
		}
	}
	if a.catalogBrowser.kind == catalogKindPromptDetail {
		actionButtons = a.promptDetailActionButtons()
		actionRow = len(rows) + 1
		rows = append(rows,
			t.HintLabel.Render("Management"),
			renderActionButtons(actionButtons),
			"",
			t.HintLabel.Render("Prompt and profiles"),
		)
	}
	if a.catalogBrowser.kind == catalogKindExpertPackDetail {
		actionButtons = a.expertPackDetailActionButtons()
		if len(actionButtons) > 0 {
			actionRow = len(rows) + 1
			rows = append(rows,
				t.HintLabel.Render("Pack actions"),
				renderActionButtons(actionButtons),
				"",
				t.HintLabel.Render("Pack structure"),
			)
		}
	}
	catalogBrowserNormalizeSelection(a.catalogBrowser)
	contentIndexes := catalogBrowserContentIndexes(a.catalogBrowser.kind, a.catalogBrowser.items)
	selectionPosition := catalogBrowserSelectionPosition(contentIndexes, a.catalogBrowser.sel)
	a.catalogBrowser.offset = catalogBrowserClampOffsetForKind(
		a.catalogBrowser.kind,
		selectionPosition,
		a.catalogBrowser.offset,
		len(contentIndexes),
	)
	start := a.catalogBrowser.offset
	itemBudget := catalogBrowserVisibleItemBudget(a.catalogBrowser.kind)
	end := min(len(contentIndexes), start+itemBudget)
	listItems := make([]modalListItem, 0, end-start)
	for pos := start; pos < end; pos++ {
		i := contentIndexes[pos]
		item := a.catalogBrowser.items[i]
		// LLL2: dim disabled tools so the user can scan what's off
		// at a glance. Selected highlight still wins so the cursor
		// never disappears on a disabled row.
		isDisabled := item.disabled || (a.catalogBrowser.kind == catalogKindTools &&
			a.disabledTools != nil && a.disabledTools[item.id])
		idx := i
		description := compactCatalogText(firstNonEmpty(item.inlineDesc, item.desc))
		inlineMeta := ""
		if a.catalogBrowser.kind == catalogKindTools ||
			a.catalogBrowser.kind == catalogKindPrompts ||
			a.catalogBrowser.kind == catalogKindExpertPacks {
			inlineMeta = description
			description = ""
		}
		listItems = append(listItems, modalListItem{
			id:          fmt.Sprintf("catalog:item:%d", idx),
			title:       item.title,
			meta:        inlineMeta,
			description: description,
			status:      catalogStatusTagLabel(item.statusTag),
			selected:    i == a.catalogBrowser.sel,
			disabled:    isDisabled,
			action:      nil,
		})
		if !isDisabled {
			listItems[len(listItems)-1].action = func(app *App) tea.Cmd {
				if app.catalogBrowser == nil || idx < 0 || idx >= len(app.catalogBrowser.items) {
					return nil
				}
				app.catalogBrowser.sel = idx
				app.catalogBrowser.offset = catalogBrowserClampOffsetForKind(app.catalogBrowser.kind, idx, app.catalogBrowser.offset, len(app.catalogBrowser.items))
				app.cancelCatalogPendingDeletesOutsideSelection()
				_, cmd := app.handleCatalogBrowserKey(keyMsg("enter"))
				return cmd
			}
		}
	}
	descriptionLines := 2
	if a.catalogBrowser.kind == catalogKindTools ||
		a.catalogBrowser.kind == catalogKindPrompts ||
		a.catalogBrowser.kind == catalogKindExpertPacks {
		descriptionLines = 1
	}
	list := a.renderModalList(listItems, modalListOptions{
		width:            listW,
		rowBudget:        catalogBrowserBodyRows,
		descriptionLines: descriptionLines,
	})
	listStartRow := len(rows)
	rows = append(rows, list.rows...)
	end = start + list.renderedItems
	bodyRows := catalogBrowserBodyRowsForContent(len(rows), len(contentIndexes), itemBudget)

	hintText := catalogBrowserHintText(a.catalogBrowser)
	win := scrollWindow{
		start:  start,
		end:    end,
		scroll: start,
		total:  len(contentIndexes),
	}
	rendered := a.renderSelectableListModal(selectableListModalOptions{
		frame: modalFrameOptions{
			width:   w,
			title:   a.catalogBrowser.title,
			buttons: buttons,
			footer:  t.HintLabel.Italic(true).Render(hintText),
		},
		rows:           rows,
		list:           list,
		listStart:      listStartRow,
		listWidth:      listW,
		bodyRows:       bodyRows,
		window:         win,
		wheelID:        "catalog:list:wheel",
		surfaceWheelID: "catalog",
		wheelAction: func(app *App, button tea.MouseButton) tea.Cmd {
			return app.handleCatalogBrowserWheel(button)
		},
		railAction: func(app *App, index int) tea.Cmd {
			if app.catalogBrowser != nil {
				indexes := catalogBrowserContentIndexes(app.catalogBrowser.kind, app.catalogBrowser.items)
				index = clampSelection(index, len(indexes))
				if index >= 0 && index < len(indexes) {
					app.catalogBrowser.sel = indexes[index]
				}
				app.catalogBrowser.offset = catalogBrowserClampOffsetForKind(app.catalogBrowser.kind, index, app.catalogBrowser.offset, len(indexes))
				app.cancelCatalogPendingDeletesOutsideSelection()
			}
			return nil
		},
	})
	if actionRow >= 0 && len(actionButtons) > 0 {
		a.registerModalButtons(rendered.modal, rendered.bodyRow+actionRow, actionCol, actionButtons)
	}
	return rendered.modal
}

func catalogBrowserIntro(kind catalogBrowserKind) string {
	switch kind {
	case catalogKindTools:
		return "Actions and MCP in one operator view. Connection rows show health; indented tool rows show call policy and required inputs. Use /mcp to add or repair connections."
	case catalogKindMcp:
		return "Manage connections that supply tools, resources, and prompts. Use /tools when you want the unified action inventory."
	case catalogKindSkills:
		return "Skills supplied by installed experts or active workflow blueprints. Use /agent-blueprints to add more."
	case catalogKindExpertPacks:
		return "Expert packs bundle workflow-ready experts, prompts, tools, and routing defaults. Install them from Agent Blueprints, then activate one for a session."
	case catalogKindPrompts:
		return "Prompt library for the active workspace/session. Provider groups show built-in, workspace, blueprint, and session override prompts when they apply."
	default:
		return ""
	}
}

func catalogBrowserWorkflowGuide(kind catalogBrowserKind) string {
	switch kind {
	case catalogKindAgentBlueprints:
		return "Setup flow: browse sources -> select blueprint -> install -> open detail -> activate for session."
	case catalogKindAgentBlueprintSources:
		return "Source flow: select a source to refresh/remove; select a provided blueprint to install into this workspace."
	default:
		return ""
	}
}

func (a *App) catalogBrowserContextLine(kind catalogBrowserKind) string {
	switch kind {
	case catalogKindPrompts, catalogKindSkills, catalogKindExpertPacks:
	default:
		return ""
	}
	workspace := firstNonEmpty(a.headerWorkspaceLabel(), strings.TrimSpace(a.wsID), "default workspace")
	session := "no session selected"
	if a.selected >= 0 && a.selected < len(a.sessions) {
		s := a.sessions[a.selected]
		session = firstNonEmpty(strings.TrimSpace(s.Title), strings.TrimSpace(s.ID), "selected session")
	}
	workflow := "no active workflow blueprint"
	if id := a.activeAgentBlueprintID(); id != "" {
		workflow = id
		if scope := a.activeAgentBlueprintScope(); scope != "" {
			workflow += " (" + scope + ")"
		}
	}
	return "Context: workspace " + workspace + " · session " + session + " · workflow " + workflow
}

func catalogBrowserHintText(cb *catalogBrowserState) string {
	if cb == nil {
		return "↑/↓ navigate · Esc close"
	}
	switch cb.kind {
	case catalogKindTools:
		if cb.sel >= 0 && cb.sel < len(cb.items) && cb.items[cb.sel].id == "none" {
			return modalKeyHint("no callable actions yet", "i add connection", "/agent-blueprints activate workflow", "Esc close")
		}
		if cb.sel >= 0 && cb.sel < len(cb.items) && strings.HasPrefix(cb.items[cb.sel].id, "mcpserver/") {
			return modalKeyHint("↑/↓ navigate", "Enter connection detail", "r reconnect", "i add connection", "d remove connection", "Esc close")
		}
		if cb.sel >= 0 && cb.sel < len(cb.items) && strings.HasPrefix(cb.items[cb.sel].id, "toolsource/") {
			return modalKeyHint("↑/↓ navigate", "Enter group summary", "i add connection", "Esc close")
		}
		return modalKeyHint("↑/↓ navigate", "Enter details", "Space hide/show selected tool", "i add connection", "Esc close")
	case catalogKindMcp:
		return modalKeyHint("↑/↓ navigate", "Enter detail", "i add connection", "d remove connection", "Esc close")
	case catalogKindSkills:
		if cb.sel >= 0 && cb.sel < len(cb.items) && cb.items[cb.sel].id == "none" {
			return modalKeyHint("no skills yet", "/agent-blueprints add skills", "Esc close")
		}
		return modalKeyHint("↑/↓ navigate", "Enter details", "Esc close")
	case catalogKindAgents:
		return modalKeyHint("↑/↓ navigate", "Enter details", "c create expert", "x extract expert", "o set next turn", "Esc close")
	case catalogKindMcpDetail:
		return modalKeyHint("↑/↓ navigate", "Enter details", "r reconnect", "Esc/Backspace back")
	case catalogKindAgentDetail:
		if cb.pendingDeleteAgentID == cb.agentID && cb.agentID != "" {
			return modalKeyHint("confirm delete armed", "d/Enter confirm delete", "any other key cancels", "Esc/Backspace back")
		}
		parts := []string{"↑/↓ navigate structure", "Enter details", "c clone"}
		if catalogBrowserAgentIsUserOwned(cb) {
			parts = append(parts, "e edit")
			parts = append(parts, "d delete")
		}
		parts = append(parts, "o set next turn", "Esc/Backspace back")
		return modalKeyHint(parts...)
	case catalogKindPrompts:
		if catalogBrowserItemsAreEmptyState(cb.items) {
			return modalKeyHint("/agent-blueprints activate workflow", "reopen /prompts", "Esc close")
		}
		if cb.sel >= 0 && cb.sel < len(cb.items) && strings.HasPrefix(cb.items[cb.sel].id, "provider/") {
			return modalKeyHint("↑/↓ navigate", "Enter provider summary", "Esc close")
		}
		return modalKeyHint("↑/↓ navigate", "Enter prompt profiles", "Esc close")
	case catalogKindPromptDetail:
		return modalKeyHint("↑/↓ nav", "Enter details", "r render", "v validate", "u reload", "e edit", "s save->codex", "Esc back")
	case catalogKindExpertPacks:
		if catalogBrowserItemsAreEmptyState(cb.items) {
			return modalKeyHint("/agent-blueprints install workflow packs", "then reopen /expert-packs", "Esc close")
		}
		return modalKeyHint("↑/↓ navigate", "Enter details", "Esc close")
	case catalogKindExpertPackDetail:
		if cb.pendingDeleteExpertPackID == cb.expertPackID && cb.expertPackID != "" {
			return modalKeyHint("confirm delete armed", "d/Enter confirm delete", "any other key cancels", "Esc back")
		}
		return modalKeyHint("↑/↓ structure", "Enter details/activate", "u update", "d delete", "Esc back")
	case catalogKindAgentBlueprints:
		return modalKeyHint("↑/↓ move", "Enter detail", "i install path", "v validate path", "s browse sources", "Esc close")
	case catalogKindAgentBlueprintDetail:
		if cb.pendingDeleteBlueprintID == cb.blueprintID && cb.blueprintID != "" {
			return modalKeyHint("confirm delete armed", "d/Enter confirm delete", "any other key cancels", "Esc back")
		}
		if catalogItemDisabled(cb.items, "activate") {
			return modalKeyHint("↑/↓ structure", "Enter details/enable", "activation blocked", "u update", "d delete", "Esc back")
		}
		if catalogItemStatusTag(cb.items, "activate") == "active" {
			return modalKeyHint("↑/↓ structure", "Enter details", "already active", "u update", "d delete", "Esc back")
		}
		return modalKeyHint("↑/↓ structure", "Enter details/enable", "a activate", "u update", "d delete", "Esc back")
	case catalogKindAgentBlueprintSources:
		if cb.sel >= 0 && cb.sel < len(cb.items) && strings.HasPrefix(cb.items[cb.sel].id, "source-blueprint/") {
			return modalKeyHint("↑/↓ navigate", "Enter install selected blueprint", "Esc back")
		}
		if cb.pendingDeleteSourceID != "" && cb.sel >= 0 && cb.sel < len(cb.items) && cb.items[cb.sel].id == "source/"+cb.pendingDeleteSourceID {
			return modalKeyHint("confirm remove armed", "d confirm remove source", "any other key cancels", "Esc back")
		}
		return modalKeyHint("↑/↓ navigate", "Enter source details", "r refresh", "d remove", "Esc back")
	default:
		return modalKeyHint("↑/↓ navigate", "Esc close")
	}
}

func catalogItemDisabled(items []catalogItem, id string) bool {
	for _, item := range items {
		if item.id == id {
			return item.disabled
		}
	}
	return false
}

func catalogItemStatusTag(items []catalogItem, id string) string {
	for _, item := range items {
		if item.id == id {
			return strings.TrimSpace(item.statusTag)
		}
	}
	return ""
}

func catalogBrowserItemsAreEmptyState(items []catalogItem) bool {
	if len(items) == 0 {
		return false
	}
	for _, item := range items {
		if item.id != "none" {
			return false
		}
	}
	return true
}

func catalogStatusTagLabel(tag string) string {
	tag = strings.TrimSpace(tag)
	if tag == "" {
		return ""
	}
	return operatorSourceValueLabel(tag)
}

// catalogCommandForID maps a slash-command ID into a browser kind.
// Returns (_, false) for commands that don't open a browser so the
// caller can fall through to the normal RunCommand dispatch.
func catalogCommandForID(id string) (catalogBrowserKind, bool) {
	switch strings.ToLower(id) {
	case "/mcp":
		return catalogKindMcp, true
	case "/tools":
		return catalogKindTools, true
	case "/skills":
		return catalogKindSkills, true
	case "/experts", "/agents-list":
		// Distinct from /agents which still routes to Settings (richer
		// picker). /agents-list remains a compatibility alias for the
		// operator-facing /experts catalog route.
		return catalogKindAgents, true
	case "/prompts":
		return catalogKindPrompts, true
	case "/expert-packs", "/expertpacks":
		return catalogKindExpertPacks, true
	case "/agent-blueprints", "/blueprints":
		return catalogKindAgentBlueprints, true
	}
	return 0, false
}

func promptCatalogItems(prompts []gact.PromptDefinition, scope client.RuntimeScope) []catalogItem {
	if len(prompts) == 0 {
		desc := "No prompt definitions are visible for this workspace/session. Open /agent-blueprints, activate the intended workflow, then reopen /prompts."
		items := []catalogItem{{
			id:         "none",
			title:      "No prompts available",
			desc:       desc,
			inlineDesc: "workflow prompt library is empty",
			statusTag:  "empty",
		}}
		if strings.TrimSpace(scope.SessionID) == "" {
			desc = "No session is selected, so session and workflow prompts cannot be resolved yet. Start or select a session, activate the intended workflow from /agent-blueprints, then reopen /prompts."
			items[0].desc = desc
			items[0].inlineDesc = "start/select a session first"
			items = append(items, catalogItem{
				id:         "none",
				title:      "Then activate workflow",
				desc:       "Open /agent-blueprints and activate the intended workflow blueprint for the selected session.",
				inlineDesc: "open /agent-blueprints after selecting a session",
			})
		} else {
			items = append(items, catalogItem{
				id:         "none",
				title:      "Activate workflow",
				desc:       "Open /agent-blueprints and activate the intended workflow blueprint for this session.",
				inlineDesc: "open /agent-blueprints and activate workflow",
			})
		}
		items = append(items, catalogItem{
			id:         "none",
			title:      "Reload prompt library",
			desc:       "Reopen /prompts after activation so packaged workflow prompts are visible.",
			inlineDesc: "reopen /prompts after activation",
		})
		return items
	}
	sort.SliceStable(prompts, func(i, j int) bool { return prompts[i].ID < prompts[j].ID })
	groups := map[string][]gact.PromptDefinition{}
	for _, p := range prompts {
		key := promptProviderGroupKey(p)
		groups[key] = append(groups[key], p)
	}
	keys := make([]string, 0, len(groups))
	for key := range groups {
		keys = append(keys, key)
	}
	sort.SliceStable(keys, func(i, j int) bool {
		left := agentBlueprintProviderGroupRank(keys[i])
		right := agentBlueprintProviderGroupRank(keys[j])
		if left != right {
			return left < right
		}
		return keys[i] < keys[j]
	})
	items := make([]catalogItem, 0, len(prompts)+len(keys))
	for _, key := range keys {
		group := append([]gact.PromptDefinition(nil), groups[key]...)
		sort.SliceStable(group, func(i, j int) bool {
			return firstNonEmpty(group[i].Title, group[i].ID) < firstNonEmpty(group[j].Title, group[j].ID)
		})
		items = append(items, promptProviderCatalogItem(key, group))
		for idx, p := range group {
			items = append(items, promptCatalogItem(p, treePrefix(idx, len(group))))
		}
	}
	return items
}

func promptCatalogItem(p gact.PromptDefinition, prefix string) catalogItem {
	status := ""
	if len(p.ValidationErrors) > 0 {
		status = "attention"
	}
	return catalogItem{
		id:         p.ID,
		title:      prefix + stripPromptRowPrefix(firstNonEmpty(p.Title, p.ID)),
		desc:       promptDefinitionDescription(p),
		inlineDesc: promptDefinitionInlineSummary(p),
		statusTag:  status,
	}
}

func promptProviderCatalogItem(key string, prompts []gact.PromptDefinition) catalogItem {
	label := promptProviderGroupLabel(key)
	return catalogItem{
		id:         "provider/" + key,
		title:      "Provider · " + label,
		desc:       fmt.Sprintf("%s prompt source with %s available in this session.", label, pluralizeCount(len(prompts), "prompt")),
		inlineDesc: pluralizeCount(len(prompts), "prompt"),
	}
}

func promptProviderGroupKey(p gact.PromptDefinition) string {
	scope := compactStatusTag(firstNonEmpty(p.Scope, "workspace"))
	switch scope {
	case "builtin", "built-in", "built_in":
		return "built-in"
	case "workspace":
		return "workspace"
	case "session":
		return "session"
	default:
		if scope == "" {
			return "workspace"
		}
		return scope
	}
}

func promptProviderGroupLabel(key string) string {
	return agentBlueprintProviderGroupLabel(key)
}

func promptProviderScopeLabel(scope string) string {
	return strings.ToLower(promptProviderGroupLabel(promptProviderGroupKey(gact.PromptDefinition{Scope: scope})))
}

func promptDefinitionDescription(p gact.PromptDefinition) string {
	parts := make([]string, 0, 5)
	if p.Scope != "" {
		parts = append(parts, promptProviderScopeLabel(p.Scope)+" prompt")
	}
	profiles := sortedPromptProfiles(p.Profiles)
	if len(profiles) > 0 {
		parts = append(parts, fmt.Sprintf("profiles: %s", strings.Join(profiles, ", ")))
	}
	if p.DefaultProfile != "" {
		parts = append(parts, "default profile: "+p.DefaultProfile)
	}
	if len(p.ValidationErrors) > 0 {
		parts = append(parts, "validation: "+pluralizeCount(len(p.ValidationErrors), "validation error")+" - "+strings.Join(p.ValidationErrors, "; "))
	}
	if desc := compactCatalogText(p.Description); desc != "" {
		parts = append(parts, "description: "+desc)
	}
	return strings.Join(parts, " · ")
}

func promptDefinitionInlineSummary(p gact.PromptDefinition) string {
	parts := make([]string, 0, 5)
	if p.Scope != "" {
		parts = append(parts, promptProviderScopeLabel(p.Scope))
	}
	profiles := sortedPromptProfiles(p.Profiles)
	if len(profiles) > 0 {
		parts = append(parts, pluralizeCount(len(profiles), "profile"))
	}
	if p.DefaultProfile != "" {
		if strings.EqualFold(strings.TrimSpace(p.DefaultProfile), "default") {
			parts = append(parts, "default profile")
		} else {
			parts = append(parts, "default profile "+p.DefaultProfile)
		}
	}
	if len(p.ValidationErrors) > 0 {
		parts = append(parts, pluralizeCount(len(p.ValidationErrors), "validation issue"))
	}
	if len(parts) == 0 {
		return "runtime prompt"
	}
	return truncate(strings.Join(parts, " · "), 96)
}

func stripPromptRowPrefix(title string) string {
	title = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(title), "Prompt · "))
	for {
		trimmed := strings.TrimSpace(title)
		next := trimmed
		for _, prefix := range []string{"└─", "├─", "─"} {
			if strings.HasPrefix(trimmed, prefix) {
				next = strings.TrimSpace(strings.TrimPrefix(trimmed, prefix))
				break
			}
		}
		if next == trimmed {
			return trimmed
		}
		title = next
	}
}

func sortedPromptProfiles(profiles map[string]gact.PromptProfile) []string {
	names := make([]string, 0, len(profiles))
	for name := range profiles {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

func promptProfileDescription(name string, p gact.PromptProfile, isDefault bool) string {
	parts := make([]string, 0, 5)
	if isDefault {
		parts = append(parts, "current default")
	}
	if scope := firstNonEmpty(p.Scope, ""); scope != "" {
		parts = append(parts, scope+" profile")
	}
	if p.Provider != "" {
		parts = append(parts, "provider: "+p.Provider)
	}
	if p.Model != "" {
		parts = append(parts, "model: "+p.Model)
	}
	if p.SourcePath != "" {
		parts = append(parts, "source: "+shortPathLabel(p.SourcePath))
	}
	if len(parts) == 0 {
		parts = append(parts, firstNonEmpty(compactCatalogText(p.Text), name+" profile"))
	}
	return strings.Join(parts, " · ")
}

func expertPackCatalogItems(packs []gact.ExpertPackDefinition) []catalogItem {
	if len(packs) == 0 {
		return []catalogItem{{
			id:         "none",
			title:      "No expert packs installed",
			desc:       "Open /agent-blueprints, install a workflow blueprint from a marketplace source, then reopen /expert-packs to inspect and activate the pack for the current session.",
			inlineDesc: "workflow pack library is empty",
			statusTag:  "empty",
		}, {
			id:         "none",
			title:      "Install workflow pack",
			desc:       "Open /agent-blueprints and install a workflow blueprint from a marketplace source.",
			inlineDesc: "open /agent-blueprints and install from marketplace",
		}, {
			id:         "none",
			title:      "Activate for session",
			desc:       "Reopen /expert-packs, inspect the installed pack, and activate it for the current session.",
			inlineDesc: "reopen /expert-packs and activate for session",
		}}
	}
	sort.SliceStable(packs, func(i, j int) bool {
		if packs[i].Scope != packs[j].Scope {
			return packs[i].Scope < packs[j].Scope
		}
		return firstNonEmpty(packs[i].Title, packs[i].ID) < firstNonEmpty(packs[j].Title, packs[j].ID)
	})
	items := make([]catalogItem, 0, len(packs))
	for _, pack := range packs {
		status := firstNonEmpty(pack.Scope, "pack")
		if !pack.Enabled || len(pack.ValidationErrors) > 0 {
			status = "invalid"
		}
		items = append(items, catalogItem{
			id:         pack.ID,
			title:      firstNonEmpty(pack.Title, pack.ID),
			desc:       expertPackDescription(pack),
			inlineDesc: expertPackInlineSummary(pack),
			statusTag:  status,
		})
	}
	return items
}

func agentBlueprintCatalogItems(blueprints []gact.AgentBlueprintDefinition) []catalogItem {
	sort.SliceStable(blueprints, func(i, j int) bool {
		if blueprints[i].Scope != blueprints[j].Scope {
			return blueprints[i].Scope < blueprints[j].Scope
		}
		return firstNonEmpty(blueprints[i].Title, blueprints[i].ID) < firstNonEmpty(blueprints[j].Title, blueprints[j].ID)
	})
	items := make([]catalogItem, 0, len(blueprints))
	providerGroups := map[string][]gact.AgentBlueprintDefinition{}
	sourceSummaries, sourceGroups := agentBlueprintSourceSummaries(blueprints)
	for i, summary := range sourceSummaries {
		status := marketplaceSourceStatusTag(summary)
		if agentBlueprintSourceNeedsAttention(summary) {
			status = "attention"
		}
		items = append(items, catalogItem{
			id:         fmt.Sprintf("source/%d", i),
			title:      "Source · " + sourceTitle(summary),
			desc:       formatAgentBlueprintSourceSummary(summary),
			inlineDesc: agentBlueprintSourceInlineSummary(summary),
			statusTag:  status,
		})
		group := append([]gact.AgentBlueprintDefinition(nil), sourceGroups[summary.key]...)
		sort.SliceStable(group, func(i, j int) bool {
			return firstNonEmpty(group[i].Title, group[i].ID) < firstNonEmpty(group[j].Title, group[j].ID)
		})
		for idx, blueprint := range group {
			items = append(items, agentBlueprintCatalogItem(blueprint, treePrefix(idx, len(group))))
		}
	}
	for _, blueprint := range blueprints {
		if agentBlueprintSourceKey(blueprint) != "" {
			continue
		}
		providerGroups[agentBlueprintProviderGroupKey(blueprint)] = append(providerGroups[agentBlueprintProviderGroupKey(blueprint)], blueprint)
	}
	providerKeys := make([]string, 0, len(providerGroups))
	for key := range providerGroups {
		providerKeys = append(providerKeys, key)
	}
	sort.SliceStable(providerKeys, func(i, j int) bool {
		left := agentBlueprintProviderGroupRank(providerKeys[i])
		right := agentBlueprintProviderGroupRank(providerKeys[j])
		if left != right {
			return left < right
		}
		return providerKeys[i] < providerKeys[j]
	})
	for _, key := range providerKeys {
		group := append([]gact.AgentBlueprintDefinition(nil), providerGroups[key]...)
		sort.SliceStable(group, func(i, j int) bool {
			return firstNonEmpty(group[i].Title, group[i].ID) < firstNonEmpty(group[j].Title, group[j].ID)
		})
		items = append(items, agentBlueprintProviderCatalogItem(key, group))
		for idx, blueprint := range group {
			items = append(items, agentBlueprintCatalogItem(blueprint, treePrefix(idx, len(group))))
		}
	}
	return items
}

func agentBlueprintProviderCatalogItem(key string, blueprints []gact.AgentBlueprintDefinition) catalogItem {
	label := agentBlueprintProviderGroupLabel(key)
	return catalogItem{
		id:         "provider/" + key,
		title:      label + " blueprints",
		desc:       fmt.Sprintf("%s provides %s in this workspace.", label, pluralizeCount(len(blueprints), "blueprint")),
		inlineDesc: pluralizeCount(len(blueprints), "blueprint"),
		statusTag:  strings.ToLower(label),
	}
}

func agentBlueprintProviderGroupKey(blueprint gact.AgentBlueprintDefinition) string {
	scope := compactStatusTag(firstNonEmpty(blueprint.Scope, "workspace"))
	switch scope {
	case "builtin", "built-in", "built_in":
		return "built-in"
	case "workspace":
		return "workspace"
	case "session":
		return "session"
	default:
		if scope == "" {
			return "workspace"
		}
		return scope
	}
}

func agentBlueprintProviderGroupLabel(key string) string {
	switch key {
	case "built-in":
		return "Built-in"
	case "workspace":
		return "Workspace"
	case "session":
		return "Session"
	default:
		return humanizeAgentLabel(key)
	}
}

func agentBlueprintProviderGroupRank(key string) int {
	switch key {
	case "built-in":
		return 0
	case "workspace":
		return 1
	case "session":
		return 2
	default:
		return 10
	}
}

func agentBlueprintCatalogItem(blueprint gact.AgentBlueprintDefinition, prefix string) catalogItem {
	title := firstNonEmpty(blueprint.Title, blueprint.ID)
	if prefix != "" {
		title = prefix + title
	}
	return catalogItem{
		id:         blueprint.ID,
		title:      title,
		desc:       agentBlueprintDescription(blueprint),
		inlineDesc: agentBlueprintInlineSummary(blueprint),
		statusTag:  agentBlueprintCatalogStatus(blueprint),
	}
}

func markActiveAgentBlueprintCatalogItems(items []catalogItem, activeID, activeScope string) []catalogItem {
	activeID = strings.TrimSpace(activeID)
	if activeID == "" {
		return items
	}
	scope := firstNonEmpty(strings.TrimSpace(activeScope), "unknown scope")
	out := append([]catalogItem(nil), items...)
	for i := range out {
		if out[i].id != activeID {
			continue
		}
		out[i].title = activeAgentBlueprintTitle(out[i].title)
		out[i].inlineDesc = prependCatalogInline(out[i].inlineDesc, "active in selected session")
		if scope != "session" {
			out[i].inlineDesc = appendCatalogInline(out[i].inlineDesc, scope+" blueprint")
		}
		out[i].statusTag = "active"
	}
	return out
}

func markActiveAgentBlueprintDetailItems(items []catalogItem, blueprintID, activeID, activeScope string) []catalogItem {
	if strings.TrimSpace(blueprintID) == "" || strings.TrimSpace(blueprintID) != strings.TrimSpace(activeID) {
		return items
	}
	scope := firstNonEmpty(strings.TrimSpace(activeScope), "unknown scope")
	out := append([]catalogItem(nil), items...)
	for i := range out {
		switch out[i].id {
		case "activate":
			out[i].title = "Active for current session"
			out[i].desc = "This blueprint is already active for the selected session. Reapplying keeps the session pinned to this blueprint."
			if scope != "session" {
				out[i].desc += " Blueprint source scope: " + scope + "."
			}
			out[i].statusTag = "active"
			out[i].disabled = false
		case "blueprint/" + blueprintID:
			out[i].statusTag = "active"
		}
	}
	return out
}

func activeAgentBlueprintDetailStatus(items []catalogItem) string {
	for _, item := range items {
		if item.id != "activate" || item.statusTag != "active" {
			continue
		}
		detail := compactCatalogText(item.desc)
		if detail == "" {
			return "active in selected session"
		}
		return "active in selected session - " + detail
	}
	return ""
}

func activeAgentBlueprintTitle(title string) string {
	for _, prefix := range []string{"  ├─ ", "  └─ "} {
		if strings.HasPrefix(title, prefix) {
			label := strings.TrimSpace(strings.TrimPrefix(title, prefix))
			if strings.HasPrefix(label, "◆ ") {
				return prefix + label
			}
			return prefix + "◆ " + label
		}
	}
	if strings.HasPrefix(title, "◆ ") {
		return title
	}
	return "◆ " + strings.TrimSpace(title)
}

func prependCatalogInline(existing, prefix string) string {
	existing = strings.TrimSpace(existing)
	prefix = strings.TrimSpace(prefix)
	if prefix == "" {
		return existing
	}
	if existing == "" {
		return prefix
	}
	if strings.Contains(existing, prefix) {
		return existing
	}
	return prefix + " · " + existing
}

func appendCatalogInline(existing, suffix string) string {
	existing = strings.TrimSpace(existing)
	suffix = strings.TrimSpace(suffix)
	if suffix == "" {
		return existing
	}
	if existing == "" {
		return suffix
	}
	if strings.Contains(existing, suffix) {
		return existing
	}
	return existing + " · " + suffix
}

func treePrefix(index, total int) string {
	if total <= 1 || index == total-1 {
		return "  └─ "
	}
	return "  ├─ "
}

func agentBlueprintInlineSummary(blueprint gact.AgentBlueprintDefinition) string {
	parts := make([]string, 0, 7)
	if blueprint.Version != "" {
		parts = append(parts, "v"+blueprint.Version)
	}
	if state := agentBlueprintMarketplaceState(blueprint); state != "" {
		parts = append(parts, state)
	} else if blueprint.Scope != "" {
		parts = append(parts, blueprint.Scope)
	}
	if len(blueprint.ValidationErrors) > 0 {
		parts = append(parts, pluralizeCount(len(blueprint.ValidationErrors), "error"))
	} else if len(blueprint.ValidationWarnings) > 0 {
		parts = append(parts, pluralizeCount(len(blueprint.ValidationWarnings), "warning"))
	}
	if len(parts) == 0 {
		return "markdown agent blueprint"
	}
	return strings.Join(parts, " · ")
}

func agentBlueprintCatalogStatus(blueprint gact.AgentBlueprintDefinition) string {
	if !blueprint.Enabled || len(blueprint.ValidationErrors) > 0 {
		return "invalid"
	}
	if len(blueprint.ValidationWarnings) > 0 {
		return "warning"
	}
	if agentBlueprintSourceKey(blueprint) == "" {
		return firstNonEmpty(blueprint.Scope, "blueprint")
	}
	install := agentBlueprintInstallMetadata(blueprint)
	if status := compactStatusTag(stringValue(install["status"])); status != "" {
		return status
	}
	if state := agentBlueprintMarketplaceState(blueprint); state != "" {
		return state
	}
	return firstNonEmpty(blueprint.Scope, "blueprint")
}

func compactStatusTag(status string) string {
	status = strings.ToLower(strings.TrimSpace(status))
	status = strings.ReplaceAll(status, " ", "_")
	status = strings.ReplaceAll(status, "-", "_")
	return status
}

type agentBlueprintSourceSummary struct {
	key         string
	source      string
	kind        string
	ref         string
	commit      string
	checksum    string
	status      string
	statusMsg   string
	trust       string
	installedAt string
	syncedAt    string
	scope       string
	blueprints  []string
	states      []string
	warnings    []string
	errors      []string
}

func agentBlueprintSourceCatalogItems(blueprints []gact.AgentBlueprintDefinition) []catalogItem {
	summaries, _ := agentBlueprintSourceSummaries(blueprints)
	items := make([]catalogItem, 0, len(summaries))
	for i, summary := range summaries {
		status := firstNonEmpty(summary.kind, "source")
		if agentBlueprintSourceNeedsAttention(summary) {
			status = "attention"
		}
		items = append(items, catalogItem{
			id:        fmt.Sprintf("source/%d", i),
			title:     "Marketplace source · " + sourceTitle(summary),
			desc:      formatAgentBlueprintSourceSummary(summary),
			statusTag: status,
		})
	}
	return items
}

func agentBlueprintSourceSummaries(blueprints []gact.AgentBlueprintDefinition) ([]*agentBlueprintSourceSummary, map[string][]gact.AgentBlueprintDefinition) {
	byKey := map[string]*agentBlueprintSourceSummary{}
	groups := map[string][]gact.AgentBlueprintDefinition{}
	for _, blueprint := range blueprints {
		key := agentBlueprintSourceKey(blueprint)
		if key == "" {
			continue
		}
		install := agentBlueprintInstallMetadata(blueprint)
		source := firstNonEmpty(stringValue(install["source"]), stringValue(install["url"]), stringValue(install["path"]))
		kind := firstNonEmpty(stringValue(install["source_kind"]), stringValue(install["kind"]), "source")
		ref := stringValue(install["ref"])
		summary := byKey[key]
		if summary == nil {
			summary = &agentBlueprintSourceSummary{
				key:         key,
				source:      source,
				kind:        kind,
				ref:         ref,
				commit:      stringValue(install["commit"]),
				checksum:    stringValue(install["checksum"]),
				status:      stringValue(install["status"]),
				statusMsg:   firstNonEmpty(stringValue(install["status_message"]), stringValue(install["message"])),
				trust:       firstNonEmpty(stringValue(install["trust"]), stringValue(install["trust_policy"])),
				installedAt: stringValue(install["installed_at"]),
				syncedAt:    firstNonEmpty(stringValue(install["last_sync"]), stringValue(install["last_synced_at"]), stringValue(install["synced_at"])),
				scope:       firstNonEmpty(stringValue(install["scope"]), blueprint.Scope),
			}
			byKey[key] = summary
		}
		groups[key] = append(groups[key], blueprint)
		blueprintName := firstNonEmpty(blueprint.Title, blueprint.ID)
		summary.blueprints = append(summary.blueprints, blueprintName)
		if state := agentBlueprintMarketplaceState(blueprint); state != "" {
			summary.states = appendUniqueStrings(summary.states, blueprintName+" ("+state+")")
		}
		if scope := firstNonEmpty(stringValue(install["scope"]), blueprint.Scope); scope != "" {
			summary.scope = strings.Join(appendUniqueStrings(splitCommaList(summary.scope), scope), ", ")
		}
		summary.warnings = appendUniqueStrings(summary.warnings, stringListFromAny(install["warnings"])...)
		summary.warnings = appendUniqueStrings(summary.warnings, stringListFromAny(install["validation_warnings"])...)
		summary.errors = appendUniqueStrings(summary.errors, stringListFromAny(install["errors"])...)
		summary.errors = appendUniqueStrings(summary.errors, stringListFromAny(install["validation_errors"])...)
		if errText := firstNonEmpty(stringValue(install["error"]), stringValue(install["last_error"])); errText != "" {
			summary.errors = appendUniqueStrings(summary.errors, errText)
		}
		if len(blueprint.ValidationErrors) > 0 {
			summary.errors = appendUniqueStrings(summary.errors, blueprint.ID+": "+strings.Join(blueprint.ValidationErrors, "; "))
		}
		if len(blueprint.ValidationWarnings) > 0 {
			summary.warnings = appendUniqueStrings(summary.warnings, blueprint.ID+": "+strings.Join(blueprint.ValidationWarnings, "; "))
		}
	}
	keys := make([]string, 0, len(byKey))
	for key := range byKey {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	summaries := make([]*agentBlueprintSourceSummary, 0, len(keys))
	for _, key := range keys {
		summary := byKey[key]
		sort.Strings(summary.blueprints)
		sort.Strings(summary.states)
		summaries = append(summaries, summary)
	}
	return summaries, groups
}

func agentBlueprintSourceKey(blueprint gact.AgentBlueprintDefinition) string {
	install := agentBlueprintInstallMetadata(blueprint)
	source := firstNonEmpty(stringValue(install["source"]), stringValue(install["url"]), stringValue(install["path"]))
	if source == "" {
		return ""
	}
	kind := firstNonEmpty(stringValue(install["source_kind"]), stringValue(install["kind"]), "source")
	ref := stringValue(install["ref"])
	return strings.Join([]string{kind, source, ref}, "\x00")
}

func formatMcpServerSummary(server gact.McpServer) string {
	capabilities := detailedMcpCapabilityLabels(server.DeclaredCapabilities)
	if len(capabilities) == 0 {
		capabilities = append(capabilities, "none advertised")
	}
	displayName := firstNonEmpty(server.Name, server.ID)
	status := strings.TrimSpace(server.Status)
	if status == "" {
		status = "unknown"
	}
	rows := appendDetailSection(nil, "Operator summary",
		detailField{"connection", displayName},
		detailField{"status", status},
		detailField{"live health", mcpLiveHealthSummary(server)},
		detailField{"provides", strings.Join(capabilities, ", ")},
		detailField{"manage", "open /mcp to add, reconnect, or remove this connection"},
		detailField{"tool access", "open /tools to see callable actions from eligible connections and workflows"},
		detailField{"resources and prompts", "listed below when this connection exposes them"},
	)
	if server.Instructions != "" {
		rows = appendDetailSection(rows, "How to use it", detailField{"", server.Instructions})
	}
	if server.LastError != "" {
		rows = appendDetailSection(rows, "Connection error", detailField{"", server.LastError})
	}
	rows = appendDetailSection(rows, "Technical details",
		detailField{"id", server.ID},
		detailField{"status", server.Status},
		detailField{"transport", server.Transport},
		detailField{"MCP protocol", server.ProtocolVersion},
		detailField{"version", server.Version},
		detailField{"live tools", stringValue(server.ServerInfo["live_tools_count"])},
		detailField{"live latency", stringValue(server.ServerInfo["live_latency_ms"])},
	)
	if len(server.ServerInfo) > 0 {
		if summary := contextMapSummary(server.ServerInfo, "name", "version", "title"); summary != "" {
			rows = append(rows, detailFieldRows("server", summary)...)
		}
	}
	return strings.Join(rows, "\n")
}

func mcpLiveHealthSummary(server gact.McpServer) string {
	live, ok := server.ServerInfo["live_reachable"].(bool)
	if !ok {
		return ""
	}
	if live {
		return "reachable"
	}
	if server.LastError != "" {
		return "unreachable: " + compactCatalogText(server.LastError)
	}
	return "unreachable"
}

func mcpServerDetailInlineSummary(server gact.McpServer) string {
	parts := make([]string, 0, 5)
	if server.Status != "" {
		parts = append(parts, server.Status)
	}
	if server.Transport != "" {
		parts = append(parts, server.Transport)
	}
	caps := compactMcpCapabilityLabels(server.DeclaredCapabilities)
	if len(caps) > 0 {
		parts = append(parts, strings.Join(caps, ", "))
	}
	if server.LastError != "" {
		parts = append(parts, "error "+compactCatalogText(server.LastError))
	}
	if len(parts) == 0 {
		return "MCP connection overview"
	}
	return strings.Join(parts, " · ")
}

func detailedMcpCapabilityLabels(cap gact.McpCapabilities) []string {
	labels := make([]string, 0, 4)
	if cap.Tools {
		labels = append(labels, "callable tools")
	}
	if cap.Resources != nil {
		resource := "resources"
		flags := []string{}
		if cap.Resources.Subscribe {
			flags = append(flags, "subscribe")
		}
		if cap.Resources.ListChanged {
			flags = append(flags, "list changes")
		}
		if len(flags) > 0 {
			resource += " (" + strings.Join(flags, ", ") + ")"
		}
		labels = append(labels, resource)
	}
	if cap.Prompts != nil {
		prompt := "prompts"
		if cap.Prompts.ListChanged {
			prompt += " (list changes)"
		}
		labels = append(labels, prompt)
	}
	if cap.Logging && len(labels) == 0 {
		labels = append(labels, "logging")
	}
	return labels
}

func mcpServerCatalogDescription(server gact.McpServer) string {
	parts := make([]string, 0, 5)
	if server.Status != "" {
		parts = append(parts, server.Status)
	}
	if server.ProtocolVersion != "" {
		parts = append(parts, "MCP "+server.ProtocolVersion)
	}
	if live, ok := server.ServerInfo["live_reachable"].(bool); ok {
		if live {
			parts = append(parts, "live reachable")
		} else {
			parts = append(parts, "live unreachable")
		}
	}
	caps := compactMcpCapabilityLabels(server.DeclaredCapabilities)
	if len(caps) > 0 {
		parts = append(parts, "offers "+strings.Join(caps, ", "))
	}
	if server.LastError != "" {
		parts = append(parts, "needs attention: "+compactCatalogText(server.LastError))
	}
	if len(parts) == 0 {
		return "no connection metadata"
	}
	return truncate(strings.Join(parts, " · "), 96)
}

func compactMcpCapabilityLabels(cap gact.McpCapabilities) []string {
	labels := make([]string, 0, 4)
	if cap.Tools {
		labels = append(labels, "tools")
	}
	if cap.Resources != nil {
		labels = append(labels, "resources")
	}
	if cap.Prompts != nil {
		labels = append(labels, "prompts")
	}
	if cap.Logging && len(labels) == 0 {
		labels = append(labels, "logging")
	}
	return labels
}

func agentBlueprintSourceRegistryItems(sources []gact.AgentBlueprintSource) []catalogItem {
	sort.SliceStable(sources, func(i, j int) bool {
		if sources[i].Status != sources[j].Status {
			return sources[i].Status < sources[j].Status
		}
		return firstNonEmpty(sources[i].Name, sources[i].ID) < firstNonEmpty(sources[j].Name, sources[j].ID)
	})
	items := make([]catalogItem, 0, len(sources)*2)
	if len(sources) == 0 {
		return []catalogItem{{
			id:        "source/none",
			title:     "No marketplace sources configured",
			desc:      "Use install to add blueprints directly, or add sources through CLIO when a source URL is available.",
			statusTag: "empty",
			disabled:  true,
		}}
	}
	for _, source := range sources {
		status := firstNonEmpty(source.Status, "source")
		if source.Error != "" {
			status = "error"
		}
		sourceID := source.ID
		items = append(items, catalogItem{
			id:         "source/" + sourceID,
			title:      "▾ " + firstNonEmpty(source.Name, source.Source, source.ID),
			desc:       formatAgentBlueprintRegistrySource(source),
			inlineDesc: agentBlueprintRegistrySourceInlineSummary(source),
			statusTag:  status,
		})
		blueprints := append([]gact.AgentBlueprintDefinition(nil), source.AvailableBlueprints...)
		sort.SliceStable(blueprints, func(i, j int) bool {
			return firstNonEmpty(blueprints[i].Title, blueprints[i].ID) < firstNonEmpty(blueprints[j].Title, blueprints[j].ID)
		})
		for idx, blueprint := range blueprints {
			items = append(items, catalogItem{
				id:         "source-blueprint/" + sourceID + "/" + blueprint.ID,
				title:      treePrefix(idx, len(blueprints)) + firstNonEmpty(blueprint.Title, blueprint.ID),
				desc:       agentBlueprintDescription(blueprint),
				inlineDesc: agentBlueprintRegistryBlueprintInlineSummary(blueprint),
				statusTag:  firstNonEmpty(blueprint.Version, "install"),
			})
		}
	}
	return items
}

func agentBlueprintRegistrySourceInlineSummary(source gact.AgentBlueprintSource) string {
	parts := make([]string, 0, 8)
	if source.SourceKind != "" {
		parts = append(parts, marketplaceSourceKindLabel(source.SourceKind))
	}
	if source.Ref != "" {
		parts = append(parts, "branch "+source.Ref)
	}
	if source.Status != "" {
		parts = append(parts, source.Status)
	}
	if source.Commit != "" {
		parts = append(parts, "revision "+shortHash(source.Commit))
	} else if source.PinnedCommit != "" {
		parts = append(parts, "pinned "+shortHash(source.PinnedCommit))
	}
	if len(source.AvailableBlueprints) > 0 {
		parts = append(parts, availableBlueprintCountLabel(len(source.AvailableBlueprints)))
	}
	if source.Error != "" {
		parts = append(parts, "needs attention: "+compactCatalogText(source.Error))
	}
	if len(parts) == 0 {
		return "source registry entry"
	}
	return strings.Join(parts, " · ")
}

func marketplaceSourceKindLabel(kind string) string {
	switch strings.ToLower(strings.TrimSpace(kind)) {
	case "git":
		return "Git marketplace"
	case "path", "local":
		return "local folder"
	case "url", "http", "https":
		return "remote registry"
	case "":
		return ""
	default:
		return strings.ReplaceAll(strings.TrimSpace(kind), "_", " ")
	}
}

func availableBlueprintCountLabel(count int) string {
	if count == 1 {
		return "1 available"
	}
	return fmt.Sprintf("%d available", count)
}

func agentBlueprintRegistryBlueprintInlineSummary(blueprint gact.AgentBlueprintDefinition) string {
	parts := make([]string, 0, 5)
	if state := agentBlueprintMarketplaceState(blueprint); state != "" {
		parts = append(parts, marketplaceBlueprintStateLabel(state))
	} else if blueprint.Scope != "" {
		parts = append(parts, marketplaceBlueprintStateLabel(blueprint.Scope))
	} else {
		parts = append(parts, "available to install")
	}
	install := agentBlueprintInstallMetadata(blueprint)
	if ref := stringValue(install["ref"]); ref != "" {
		parts = append(parts, "branch "+ref)
	}
	if commit := stringValue(install["commit"]); commit != "" {
		parts = append(parts, shortHash(commit))
	}
	return strings.Join(parts, " · ")
}

func pluralizeCount(count int, noun string) string {
	if count == 1 {
		return fmt.Sprintf("1 %s", noun)
	}
	return fmt.Sprintf("%d %ss", count, noun)
}

func parseSourceBlueprintItemID(id string) (sourceID, blueprintID string, ok bool) {
	rest := strings.TrimPrefix(id, "source-blueprint/")
	if rest == id {
		return "", "", false
	}
	sourceID, blueprintID, ok = strings.Cut(rest, "/")
	return sourceID, blueprintID, ok && sourceID != "" && blueprintID != ""
}

func formatAgentBlueprintRegistrySource(source gact.AgentBlueprintSource) string {
	rows := appendDetailSection(nil, "Marketplace connection",
		detailField{"name", firstNonEmpty(source.Name, source.ID)},
		detailField{"status", firstNonEmpty(source.Status, "unknown")},
		detailField{"available", pluralizeCount(len(source.AvailableBlueprints), "blueprint")},
	)
	rows = appendDetailSection(rows, "Repository",
		detailField{"url", source.Source},
		detailField{"type", source.SourceKind},
		detailField{"branch", source.Ref},
		detailField{"current revision", source.Commit},
		detailField{"pinned revision", source.PinnedCommit},
	)
	rows = appendDetailSection(rows, "Registry",
		detailField{"registry id", source.ID},
		detailField{"last synced", source.UpdatedAt},
		detailField{"registered", source.AddedAt},
	)
	if source.Error != "" {
		rows = appendDetailSection(rows, "Error", detailField{"", source.Error})
	}
	rows = appendDetailSection(rows, "Operator paths",
		detailField{"refresh source", "sync this source through the source controls"},
		detailField{"install blueprint", "choose a blueprint below, then install it into the workspace"},
		detailField{"remove source", "remove the registry source; installed blueprints stay installed"},
	)
	if len(source.AvailableBlueprints) > 0 {
		lines := make([]string, 0, len(source.AvailableBlueprints))
		for _, blueprint := range source.AvailableBlueprints {
			line := firstNonEmpty(blueprint.Title, blueprint.ID)
			if blueprint.Version != "" {
				line += " · " + blueprint.Version
			}
			lines = append(lines, "- "+line)
		}
		rows = appendDetailSection(rows, "Available blueprints", detailField{"", strings.Join(lines, "\n")})
	}
	return strings.Join(rows, "\n")
}

func sourceTitle(summary *agentBlueprintSourceSummary) string {
	if summary == nil {
		return "source"
	}
	return compactAgentBlueprintSourceName(summary.source)
}

func compactAgentBlueprintSourceName(source string) string {
	source = strings.TrimSpace(source)
	if source == "" {
		return "source"
	}
	source = strings.TrimSuffix(source, "/")
	source = strings.TrimSuffix(source, ".git")
	if idx := strings.Index(source, "://"); idx >= 0 {
		rest := source[idx+3:]
		if slash := strings.Index(rest, "/"); slash >= 0 && slash+1 < len(rest) {
			source = rest[slash+1:]
		} else {
			source = rest
		}
	}
	if idx := strings.Index(source, ":"); idx >= 0 && strings.Contains(source[:idx], "@") && idx+1 < len(source) {
		source = source[idx+1:]
	}
	parts := strings.Split(source, "/")
	if len(parts) > 2 {
		parts = parts[len(parts)-2:]
	}
	source = strings.Join(parts, "/")
	if source == "" {
		return "source"
	}
	return source
}

func agentBlueprintSourceInlineSummary(summary *agentBlueprintSourceSummary) string {
	if summary == nil {
		return "marketplace source"
	}
	parts := make([]string, 0, 8)
	if summary.ref != "" {
		parts = append(parts, "branch "+summary.ref)
	}
	if summary.status != "" {
		parts = append(parts, marketplaceSourceStatusLabel(summary.status))
	}
	if summary.statusMsg != "" {
		parts = append(parts, compactCatalogText(summary.statusMsg))
	}
	if len(summary.blueprints) > 0 {
		parts = append(parts, pluralizeCount(len(summary.blueprints), "blueprint"))
	}
	if len(summary.errors) > 0 {
		parts = append(parts, pluralizeCount(len(summary.errors), "error"))
	} else if len(summary.warnings) > 0 {
		parts = append(parts, pluralizeCount(len(summary.warnings), "warning"))
	}
	if len(parts) == 0 {
		return "source registry entry"
	}
	return strings.Join(parts, " · ")
}

func marketplaceSourceStatusTag(summary *agentBlueprintSourceSummary) string {
	if summary == nil {
		return "source"
	}
	if status := marketplaceSourceStatusLabel(summary.status); status != "" {
		return status
	}
	if len(summary.blueprints) > 0 {
		return "available"
	}
	return "source"
}

func marketplaceSourceStatusLabel(status string) string {
	status = strings.TrimSpace(status)
	if status == "" {
		return ""
	}
	switch compactStatusTag(status) {
	case "ready", "ok", "synced", "available":
		return "available"
	case "installed":
		return "installed"
	case "stale":
		return "needs refresh"
	case "error", "failed", "failure":
		return "error"
	default:
		return strings.ReplaceAll(status, "_", " ")
	}
}

func marketplaceBlueprintStateLabel(state string) string {
	switch compactStatusTag(state) {
	case "marketplace", "available":
		return "available to install"
	case "installed":
		return "installed"
	default:
		return strings.ReplaceAll(strings.TrimSpace(state), "_", " ")
	}
}

func formatAgentBlueprintSourceSummary(summary *agentBlueprintSourceSummary) string {
	if summary == nil {
		return ""
	}
	fields := []detailField{
		{"ref", summary.ref},
		{"commit", summary.commit},
		{"checksum", summary.checksum},
		{"status", summary.status},
		{"status message", summary.statusMsg},
		{"trust", summary.trust},
		{"installed", summary.installedAt},
		{"last synced", summary.syncedAt},
		{"scope", summary.scope},
		{"blueprints", strings.Join(summary.blueprints, ", ")},
		{"blueprint states", strings.Join(summary.states, "\n")},
	}
	rows := make([]string, 0, len(fields))
	for _, field := range fields {
		if strings.TrimSpace(field.value) == "" {
			continue
		}
		rows = append(rows, detailFieldRows(field.label, field.value)...)
	}
	if len(summary.warnings) > 0 {
		rows = appendDetailSection(rows, "Warnings", detailField{"warnings", strings.Join(summary.warnings, "\n")})
	}
	if len(summary.errors) > 0 {
		rows = appendDetailSection(rows, "Validation", detailField{"errors", strings.Join(summary.errors, "\n")})
	}
	return strings.Join(rows, "\n")
}

func agentBlueprintSourceNeedsAttention(summary *agentBlueprintSourceSummary) bool {
	if summary == nil {
		return false
	}
	if len(summary.errors) > 0 || len(summary.warnings) > 0 {
		return true
	}
	status := strings.ToLower(strings.TrimSpace(summary.status))
	return strings.Contains(status, "error") ||
		strings.Contains(status, "fail") ||
		strings.Contains(status, "stale") ||
		strings.Contains(status, "warning")
}

func expertPackDescription(pack gact.ExpertPackDefinition) string {
	parts := make([]string, 0, 6)
	if pack.Description != "" && len(pack.ValidationErrors) == 0 {
		parts = append(parts, compactCatalogText(pack.Description))
	}
	parts = append(parts, expertPackStatusText(pack))
	if pack.Scope != "" {
		parts = append(parts, pack.Scope)
	}
	if pack.Version != "" {
		parts = append(parts, "v"+pack.Version)
	}
	if len(pack.ValidationErrors) > 0 {
		parts = append(parts, "needs fix: "+displayValidationError(pack.ValidationErrors[0]))
	}
	return strings.Join(parts, " · ")
}

func expertPackInlineSummary(pack gact.ExpertPackDefinition) string {
	parts := make([]string, 0, 6)
	if len(pack.ValidationErrors) == 0 {
		parts = append(parts, expertPackStatusText(pack))
	}
	if pack.Scope != "" {
		parts = append(parts, pack.Scope)
	}
	if pack.Version != "" {
		parts = append(parts, "v"+pack.Version)
	}
	if len(pack.ValidationErrors) > 0 {
		parts = append(parts, "needs fix: "+displayValidationError(pack.ValidationErrors[0]))
	}
	return strings.Join(parts, " · ")
}

func displayValidationErrors(errors []string) []string {
	out := make([]string, 0, len(errors))
	for _, errText := range errors {
		if text := displayValidationError(errText); text != "" {
			out = append(out, text)
		}
	}
	return out
}

func displayValidationError(errText string) string {
	text := compactCatalogText(errText)
	text = strings.ReplaceAll(text, "_", " ")
	lower := strings.ToLower(text)
	switch {
	case strings.Contains(lower, "parent id") && strings.Contains(lower, "missing expert"):
		return "missing parent expert"
	case strings.Contains(lower, "root expert") && strings.Contains(lower, "not found"):
		return "missing root expert"
	}
	return text
}

func agentBlueprintDescription(blueprint gact.AgentBlueprintDefinition) string {
	parts := make([]string, 0, 10)
	if blueprint.Version != "" {
		parts = append(parts, "version: "+blueprint.Version)
	}
	if blueprint.RootExpert != "" {
		parts = append(parts, "root expert: "+blueprint.RootExpert)
	}
	if state := agentBlueprintMarketplaceState(blueprint); state != "" {
		parts = append(parts, "marketplace state: "+state)
	}
	if provenance := agentBlueprintProvenanceLine(blueprint); provenance != "" {
		parts = append(parts, provenance)
	}
	if blueprint.DefinitionPath != "" {
		parts = append(parts, "definition file: "+blueprint.DefinitionPath)
	}
	if len(blueprint.ValidationErrors) > 0 {
		parts = append(parts, "errors: "+strings.Join(blueprint.ValidationErrors, "; "))
	}
	if len(blueprint.ValidationWarnings) > 0 {
		parts = append(parts, "warnings: "+strings.Join(blueprint.ValidationWarnings, "; "))
	}
	if blueprint.Description != "" {
		parts = append(parts, compactCatalogText(blueprint.Description))
	}
	return strings.Join(parts, " · ")
}

func agentBlueprintMarketplaceState(blueprint gact.AgentBlueprintDefinition) string {
	if agentBlueprintSourceKey(blueprint) == "" {
		return ""
	}
	install := agentBlueprintInstallMetadata(blueprint)
	if firstNonEmpty(stringValue(install["installed_at"]), stringValue(install["status"]), stringValue(install["last_sync"]), stringValue(install["last_synced_at"]), stringValue(install["synced_at"])) != "" {
		return "installed"
	}
	switch strings.ToLower(strings.TrimSpace(firstNonEmpty(stringValue(install["scope"]), blueprint.Scope))) {
	case "workspace", "global", "session", "user":
		return "installed"
	default:
		return "available"
	}
}

func expertPackDetailItems(detail gact.ExpertPackDetail) []catalogItem {
	pack := detail.ExpertPack
	activation := catalogItem{
		id:        "activate",
		title:     "Activate for current session",
		desc:      sessionActivationDescription("expert pack"),
		statusTag: "session",
	}
	if reason := expertPackActivationBlockReason(pack); reason != "" {
		activation.title = "Activation blocked"
		activation.desc = reason + " · " + sessionActivationDescription("expert pack")
		activation.statusTag = "blocked"
		activation.disabled = true
	}
	items := []catalogItem{activation, {
		id:        "pack/" + pack.ID,
		title:     "Workflow pack · " + firstNonEmpty(pack.Title, pack.ID),
		desc:      formatExpertPackSummary(pack, detail.Agents),
		statusTag: firstNonEmpty(pack.Scope, "pack"),
	}}
	items = append(items, catalogItem{
		id:        "expert-pack-action/update",
		title:     "Update pack",
		desc:      "refresh this installed workflow pack from its recorded source",
		statusTag: "write",
	}, catalogItem{
		id:        "expert-pack-action/delete",
		title:     "Delete pack",
		desc:      "remove this installed workflow pack from the workspace registry",
		statusTag: "delete",
	})
	if len(pack.ValidationErrors) > 0 {
		items = append(items, catalogItem{
			id: "validation", title: "Validation errors", desc: strings.Join(pack.ValidationErrors, "; "), statusTag: "error",
		})
	}
	for _, agentItem := range hierarchicalAgentCatalogItems(detail.Agents, detail.Agents) {
		agentID := strings.TrimPrefix(agentItem.id, "agent/")
		agentItem.id = "agent/" + agentID
		items = append(items, agentItem)
	}
	return items
}

func agentBlueprintDetailItems(detail gact.AgentBlueprintDetail) []catalogItem {
	blueprint := detail.AgentBlueprint
	activation := catalogItem{
		id:        "activate",
		title:     "Activate for current session",
		desc:      sessionActivationDescription("markdown agent blueprint"),
		statusTag: "session",
	}
	if reason := agentBlueprintActivationBlockReason(blueprint); reason != "" {
		activation.desc = reason + " · " + activation.desc
		activation.statusTag = "blocked"
		activation.disabled = true
	}
	summary := catalogItem{
		id:         "blueprint/" + blueprint.ID,
		title:      "Blueprint · " + firstNonEmpty(blueprint.Title, blueprint.ID),
		desc:       formatAgentBlueprintSummary(blueprint),
		inlineDesc: agentBlueprintDetailInlineSummary(blueprint),
		statusTag:  firstNonEmpty(blueprint.Scope, "blueprint"),
	}
	items := []catalogItem{}
	if len(blueprint.ValidationErrors) > 0 {
		items = append(items, catalogItem{id: "validation", title: "Check · Validation errors", desc: strings.Join(displayValidationErrors(blueprint.ValidationErrors), "; "), statusTag: "error"})
	}
	if len(blueprint.ValidationWarnings) > 0 {
		items = append(items, catalogItem{id: "validation-warnings", title: "Check · Validation warnings", desc: strings.Join(blueprint.ValidationWarnings, "; "), statusTag: "warning"})
	}
	items = append(items, activation, summary)
	manageable := blueprint.Scope == "workspace" || blueprint.Scope == "global"
	items = append(items, catalogItem{
		id:        "blueprint-action/update",
		title:     "Update installed blueprint",
		desc:      agentBlueprintLifecycleActionDescription(blueprint, "update", manageable),
		statusTag: "manage",
		disabled:  !manageable,
	}, catalogItem{
		id:        "blueprint-action/delete",
		title:     "Delete installed blueprint",
		desc:      agentBlueprintLifecycleActionDescription(blueprint, "delete", manageable),
		statusTag: "delete",
		disabled:  !manageable,
	})
	for _, descriptor := range detail.MCPDescriptors {
		id := stringValue(descriptor["id"])
		title := firstNonEmpty(stringValue(descriptor["name"]), id)
		status := firstNonEmpty(stringValue(descriptor["status"]), "mcp")
		if errors := stringListFromAny(descriptor["validation_errors"]); len(errors) > 0 {
			status = "invalid"
		}
		items = append(items, catalogItem{
			id:         "mcp/" + id,
			title:      "Integration · MCP · " + title,
			desc:       agentBlueprintMCPDescription(descriptor),
			inlineDesc: agentBlueprintMCPInlineSummary(descriptor),
			statusTag:  status,
		})
	}
	for _, descriptor := range detail.HookDescriptors {
		id := stringValue(descriptor["id"])
		title := firstNonEmpty(stringValue(descriptor["title"]), stringValue(descriptor["name"]), id)
		status := firstNonEmpty(stringValue(descriptor["status"]), "hook")
		if errors := stringListFromAny(descriptor["validation_errors"]); len(errors) > 0 {
			status = "invalid"
		}
		items = append(items, catalogItem{
			id:         "hook/" + id,
			title:      "Automation · Hook · " + title,
			desc:       agentBlueprintHookDescription(descriptor),
			inlineDesc: agentBlueprintHookInlineSummary(descriptor),
			statusTag:  status,
		})
	}
	for _, agentItem := range agentCatalogItems(detail.Agents, catalogKindAgents) {
		agentID := strings.TrimPrefix(agentItem.id, "agent/")
		agentItem.id = "agent/" + agentID
		agentItem.title = agentBlueprintExpertTitle(agentItem.title)
		items = append(items, agentItem)
	}
	return items
}

func agentBlueprintExpertTitle(title string) string {
	title = strings.TrimRight(title, " ")
	prefixLen := len(title) - len(strings.TrimLeft(title, " "))
	prefix := title[:prefixLen]
	trimmed := strings.TrimLeft(title, " ")
	if strings.HasPrefix(trimmed, "└─ ") {
		label := strings.TrimSpace(strings.TrimPrefix(trimmed, "└─ "))
		label = stripAgentHierarchyRolePrefix(label)
		return prefix + "└─ Expert · " + label
	}
	return "Expert · " + stripAgentHierarchyRolePrefix(strings.TrimSpace(title))
}

func stripAgentHierarchyRolePrefix(title string) string {
	for _, prefix := range []string{"Root expert · ", "Expert · "} {
		title = strings.TrimPrefix(title, prefix)
	}
	return strings.TrimSpace(title)
}

func agentBlueprintActivationBlockReason(blueprint gact.AgentBlueprintDefinition) string {
	if len(blueprint.ValidationErrors) > 0 {
		return "cannot activate until validation errors are resolved"
	}
	if !blueprint.Enabled {
		return "cannot activate because this blueprint is disabled"
	}
	if strings.TrimSpace(blueprint.RootExpert) == "" {
		return "cannot activate until a root expert is defined"
	}
	return ""
}

func expertPackActivationBlockReason(pack gact.ExpertPackDefinition) string {
	if len(pack.ValidationErrors) > 0 {
		return "cannot activate until validation errors are resolved"
	}
	if !pack.Enabled {
		return "cannot activate because this pack is disabled"
	}
	return ""
}

func formatExpertPackSummary(pack gact.ExpertPackDefinition, agents []gact.AgentDef) string {
	activation := "select Activate to use this pack for the current session"
	if reason := expertPackActivationBlockReason(pack); reason != "" {
		activation = reason
	}
	rows := appendDetailSection(nil, "Operator summary",
		detailField{"workflow", firstNonEmpty(pack.Description, firstNonEmpty(pack.Title, pack.ID))},
		detailField{"status", expertPackStatusText(pack)},
		detailField{"activation", activation},
		detailField{"session scope", sessionDefaultDescription()},
		detailField{"experts", fmt.Sprintf("%d", len(agents))},
		detailField{"tools", expertPackToolsSummary(agents)},
	)
	rows = appendDetailSection(rows, "Workflow pack identity",
		detailField{"id", pack.ID},
		detailField{"title", pack.Title},
		detailField{"version", pack.Version},
		detailField{"scope", pack.Scope},
		detailField{"enabled", fmt.Sprintf("%t", pack.Enabled)},
	)
	sourceFields := []detailField{
		{"root", pack.Root},
		{"definition", pack.DefinitionPath},
	}
	if install := mapValue(pack.Metadata["install"]); len(install) > 0 {
		sourceFields = append(sourceFields,
			detailField{"source", firstNonEmpty(stringValue(install["source"]), stringValue(install["url"]), stringValue(install["path"]))},
			detailField{"source kind", stringValue(install["source_kind"])},
			detailField{"ref", stringValue(install["ref"])},
			detailField{"commit", stringValue(install["commit"])},
			detailField{"last synced", firstNonEmpty(stringValue(install["last_synced_at"]), stringValue(install["synced_at"]))},
			detailField{"trust", stringValue(install["trust"])},
		)
	}
	rows = appendDetailSection(rows, "Source evidence", sourceFields...)
	if len(pack.ValidationErrors) > 0 {
		rows = appendDetailSection(rows, "Validation", detailField{"errors", strings.Join(displayValidationErrors(pack.ValidationErrors), "\n")})
	}
	if len(pack.Defaults) > 0 {
		if payload, err := json.MarshalIndent(pack.Defaults, "", "  "); err == nil {
			rows = appendDetailSection(rows, "Defaults", detailField{"", string(payload)})
		}
	}
	if len(pack.Metadata) > 0 {
		if payload, err := json.MarshalIndent(pack.Metadata, "", "  "); err == nil {
			rows = appendDetailSection(rows, "Metadata", detailField{"", string(payload)})
		}
	}
	if pack.Description != "" {
		rows = appendDetailSection(rows, "Description", detailField{"", pack.Description})
	}
	return strings.Join(rows, "\n")
}

func expertPackToolsSummary(agents []gact.AgentDef) string {
	seen := map[string]bool{}
	tools := []string{}
	for _, agent := range agents {
		for _, tool := range agent.Tools {
			if tool == "" || seen[tool] {
				continue
			}
			seen[tool] = true
			tools = append(tools, tool)
		}
	}
	sort.Strings(tools)
	if len(tools) == 0 {
		return "none declared"
	}
	if len(tools) > 4 {
		return strings.Join(tools[:4], ", ") + fmt.Sprintf(", +%d more", len(tools)-4)
	}
	return strings.Join(tools, ", ")
}

func expertPackStatusText(pack gact.ExpertPackDefinition) string {
	if len(pack.ValidationErrors) > 0 {
		return "invalid"
	}
	if !pack.Enabled {
		return "disabled"
	}
	return "ready"
}

func sessionActivationDescription(runtime string) string {
	return "sets this " + runtime + " only for the current selected session; " + sessionDefaultDescription()
}

func sessionDefaultDescription() string {
	return "new sessions keep the workspace default"
}

func agentBlueprintMCPDescription(descriptor map[string]any) string {
	fields := make([]detailField, 0, 16)
	if command := stringValue(descriptor["command"]); command != "" {
		fields = append(fields, detailField{"command", command})
	}
	if args := stringListFromAny(descriptor["args"]); len(args) > 0 {
		fields = append(fields, detailField{"command args", strings.Join(args, " ")})
	}
	if enabled := scalarText(descriptor["enabled"]); enabled != "" {
		fields = append(fields, detailField{"activation", enabledStateLabel(enabled)})
	}
	for _, key := range []string{"transport", "url", "source_blueprint_id", "server_id"} {
		fields = appendDescriptorMetadataFields(fields, key, descriptor[key])
	}
	for _, key := range []string{"runtime", "install", "trust", "env_policy", "verification"} {
		fields = appendDescriptorMetadataFields(fields, key, descriptor[key])
	}
	rows := appendDetailSection(nil, "Connection setup", fields...)
	if warnings := stringListFromAny(descriptor["validation_warnings"]); len(warnings) > 0 {
		rows = appendDetailSection(rows, "Warnings", detailField{"", strings.Join(warnings, "\n")})
	}
	if errors := stringListFromAny(descriptor["validation_errors"]); len(errors) > 0 {
		rows = appendDetailSection(rows, "Errors", detailField{"", strings.Join(errors, "\n")})
	}
	return strings.Join(rows, "\n")
}

func agentBlueprintMCPInlineSummary(descriptor map[string]any) string {
	parts := make([]string, 0, 6)
	if command := stringValue(descriptor["command"]); command != "" {
		parts = append(parts, command)
	}
	if enabled := scalarText(descriptor["enabled"]); enabled != "" {
		parts = append(parts, enabledStateLabel(enabled))
	}
	if transport := firstNonEmpty(stringValue(descriptor["transport"]), stringValue(mapValue(descriptor["runtime"])["transport"])); transport != "" {
		parts = append(parts, transport)
	}
	if serverID := firstNonEmpty(stringValue(descriptor["server_id"]), stringValue(mapValue(descriptor["runtime"])["server_id"])); serverID != "" {
		parts = append(parts, serverID)
	}
	if len(stringListFromAny(descriptor["validation_errors"])) > 0 {
		parts = append(parts, "errors")
	} else if len(stringListFromAny(descriptor["validation_warnings"])) > 0 {
		parts = append(parts, "warnings")
	}
	return strings.Join(parts, " · ")
}

func appendDescriptorMetadataFields(fields []detailField, key string, value any) []detailField {
	if text := descriptorMetadataValueText(value); text != "" {
		return append(fields, detailField{descriptorMetadataLabel(key, ""), text})
	}
	m := mapValue(value)
	if len(m) == 0 {
		return fields
	}
	keys := make([]string, 0, len(m))
	for subkey := range m {
		if descriptorMetadataValueText(m[subkey]) != "" {
			keys = append(keys, subkey)
		}
	}
	sort.Strings(keys)
	for _, subkey := range keys {
		label := descriptorMetadataLabel(key, subkey)
		fields = append(fields, detailField{label, descriptorMetadataValueText(m[subkey])})
	}
	return fields
}

func enabledStateLabel(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "true", "yes", "on", "enabled":
		return "enabled"
	case "false", "no", "off", "disabled":
		return "disabled"
	default:
		return raw
	}
}

func descriptorMetadataLabel(key, subkey string) string {
	if subkey == "" {
		switch key {
		case "source":
			return "provided by"
		case "env_policy":
			return "environment policy"
		case "source_blueprint_id":
			return "blueprint id"
		case "server_id":
			return "server id"
		default:
			return strings.ReplaceAll(key, "_", " ")
		}
	}
	switch key {
	case "install":
		return "install " + strings.ReplaceAll(subkey, "_", " ")
	case "runtime":
		return "runtime " + strings.ReplaceAll(subkey, "_", " ")
	case "verification":
		return "verification " + strings.ReplaceAll(subkey, "_", " ")
	case "trust":
		switch subkey {
		case "policy":
			return "trust policy"
		case "trusted":
			return "trusted"
		case "source":
			return "trust source"
		}
	case "env_policy":
		switch subkey {
		case "mode", "policy":
			return "environment policy"
		}
		return "environment policy " + strings.ReplaceAll(subkey, "_", " ")
	}
	return strings.ReplaceAll(key+" "+subkey, "_", " ")
}

func descriptorMetadataValueText(value any) string {
	switch v := value.(type) {
	case nil:
		return ""
	case string:
		return strings.TrimSpace(v)
	case []string:
		return strings.Join(v, ", ")
	case []any:
		values := make([]string, 0, len(v))
		for _, item := range v {
			if text := descriptorMetadataValueText(item); text != "" {
				values = append(values, text)
			}
		}
		return strings.Join(values, ", ")
	case map[string]any:
		return ""
	default:
		return strings.TrimSpace(fmt.Sprint(v))
	}
}

func compactJSONDescription(value map[string]any) string {
	if len(value) == 0 {
		return ""
	}
	payload, err := json.Marshal(value)
	if err != nil {
		return ""
	}
	return string(payload)
}

func agentCapabilityRefDescription(ref gact.AgentCapabilityRef) string {
	parts := make([]string, 0, 5)
	if ref.Kind != "" {
		parts = append(parts, "kind: "+ref.Kind)
	}
	if ref.Status != "" {
		parts = append(parts, "status: "+ref.Status)
	}
	if ref.Source != "" {
		parts = append(parts, "source: "+ref.Source)
	}
	if ref.Description != "" {
		parts = append(parts, ref.Description)
	}
	if text := compactJSONDescription(ref.Metadata); text != "" {
		parts = append(parts, "metadata: "+text)
	}
	return strings.Join(parts, " · ")
}

func agentBlueprintHookDescription(descriptor map[string]any) string {
	fields := make([]detailField, 0, 12)
	for _, key := range []string{"event", "source", "scope", "agent_blueprint_id", "definition_path", "installed_path", "checksum"} {
		if value := stringValue(descriptor[key]); value != "" {
			if key == "source" {
				value = operatorSourceValueLabel(value)
			}
			fields = append(fields, detailField{agentBlueprintHookFieldLabel(key), value})
		}
	}
	if trust := mapValue(descriptor["trust"]); len(trust) > 0 {
		if policy := stringValue(trust["policy"]); policy != "" {
			fields = append(fields, detailField{"trust policy", policy})
		}
		if trusted := scalarText(trust["trusted"]); trusted != "" {
			fields = append(fields, detailField{"trusted", trusted})
		}
		if source := stringValue(trust["source"]); source != "" {
			fields = append(fields, detailField{"trust source", source})
		}
	} else if trust := stringValue(descriptor["trust"]); trust != "" {
		fields = append(fields, detailField{"trust", trust})
	}
	if enabled := scalarText(descriptor["enabled"]); enabled != "" {
		fields = append(fields, detailField{"activation", enabledStateLabel(enabled)})
	}
	rows := appendDetailSection(nil, "Automation setup", fields...)
	if warnings := stringListFromAny(descriptor["validation_warnings"]); len(warnings) > 0 {
		rows = appendDetailSection(rows, "Warnings", detailField{"", strings.Join(warnings, "\n")})
	}
	if errors := stringListFromAny(descriptor["validation_errors"]); len(errors) > 0 {
		rows = appendDetailSection(rows, "Errors", detailField{"", strings.Join(errors, "\n")})
	}
	return strings.Join(rows, "\n")
}

func agentBlueprintHookInlineSummary(descriptor map[string]any) string {
	parts := make([]string, 0, 6)
	if event := stringValue(descriptor["event"]); event != "" {
		parts = append(parts, "runs on "+event)
	}
	if enabled := scalarText(descriptor["enabled"]); enabled != "" {
		parts = append(parts, enabledStateLabel(enabled))
	}
	if scope := stringValue(descriptor["scope"]); scope != "" {
		parts = append(parts, scope)
	}
	if source := stringValue(descriptor["source"]); source != "" {
		parts = append(parts, "provided by "+operatorSourceValueLabel(source))
	}
	if len(stringListFromAny(descriptor["validation_errors"])) > 0 {
		parts = append(parts, "errors")
	} else if len(stringListFromAny(descriptor["validation_warnings"])) > 0 {
		parts = append(parts, "warnings")
	}
	return strings.Join(parts, " · ")
}

func operatorSourceValueLabel(source string) string {
	switch strings.ToLower(strings.TrimSpace(source)) {
	case "agent_blueprint":
		return "agent blueprint"
	case "expert_pack":
		return "workflow pack"
	case "builtin":
		return "built-in"
	default:
		return humanizeAgentLabel(source)
	}
}

func agentBlueprintHookFieldLabel(key string) string {
	switch key {
	case "event":
		return "runs on"
	case "source":
		return "provided by"
	case "agent_blueprint_id":
		return "blueprint id"
	case "definition_path":
		return "hook file"
	case "installed_path":
		return "installed file"
	default:
		return strings.ReplaceAll(key, "_", " ")
	}
}

func formatAgentBlueprintSummary(blueprint gact.AgentBlueprintDefinition) string {
	rows := appendDetailSection(nil, "Operator summary",
		detailField{"workflow", firstNonEmpty(blueprint.Description, firstNonEmpty(blueprint.Title, blueprint.ID))},
		detailField{"status", agentBlueprintStatusText(blueprint)},
		detailField{"activation", "select Activate to use this blueprint for the current session"},
		detailField{"session scope", sessionDefaultDescription()},
		detailField{"root expert", blueprint.RootExpert},
	)
	rows = appendDetailSection(rows, "Blueprint identity",
		detailField{"id", blueprint.ID},
		detailField{"title", blueprint.Title},
		detailField{"version", blueprint.Version},
		detailField{"scope", blueprint.Scope},
		detailField{"enabled", fmt.Sprintf("%t", blueprint.Enabled)},
		detailField{"blueprint root", blueprint.Root},
		detailField{"definition file", firstNonEmpty(blueprint.DefinitionPath, blueprint.RootPath)},
	)
	rows = appendAgentBlueprintProvenanceSection(rows, blueprint)
	if len(blueprint.ValidationErrors) > 0 {
		rows = appendDetailSection(rows, "Validation", detailField{"errors", strings.Join(displayValidationErrors(blueprint.ValidationErrors), "\n")})
	}
	if len(blueprint.ValidationWarnings) > 0 {
		rows = appendDetailSection(rows, "Validation warnings", detailField{"warnings", strings.Join(blueprint.ValidationWarnings, "\n")})
	}
	if len(blueprint.Defaults) > 0 {
		if payload, err := json.MarshalIndent(blueprint.Defaults, "", "  "); err == nil {
			rows = appendDetailSection(rows, "Defaults", detailField{"", string(payload)})
		}
	}
	if metadata := agentBlueprintDisplayMetadata(blueprint); len(metadata) > 0 {
		if payload, err := json.MarshalIndent(metadata, "", "  "); err == nil {
			rows = appendDetailSection(rows, "Metadata", detailField{"", string(payload)})
		}
	}
	if blueprint.Description != "" {
		rows = appendDetailSection(rows, "Description", detailField{"", blueprint.Description})
	}
	return strings.Join(rows, "\n")
}

func agentBlueprintStatusText(blueprint gact.AgentBlueprintDefinition) string {
	if len(blueprint.ValidationErrors) > 0 {
		return "invalid"
	}
	if !blueprint.Enabled {
		return "disabled"
	}
	if len(blueprint.ValidationWarnings) > 0 {
		return fmt.Sprintf("ready with %d warning%s", len(blueprint.ValidationWarnings), plural(len(blueprint.ValidationWarnings)))
	}
	return "ready"
}

func agentBlueprintDetailInlineSummary(blueprint gact.AgentBlueprintDefinition) string {
	if len(blueprint.ValidationErrors) > 0 {
		parts := []string{"needs fix: " + displayValidationError(blueprint.ValidationErrors[0])}
		if blueprint.Scope != "" {
			parts = append(parts, blueprint.Scope)
		}
		if blueprint.Version != "" {
			parts = append(parts, "v"+blueprint.Version)
		}
		return strings.Join(parts, " · ")
	}
	parts := []string{agentBlueprintStatusText(blueprint)}
	if root := strings.TrimSpace(blueprint.RootExpert); root != "" {
		parts = append(parts, "root: "+root)
	}
	if summary := agentBlueprintInlineSummary(blueprint); summary != "" && summary != "markdown agent blueprint" {
		parts = append(parts, summary)
	}
	return strings.Join(parts, " · ")
}

func agentBlueprintInstallMetadata(blueprint gact.AgentBlueprintDefinition) map[string]any {
	install := mapValue(blueprint.Metadata["install"])
	if len(install) > 0 {
		return install
	}
	return blueprint.Metadata
}

func agentBlueprintDisplayMetadata(blueprint gact.AgentBlueprintDefinition) map[string]any {
	if len(blueprint.Metadata) == 0 {
		return nil
	}
	out := make(map[string]any, len(blueprint.Metadata))
	for key, value := range blueprint.Metadata {
		if key == "install" {
			continue
		}
		out[key] = value
	}
	return out
}

func agentBlueprintProvenanceLine(blueprint gact.AgentBlueprintDefinition) string {
	install := agentBlueprintInstallMetadata(blueprint)
	parts := make([]string, 0, 5)
	if kind := firstNonEmpty(stringValue(install["source_kind"]), stringValue(install["kind"])); kind != "" {
		parts = append(parts, "source: "+kind)
	}
	if source := firstNonEmpty(stringValue(install["source"]), stringValue(install["url"]), stringValue(install["path"])); source != "" {
		parts = append(parts, "from: "+source)
	}
	if ref := stringValue(install["ref"]); ref != "" {
		parts = append(parts, "ref: "+ref)
	}
	if commit := shortHash(stringValue(install["commit"])); commit != "" {
		parts = append(parts, "commit: "+commit)
	}
	if checksum := shortHash(stringValue(install["checksum"])); checksum != "" {
		parts = append(parts, "checksum: "+checksum)
	}
	return strings.Join(parts, " · ")
}

func appendAgentBlueprintProvenanceSection(rows []string, blueprint gact.AgentBlueprintDefinition) []string {
	install := agentBlueprintInstallMetadata(blueprint)
	if len(install) == 0 {
		return rows
	}
	fields := []detailField{
		{"source url", firstNonEmpty(stringValue(install["source"]), stringValue(install["url"]), stringValue(install["path"]))},
		{"source type", firstNonEmpty(stringValue(install["source_kind"]), stringValue(install["kind"]))},
		{"ref", stringValue(install["ref"])},
		{"commit", stringValue(install["commit"])},
		{"checksum", stringValue(install["checksum"])},
		{"status", stringValue(install["status"])},
		{"status message", firstNonEmpty(stringValue(install["status_message"]), stringValue(install["message"]))},
		{"trust", firstNonEmpty(stringValue(install["trust"]), stringValue(install["trust_policy"]))},
		{"installed", stringValue(install["installed_at"])},
		{"last synced", firstNonEmpty(stringValue(install["last_sync"]), stringValue(install["last_synced_at"]), stringValue(install["synced_at"]))},
		{"installed scope", firstNonEmpty(stringValue(install["scope"]), blueprint.Scope)},
	}
	hasValue := false
	for _, field := range fields {
		if strings.TrimSpace(field.value) != "" {
			hasValue = true
			break
		}
	}
	if !hasValue {
		return rows
	}
	rows = appendDetailSection(rows, "Source provenance", fields...)
	warnings := appendUniqueStrings(nil, stringListFromAny(install["warnings"])...)
	warnings = appendUniqueStrings(warnings, stringListFromAny(install["validation_warnings"])...)
	if len(warnings) > 0 {
		rows = appendDetailSection(rows, "Source warnings", detailField{"warnings", strings.Join(warnings, "\n")})
	}
	errors := appendUniqueStrings(nil, stringListFromAny(install["errors"])...)
	errors = appendUniqueStrings(errors, stringListFromAny(install["validation_errors"])...)
	if errText := firstNonEmpty(stringValue(install["error"]), stringValue(install["last_error"])); errText != "" {
		errors = appendUniqueStrings(errors, errText)
	}
	if len(errors) > 0 {
		rows = appendDetailSection(rows, "Source errors", detailField{"errors", strings.Join(errors, "\n")})
	}
	return rows
}

func agentBlueprintLifecycleActionDescription(blueprint gact.AgentBlueprintDefinition, action string, manageable bool) string {
	install := agentBlueprintInstallMetadata(blueprint)
	fields := make([]string, 0, 6)
	if !manageable {
		fields = append(fields, "protected scope: "+firstNonEmpty(blueprint.Scope, "unknown"))
	} else if action == "update" {
		fields = append(fields, "refresh this installed blueprint through CLIO")
	} else {
		fields = append(fields, "remove this installed blueprint through CLIO")
	}
	if source := firstNonEmpty(stringValue(install["source"]), stringValue(install["url"]), stringValue(install["path"])); source != "" {
		fields = append(fields, "source: "+source)
	}
	if status := stringValue(install["status"]); status != "" {
		fields = append(fields, "status: "+status)
	}
	if message := firstNonEmpty(stringValue(install["status_message"]), stringValue(install["message"])); message != "" {
		fields = append(fields, "status message: "+message)
	}
	if syncedAt := firstNonEmpty(stringValue(install["last_sync"]), stringValue(install["last_synced_at"]), stringValue(install["synced_at"])); syncedAt != "" {
		fields = append(fields, "last synced: "+syncedAt)
	}
	if trust := firstNonEmpty(stringValue(install["trust"]), stringValue(install["trust_policy"])); trust != "" {
		fields = append(fields, "trust: "+trust)
	}
	if len(fields) == 0 {
		return "lifecycle action"
	}
	return strings.Join(fields, " · ")
}

func shortHash(value string) string {
	value = strings.TrimSpace(value)
	if len(value) > 12 {
		return value[:12]
	}
	return value
}

func appendUniqueStrings(values []string, extra ...string) []string {
	seen := make(map[string]bool, len(values)+len(extra))
	for _, value := range values {
		seen[value] = true
	}
	for _, value := range extra {
		value = strings.TrimSpace(value)
		if value == "" || seen[value] {
			continue
		}
		values = append(values, value)
		seen[value] = true
	}
	return values
}

func stringListFromAny(value any) []string {
	switch v := value.(type) {
	case []string:
		return v
	case []any:
		out := make([]string, 0, len(v))
		for _, item := range v {
			if s := stringValue(item); s != "" {
				out = append(out, s)
			}
		}
		return out
	default:
		return nil
	}
}

func formatResolvedPrompt(p gact.ResolvedPrompt) string {
	summary := []detailField{
		{"id", p.ID},
		{"profile", p.Profile},
		{"scope", p.Scope},
		{"status", promptResolutionStatus(p)},
	}
	if p.FallbackProfile != "" {
		summary = append(summary, detailField{"fallback profile", p.FallbackProfile})
	}
	if p.Provider != "" {
		summary = append(summary, detailField{"provider", p.Provider})
	}
	if p.Model != "" {
		summary = append(summary, detailField{"model", p.Model})
	}
	if p.Checksum != "" {
		summary = append(summary, detailField{"checksum", p.Checksum})
	}
	if p.SourcePath != "" {
		summary = append(summary, detailField{"source", p.SourcePath})
	}
	rows := appendDetailSection(nil, "Resolution", summary...)
	rows = appendDetailSection(rows, "Operator paths",
		detailField{"render preview", "inspect the runtime prompt with session and workspace substitutions applied"},
		detailField{"validate", "check an edited profile before using it in a session"},
		detailField{"customize", "edit a profile or save the current profile as a codex override"},
	)
	if p.Description != "" {
		rows = appendDetailSection(rows, "Description", detailField{"", p.Description})
	}
	if len(p.ValidationErrors) > 0 {
		rows = appendDetailSection(rows, "Validation", detailField{"errors", strings.Join(p.ValidationErrors, "\n")})
	}
	if len(p.Metadata) > 0 {
		if payload, err := json.MarshalIndent(p.Metadata, "", "  "); err == nil {
			rows = appendDetailSection(rows, "Metadata", detailField{"", string(payload)})
		}
	}
	rows = appendDetailSection(rows, "Text", detailField{"", p.Text})
	return strings.Join(rows, "\n")
}

func promptResolutionStatus(p gact.ResolvedPrompt) string {
	if len(p.ValidationErrors) > 0 {
		return fmt.Sprintf("invalid · %d error%s", len(p.ValidationErrors), plural(len(p.ValidationErrors)))
	}
	if p.FallbackProfile != "" {
		return "fallback profile used"
	}
	return "ready"
}

func formatRenderedPrompt(p gact.ResolvedPrompt) string {
	rows := appendDetailSection(nil, "Rendered body", detailField{"", p.Text})
	rows = appendDetailSection(rows, "Operator context",
		detailField{"prompt", p.ID},
		detailField{"profile", p.Profile},
		detailField{"scope", p.Scope},
		detailField{"provider", p.Provider},
		detailField{"model", p.Model},
	)
	if p.FallbackProfile != "" {
		rows = append(rows, detailFieldRows("fallback profile", p.FallbackProfile)...)
	}
	rows = appendDetailSection(rows, "Technical provenance",
		detailField{"source file", p.SourcePath},
		detailField{"checksum", p.Checksum},
	)
	if len(p.ValidationErrors) > 0 {
		rows = appendDetailSection(rows, "Validation", detailField{"errors", strings.Join(p.ValidationErrors, "\n")})
	}
	if len(p.Metadata) > 0 {
		rows = appendPromptMetadataSection(rows, "Render provenance", p.Metadata)
	}
	return strings.Join(rows, "\n")
}

func appendPromptMetadataSection(rows []string, title string, metadata map[string]any) []string {
	fields := make([]detailField, 0, len(metadata))
	for _, key := range sortedPromptMetadataKeys(metadata) {
		if promptMetadataHidden(key, metadata[key]) {
			continue
		}
		value := promptMetadataValue(metadata[key])
		if strings.TrimSpace(value) == "" || strings.TrimSpace(value) == `""` {
			continue
		}
		fields = append(fields, detailField{promptMetadataLabel(key), value})
	}
	if len(fields) == 0 {
		return rows
	}
	return appendDetailSection(rows, title, fields...)
}

func promptMetadataHidden(key string, value any) bool {
	switch key {
	case "rendered":
		if b, ok := value.(bool); ok && b {
			return true
		}
		if strings.EqualFold(strings.TrimSpace(fmt.Sprint(value)), "true") {
			return true
		}
	}
	return false
}

func promptMetadataLabel(key string) string {
	switch key {
	case "agent_id":
		return "agent"
	case "behavior_profile":
		return "behavior profile"
	case "blueprint_id":
		return "blueprint"
	case "prompt_family":
		return "prompt family"
	case "prompt_id":
		return "prompt"
	case "prompt_profile":
		return "prompt profile"
	case "session_id":
		return "session"
	case "workspace_id":
		return "workspace"
	default:
		return strings.ReplaceAll(key, "_", " ")
	}
}

func sortedPromptMetadataKeys(metadata map[string]any) []string {
	keys := make([]string, 0, len(metadata))
	for key := range metadata {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func promptMetadataValue(value any) string {
	if text := scalarText(value); text != "" {
		return text
	}
	if payload, err := json.MarshalIndent(value, "", "  "); err == nil {
		return string(payload)
	}
	return fmt.Sprint(value)
}

func formatPromptValidation(result gact.PromptValidationResult) string {
	status := "valid"
	if !result.Enabled || len(result.ValidationErrors) > 0 {
		status = "invalid"
	}
	rows := appendDetailSection(nil, "Validation",
		detailField{"status", status},
		detailField{"enabled", fmt.Sprintf("%t", result.Enabled)},
		detailField{"prompt", result.Prompt.ID},
		detailField{"scope", result.Prompt.Scope},
		detailField{"source file", result.Prompt.SourcePath},
	)
	if len(result.ValidationErrors) > 0 {
		rows = appendDetailSection(rows, "Errors", detailField{"", strings.Join(result.ValidationErrors, "\n")})
	}
	return strings.Join(rows, "\n")
}

func formatPromptReload(result gact.PromptReloadResult) string {
	rows := appendDetailSection(nil, "Reload",
		detailField{"prompts loaded", fmt.Sprintf("%d", result.PromptCount)},
		detailField{"prompt ids", strings.Join(result.PromptIDs, ", ")},
	)
	for _, source := range result.Sources {
		label := firstNonEmpty(source.Scope, "source")
		rows = append(rows, detailFieldRows(label, source.Root)...)
	}
	if len(result.Metadata) > 0 {
		if payload, err := json.MarshalIndent(result.Metadata, "", "  "); err == nil {
			rows = appendDetailSection(rows, "Metadata", detailField{"", string(payload)})
		}
	}
	return strings.Join(rows, "\n")
}

func stringFromMetadata(metadata map[string]any, key string) string {
	if len(metadata) == 0 {
		return ""
	}
	if value, ok := metadata[key].(string); ok {
		return strings.TrimSpace(value)
	}
	return ""
}

func mapFromMetadata(metadata map[string]any, key string) map[string]any {
	if len(metadata) == 0 {
		return nil
	}
	if value, ok := metadata[key].(map[string]any); ok {
		return value
	}
	return nil
}

func agentPromptResolutionDescription(agent gact.AgentDef) string {
	res := mapFromMetadata(agent.Metadata, "prompt_resolution")
	parts := make([]string, 0, 6)
	if res != nil {
		for _, key := range []string{"id", "profile", "scope", "status", "provider", "model"} {
			if value := strings.TrimSpace(fmt.Sprint(res[key])); value != "" && value != "<nil>" {
				parts = append(parts, promptResolutionLabel(key)+": "+value)
			}
		}
		if fallback := strings.TrimSpace(fmt.Sprint(res["fallback_profile"])); fallback != "" && fallback != "<nil>" {
			parts = append(parts, "fallback profile: "+fallback)
		}
	}
	if len(parts) == 0 {
		promptID := firstNonEmpty(agent.PromptID, stringFromMetadata(agent.Metadata, "prompt_id"), stringFromMetadata(agent.Metadata, "prompt"))
		profile := firstNonEmpty(agent.PromptProfile, stringFromMetadata(agent.Metadata, "prompt_profile"))
		if promptID != "" {
			parts = append(parts, "prompt: "+promptID)
		}
		if profile != "" {
			parts = append(parts, "profile: "+profile)
		}
	}
	return strings.Join(parts, " · ")
}

func promptResolutionLabel(key string) string {
	switch key {
	case "id":
		return "prompt"
	case "scope":
		return "scope"
	default:
		return key
	}
}

func agentParentID(agent gact.AgentDef) string {
	if agent.ParentID != "" {
		return agent.ParentID
	}
	if parent := stringFromMetadata(agent.Metadata, "parent"); parent != "" {
		return parent
	}
	return stringFromMetadata(agent.Metadata, "parent_id")
}

func agentCatalogItems(agents []gact.AgentDef, kind catalogBrowserKind) []catalogItem {
	filtered := make([]gact.AgentDef, 0, len(agents))
	for _, agent := range agents {
		if kind == catalogKindSkills && agent.Source != "skill" {
			continue
		}
		if kind == catalogKindAgents && agent.Source == "skill" {
			continue
		}
		filtered = append(filtered, agent)
	}
	if kind != catalogKindAgents {
		items := make([]catalogItem, 0, len(filtered))
		for _, agent := range filtered {
			items = append(items, agentCatalogItem(agent, agents, 0))
		}
		return items
	}

	return hierarchicalAgentCatalogItems(filtered, agents)
}

func hierarchicalAgentCatalogItems(filtered []gact.AgentDef, allAgents []gact.AgentDef) []catalogItem {
	byParent := map[string][]gact.AgentDef{}
	topLevel := make([]gact.AgentDef, 0)
	for _, agent := range filtered {
		parent := agentParentID(agent)
		if parent == "" {
			topLevel = append(topLevel, agent)
			continue
		}
		byParent[parent] = append(byParent[parent], agent)
	}
	sortAgentsForCatalog(topLevel)
	for parent := range byParent {
		sortAgentsForCatalog(byParent[parent])
	}

	items := make([]catalogItem, 0, len(filtered))
	seen := map[string]bool{}
	var appendAgent func(gact.AgentDef, int)
	appendAgent = func(agent gact.AgentDef, depth int) {
		if seen[agent.ID] {
			return
		}
		seen[agent.ID] = true
		items = append(items, agentCatalogHierarchyItem(agent, allAgents, depth))
		for _, child := range byParent[agent.ID] {
			appendAgent(child, depth+1)
		}
	}
	for _, agent := range topLevel {
		appendAgent(agent, 0)
	}
	for _, agent := range filtered {
		appendAgent(agent, 0)
	}
	return items
}

func agentCatalogHierarchyItem(agent gact.AgentDef, allAgents []gact.AgentDef, depth int) catalogItem {
	item := agentCatalogItem(agent, allAgents, depth)
	item.title = agentHierarchyTitle(item.title, depth)
	return item
}

func agentHierarchyTitle(title string, depth int) string {
	prefixLen := len(title) - len(strings.TrimLeft(title, " "))
	prefix := title[:prefixLen]
	trimmed := strings.TrimLeft(title, " ")
	if strings.HasPrefix(trimmed, "└─ ") {
		return prefix + "└─ Expert · " + strings.TrimSpace(strings.TrimPrefix(trimmed, "└─ "))
	}
	if depth <= 0 {
		return "Root expert · " + strings.TrimSpace(title)
	}
	return prefix + "Expert · " + strings.TrimSpace(trimmed)
}

func agentCatalogItem(agent gact.AgentDef, allAgents []gact.AgentDef, depth int) catalogItem {
	title := operatorAgentTitle(agent)
	if depth > 0 {
		title = strings.Repeat("  ", min(depth, 3)) + "└─ " + title
	}
	status := firstNonEmpty(agent.Source, "agent")
	if !agent.Enabled || len(agent.ValidationErrors) > 0 {
		status = "invalid"
	} else if len(agent.ValidationWarnings) > 0 {
		status = "warning"
	} else if agent.Source == "skill" && len(agent.Tools) > 0 {
		status = pluralizeCount(len(agent.Tools), "tool")
	} else {
		status = operatorSourceValueLabel(status)
	}
	return catalogItem{
		id:         agent.ID,
		title:      title,
		desc:       agentCatalogDescription(agent, allAgents),
		inlineDesc: agentCatalogInlineSummary(agent, allAgents),
		statusTag:  status,
	}
}

func agentCatalogInlineSummary(agent gact.AgentDef, allAgents []gact.AgentDef) string {
	parts := make([]string, 0, 5)
	if agent.Source == "skill" {
		if desc := compactCatalogText(agent.Description); desc != "" {
			parts = append(parts, desc)
		}
	}
	if agent.Specialization != "" {
		parts = append(parts, humanizeAgentLabel(agent.Specialization))
	} else if agent.Tier > 0 {
		parts = append(parts, "level "+itoa2(agent.Tier))
	}
	if parent := agentParentID(agent); parent != "" {
		parts = append(parts, "reports to "+agentTitleByID(allAgents, parent))
	}
	if len(agent.Tools) > 0 {
		parts = append(parts, pluralizeCount(len(agent.Tools), "tool"))
	}
	if len(agent.Skills) > 0 {
		parts = append(parts, pluralizeCount(len(agent.Skills), "skill"))
	}
	if len(agent.Commands) > 0 {
		parts = append(parts, pluralizeCount(len(agent.Commands), "command"))
	}
	if len(agent.ValidationErrors) > 0 {
		parts = append(parts, pluralizeCount(len(agent.ValidationErrors), "error"))
	} else if len(agent.ValidationWarnings) > 0 {
		parts = append(parts, pluralizeCount(len(agent.ValidationWarnings), "warning"))
	}
	if len(parts) == 0 {
		if desc := compactCatalogText(agent.Description); desc != "" {
			parts = append(parts, desc)
		}
	}
	return truncate(strings.Join(parts, " · "), 96)
}

func humanizeAgentLabel(label string) string {
	label = strings.TrimSpace(label)
	label = strings.ReplaceAll(label, "_", " ")
	label = strings.ReplaceAll(label, "-", " ")
	return strings.Join(strings.Fields(label), " ")
}

func operatorAgentTitle(agent gact.AgentDef) string {
	title := strings.TrimSpace(firstNonEmpty(agent.Title, agent.ID))
	for _, suffix := range []string{" Agent", " agent"} {
		if strings.HasSuffix(title, suffix) {
			stem := strings.TrimSpace(strings.TrimSuffix(title, suffix))
			if stem != "" {
				return stem + " Expert"
			}
		}
	}
	if strings.EqualFold(title, "agent") {
		return "Expert"
	}
	return title
}

func agentCatalogDescription(agent gact.AgentDef, allAgents []gact.AgentDef) string {
	parts := make([]string, 0, 6)
	if agent.Tier > 0 {
		parts = append(parts, "level "+itoa2(agent.Tier))
	}
	if agent.Specialization != "" {
		parts = append(parts, "role "+agent.Specialization)
	}
	if parent := agentParentID(agent); parent != "" {
		parts = append(parts, "reports to "+agentTitleByID(allAgents, parent))
	}
	if routes := stringListFromMetadata(agent.Metadata, "routes_to"); len(routes) > 0 {
		parts = append(parts, "routes: "+strings.Join(routes, ", "))
	}
	if delegates := stringListFromMetadata(agent.Metadata, "delegates_to"); len(delegates) > 0 {
		parts = append(parts, "delegates: "+strings.Join(delegates, ", "))
	}
	if len(agent.Tools) > 0 {
		toolSummary := strings.Join(agent.Tools, ", ")
		if len(agent.Tools) > 3 {
			toolSummary = strings.Join(agent.Tools[:3], ", ") + fmt.Sprintf(", +%d", len(agent.Tools)-3)
		}
		parts = append(parts, "can use: "+toolSummary)
	}
	if len(agent.Skills) > 0 {
		skillSummary := strings.Join(agent.Skills, ", ")
		if len(agent.Skills) > 3 {
			skillSummary = strings.Join(agent.Skills[:3], ", ") + fmt.Sprintf(", +%d", len(agent.Skills)-3)
		}
		parts = append(parts, "skills: "+skillSummary)
	}
	if len(agent.Commands) > 0 {
		commandSummary := strings.Join(agent.Commands, ", ")
		if len(agent.Commands) > 3 {
			commandSummary = strings.Join(agent.Commands[:3], ", ") + fmt.Sprintf(", +%d", len(agent.Commands)-3)
		}
		parts = append(parts, "commands exposed: "+commandSummary)
	}
	if len(agent.ValidationErrors) > 0 {
		parts = append(parts, "errors: "+strings.Join(agent.ValidationErrors, "; "))
	}
	if len(agent.ValidationWarnings) > 0 {
		parts = append(parts, "warnings: "+strings.Join(agent.ValidationWarnings, "; "))
	}
	if agent.DefaultModel != nil && agent.DefaultModel.ModelID != "" {
		parts = append(parts, "model: "+agent.DefaultModel.ModelID)
	} else if firstNonEmpty(agent.DefaultModelName, agent.DefaultProvider) != "" {
		parts = append(parts, "model: "+firstNonEmpty(agent.DefaultModelName, agent.DefaultProvider))
	}
	if desc := compactCatalogText(agent.Description); desc != "" {
		parts = append(parts, desc)
	}
	return strings.Join(parts, " · ")
}

func sortAgentsForCatalog(agents []gact.AgentDef) {
	sort.SliceStable(agents, func(i, j int) bool {
		if agents[i].Tier != agents[j].Tier {
			if agents[i].Tier == 0 {
				return false
			}
			if agents[j].Tier == 0 {
				return true
			}
			return agents[i].Tier < agents[j].Tier
		}
		return firstNonEmpty(agents[i].Title, agents[i].ID) < firstNonEmpty(agents[j].Title, agents[j].ID)
	})
}

func compactCatalogText(text string) string {
	return strings.Join(strings.Fields(text), " ")
}

func childAgentsOf(agents []gact.AgentDef, parentID string) []gact.AgentDef {
	out := make([]gact.AgentDef, 0)
	for _, agent := range agents {
		if agent.ID == parentID {
			continue
		}
		if agentParentID(agent) == parentID {
			out = append(out, agent)
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		return firstNonEmpty(out[i].Title, out[i].ID) < firstNonEmpty(out[j].Title, out[j].ID)
	})
	return out
}

func agentTitleByID(agents []gact.AgentDef, id string) string {
	for _, agent := range agents {
		if agent.ID == id {
			return operatorAgentTitle(agent)
		}
	}
	return id
}

func agentModelText(agent gact.AgentDef) string {
	if agent.DefaultModel == nil && agent.DefaultProvider == "" && agent.DefaultModelName == "" {
		return "backend/session default"
	}
	parts := make([]string, 0, 3)
	if agent.DefaultProvider != "" {
		parts = append(parts, "provider: "+agent.DefaultProvider)
	}
	if agent.DefaultModelName != "" {
		parts = append(parts, "model: "+agent.DefaultModelName)
	}
	if agent.DefaultModel == nil {
		return strings.Join(parts, " · ")
	}
	if agent.DefaultModel.ProviderID != "" {
		parts = append(parts, "provider: "+agent.DefaultModel.ProviderID)
	}
	if agent.DefaultModel.ModelID != "" {
		parts = append(parts, "model: "+agent.DefaultModel.ModelID)
	}
	if agent.DefaultModel.Variant != "" {
		parts = append(parts, "variant: "+agent.DefaultModel.Variant)
	}
	if len(parts) == 0 {
		return "backend/session default"
	}
	return strings.Join(parts, " · ")
}

func toolsForAgent(agent gact.AgentDef, tools []gact.Tool) []gact.Tool {
	declared := map[string]bool{}
	for _, toolID := range agent.Tools {
		declared[toolID] = true
	}
	out := make([]gact.Tool, 0)
	seen := map[string]bool{}
	for _, tool := range tools {
		toolID := firstNonEmpty(tool.ID, tool.Name)
		if toolID == "" || seen[toolID] {
			continue
		}
		if declared[toolID] || stringInSlice(tool.VisibleTo, agent.ID) {
			out = append(out, tool)
			seen[toolID] = true
		}
	}
	if len(out) == 0 && len(declared) > 0 {
		for _, toolID := range agent.Tools {
			if toolID != "" && !seen[toolID] {
				out = append(out, gact.Tool{ID: toolID, Name: toolID})
				seen[toolID] = true
			}
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		return firstNonEmpty(out[i].Name, out[i].ID) < firstNonEmpty(out[j].Name, out[j].ID)
	})
	return out
}

func toolSummary(tool gact.Tool) string {
	parts := make([]string, 0, 4)
	if desc := strings.TrimSpace(tool.Description); desc != "" && !toolDescriptionRepeatsName(desc, tool) {
		parts = append(parts, desc)
	}
	if tool.ServerID != "" {
		parts = append(parts, "connection: "+tool.ServerID)
	}
	if len(tool.Tags) > 0 {
		parts = append(parts, "tagged: "+strings.Join(tool.Tags, ", "))
	}
	if len(tool.VisibleTo) > 0 {
		parts = append(parts, "available to: "+strings.Join(tool.VisibleTo, ", "))
	}
	return strings.Join(parts, " · ")
}

func mcpDetailToolSummary(tool gact.Tool) string {
	if desc := strings.TrimSpace(tool.Description); desc != "" && !toolDescriptionRepeatsName(desc, tool) {
		return desc
	}
	if len(tool.Tags) > 0 {
		return "tags: " + strings.Join(tool.Tags, ", ")
	}
	return ""
}

func toolCatalogItems(tools []gact.Tool, servers []gact.McpServer) []catalogItem {
	sort.SliceStable(tools, func(i, j int) bool {
		if normalizedToolSource(tools[i]) != normalizedToolSource(tools[j]) {
			return normalizedToolSource(tools[i]) < normalizedToolSource(tools[j])
		}
		if tools[i].ServerID != tools[j].ServerID {
			return tools[i].ServerID < tools[j].ServerID
		}
		return firstNonEmpty(tools[i].Name, tools[i].ID) < firstNonEmpty(tools[j].Name, tools[j].ID)
	})
	serverByID := make(map[string]gact.McpServer, len(servers))
	for _, server := range servers {
		if server.ID != "" {
			serverByID[server.ID] = server
		}
	}
	mcpCounts := map[string]int{}
	for _, tool := range tools {
		if normalizedToolSource(tool) == "mcp" && tool.ServerID != "" {
			mcpCounts[tool.ServerID]++
		}
	}
	mcpSeen := map[string]int{}
	sourceCounts := map[string]int{}
	for _, tool := range tools {
		src := normalizedToolSource(tool)
		if src == "mcp" && tool.ServerID != "" {
			continue
		}
		sourceCounts[src]++
	}
	sourceSeen := map[string]int{}
	items := make([]catalogItem, 0, len(tools)+len(mcpCounts)+len(sourceCounts))
	for _, tool := range tools {
		src := normalizedToolSource(tool)
		if src == "mcp" && tool.ServerID != "" {
			if mcpSeen[tool.ServerID] == 0 {
				server, ok := serverByID[tool.ServerID]
				title := toolCatalogSourceRowTitle(tool.ServerID, "MCP connection")
				status := "mcp"
				desc := fmt.Sprintf("%d callable tool%s from this connection", mcpCounts[tool.ServerID], plural(mcpCounts[tool.ServerID]))
				inlineDesc := desc
				if ok {
					title = toolCatalogSourceRowTitle(firstNonEmpty(server.Name, server.ID), "MCP connection")
					status = mcpConnectionStatusTag(server)
					desc = mcpServerCatalogDescription(server)
					inlineDesc = mcpSourceInlineSummary(server, mcpCounts[tool.ServerID])
				}
				items = append(items, catalogItem{
					id:         "mcpserver/" + tool.ServerID,
					title:      title,
					desc:       desc,
					inlineDesc: inlineDesc,
					statusTag:  status,
				})
			}
			mcpSeen[tool.ServerID]++
		} else if sourceSeen[src] == 0 {
			items = append(items, catalogItem{
				id:         "toolsource/" + catalogToolSourceID(src),
				title:      toolCatalogSourceRowTitleForSource(src),
				desc:       toolCatalogSourceDescription(src, sourceCounts[src]),
				inlineDesc: pluralizeCount(sourceCounts[src], "tool"),
			})
		}
		sourceSeen[src]++
		status := src
		if tool.ServerID != "" {
			status = tool.ServerID
		}
		title := toolCatalogRowTitle(tool)
		if src == "mcp" && tool.ServerID != "" {
			title = treePrefix(mcpSeen[tool.ServerID]-1, mcpCounts[tool.ServerID]) + title
			status = "mcp"
		} else {
			title = treePrefix(sourceSeen[src]-1, sourceCounts[src]) + title
		}
		items = append(items, catalogItem{
			id:         firstNonEmpty(tool.ID, tool.Name),
			title:      title,
			desc:       toolCatalogDescription(tool),
			inlineDesc: toolCatalogInlineSummary(tool),
			statusTag:  status,
		})
	}
	for _, server := range servers {
		if server.ID == "" || mcpSeen[server.ID] > 0 {
			continue
		}
		items = append(items, catalogItem{
			id:         "mcpserver/" + server.ID,
			title:      toolCatalogSourceRowTitle(firstNonEmpty(server.Name, server.ID), "MCP connection"),
			desc:       mcpServerCatalogDescription(server),
			inlineDesc: mcpSourceInlineSummary(server, 0),
			statusTag:  mcpConnectionStatusTag(server),
		})
	}
	return items
}

func catalogToolSourceID(source string) string {
	source = strings.ToLower(strings.TrimSpace(source))
	if source == "" {
		return "unknown"
	}
	source = strings.NewReplacer("/", "-", "\\", "-", " ", "-", "_", "-").Replace(source)
	return source
}

func toolCatalogSourceLabel(source string) string {
	switch normalizedToolSource(gact.Tool{Source: source}) {
	case "builtin":
		return "Built-in"
	case "recipe":
		return "Recipes"
	case "extension":
		return "Extensions"
	case "mcp":
		return "MCP"
	case "":
		return "Unknown"
	default:
		return humanizeAgentLabel(source)
	}
}

func toolCatalogSourceDescription(source string, count int) string {
	label := toolCatalogSourceLabel(source)
	switch normalizedToolSource(gact.Tool{Source: source}) {
	case "recipe", "extension":
		return fmt.Sprintf("%s provide %s.", label, pluralizeCount(count, "tool"))
	default:
		return fmt.Sprintf("%s provides %s.", label, pluralizeCount(count, "tool"))
	}
}

func toolCatalogRowTitle(tool gact.Tool) string {
	name := firstNonEmpty(tool.Name, tool.ID)
	switch normalizedToolSource(tool) {
	case "builtin":
		return toolCatalogToolRowTitle(name, "built-in")
	case "recipe":
		return toolCatalogToolRowTitle(name, "recipe")
	case "extension":
		return toolCatalogToolRowTitle(name, "extension")
	case "mcp":
		return toolCatalogToolRowTitle(name, firstNonEmpty(tool.ServerID, "MCP"))
	default:
		source := strings.TrimSpace(normalizedToolSource(tool))
		if source == "" {
			return toolCatalogToolRowTitle(name, "unknown")
		}
		return toolCatalogToolRowTitle(name, source)
	}
}

func toolCatalogSourceRowTitle(name, kind string) string {
	label := firstNonEmpty(kind, "source")
	return label + " · " + firstNonEmpty(name, "unknown")
}

func toolCatalogSourceRowTitleForSource(source string) string {
	switch normalizedToolSource(gact.Tool{Source: source}) {
	case "builtin":
		return "Built-in tools"
	case "recipe":
		return "Recipe tools"
	case "extension":
		return "Extension tools"
	case "":
		return "Unknown tools"
	default:
		return humanizeAgentLabel(source) + " tools"
	}
}

func toolCatalogToolRowTitle(name, origin string) string {
	return firstNonEmpty(name, "unknown")
}

func normalizedToolSource(tool gact.Tool) string {
	return firstNonEmpty(tool.Source, "builtin")
}

func mcpConnectionStatusTag(server gact.McpServer) string {
	if server.Status == "ready" || server.Status == "connected" {
		return "connected"
	}
	if server.Status != "" {
		return "disconnected"
	}
	return "mcp"
}

func annotateMcpServersWithHandshake(servers []gact.McpServer, handshake client.McpHandshakeResponse) []gact.McpServer {
	if len(servers) == 0 || len(handshake.Servers) == 0 {
		return servers
	}
	byName := map[string]client.McpHandshakeServer{}
	for _, live := range handshake.Servers {
		for _, key := range []string{live.Name, strings.ToLower(live.Name)} {
			key = strings.TrimSpace(key)
			if key != "" {
				byName[key] = live
			}
		}
	}
	out := append([]gact.McpServer(nil), servers...)
	for i := range out {
		live, ok := byName[out[i].ID]
		if !ok {
			live, ok = byName[out[i].Name]
		}
		if !ok {
			live, ok = byName[strings.ToLower(out[i].ID)]
		}
		if !ok {
			live, ok = byName[strings.ToLower(out[i].Name)]
		}
		if !ok {
			continue
		}
		if live.State != "" {
			out[i].Status = live.State
		} else if live.Reachable {
			out[i].Status = "ready"
		} else {
			out[i].Status = "error"
		}
		if !live.Reachable && strings.TrimSpace(live.Error) != "" {
			out[i].LastError = strings.TrimSpace(live.Error)
		}
		if out[i].ServerInfo == nil {
			out[i].ServerInfo = map[string]any{}
		}
		out[i].ServerInfo["live_reachable"] = live.Reachable
		out[i].ServerInfo["live_tools_count"] = live.ToolsCount
		if live.LatencyMS > 0 {
			out[i].ServerInfo["live_latency_ms"] = live.LatencyMS
		}
	}
	return out
}

func mcpSourceInlineSummary(server gact.McpServer, toolCount int) string {
	parts := make([]string, 0, 5)
	if server.Status != "" {
		status := server.Status
		if status == "error" {
			status = "disconnected"
		}
		parts = append(parts, status)
	}
	if live, ok := server.ServerInfo["live_reachable"].(bool); ok {
		if live {
			parts = append(parts, "live")
		} else {
			parts = append(parts, "unreachable")
		}
	}
	parts = append(parts, mcpCapabilityCountLabels(server.DeclaredCapabilities, toolCount)...)
	if server.LastError != "" {
		parts = append(parts, "repair needed")
	}
	if len(parts) == 0 {
		return "MCP connection"
	}
	return strings.Join(parts, " · ")
}

func mcpCapabilityCountLabels(cap gact.McpCapabilities, toolCount int) []string {
	labels := make([]string, 0, 4)
	if toolCount > 0 {
		labels = append(labels, fmt.Sprintf("%d tool%s", toolCount, plural(toolCount)))
	} else if cap.Tools {
		labels = append(labels, "tools")
	}
	if cap.Resources != nil {
		labels = append(labels, "resources")
	}
	if cap.Prompts != nil {
		labels = append(labels, "prompts")
	}
	if cap.Logging && len(labels) == 0 {
		labels = append(labels, "logging")
	}
	return labels
}

func toolCatalogInlineSummary(tool gact.Tool) string {
	parts := toolCatalogMetadata(tool)
	return truncate(strings.Join(parts, " · "), 88)
}

func toolCatalogDescription(tool gact.Tool) string {
	parts := toolCatalogMetadata(tool)
	return truncate(strings.Join(parts, " · "), 88)
}

func toolCatalogMetadata(tool gact.Tool) []string {
	parts := make([]string, 0, 6)
	if tool.Owner != "" {
		parts = append(parts, "owned by "+tool.Owner)
	}
	if tool.PermissionDefault != "" {
		parts = append(parts, toolPermissionLabel(tool.PermissionDefault))
	}
	if fields := schemaFieldNames(tool.InputSchema, 2); len(fields) > 0 {
		parts = append(parts, "needs "+strings.Join(fields, ", "))
	}
	if len(tool.Tags) > 0 {
		parts = append(parts, "tagged "+strings.Join(limitStrings(tool.Tags, 1), ", "))
	}
	if len(parts) == 0 {
		if desc := toolPurposeSummary(tool); desc != "" {
			parts = append(parts, desc)
		}
	}
	return parts
}

func toolPermissionLabel(permission string) string {
	switch strings.ToLower(strings.TrimSpace(permission)) {
	case "ask", "prompt", "confirm":
		return "asks first"
	case "allow", "allowed", "auto", "always":
		return "runs directly"
	case "deny", "denied", "disabled", "never":
		return "blocked by default"
	case "":
		return ""
	default:
		return "permission " + permission
	}
}

func toolPurposeSummary(tool gact.Tool) string {
	desc := strings.TrimSpace(tool.Description)
	if desc == "" || toolDescriptionRepeatsName(desc, tool) {
		return ""
	}
	for _, marker := range []string{"\n\n", "\nAgent story:", "Agent story:"} {
		if idx := strings.Index(desc, marker); idx >= 0 {
			desc = strings.TrimSpace(desc[:idx])
		}
	}
	return compactCatalogText(desc)
}

func schemaFieldNames(schema map[string]any, limit int) []string {
	if limit < 1 {
		limit = 1
	}
	props, ok := schema["properties"].(map[string]any)
	if !ok || len(props) == 0 {
		return nil
	}
	names := sortedAnyMapKeys(props)
	if len(names) <= limit {
		return names
	}
	out := append([]string(nil), names[:limit]...)
	out = append(out, fmt.Sprintf("+%d more", len(names)-limit))
	return out
}

func limitStrings(values []string, limit int) []string {
	if limit < 1 || len(values) <= limit {
		return values
	}
	out := append([]string(nil), values[:limit]...)
	out = append(out, fmt.Sprintf("+%d more", len(values)-limit))
	return out
}

func toolDescriptionRepeatsName(desc string, tool gact.Tool) bool {
	normalizedDesc := normalizeCatalogComparable(desc)
	for _, candidate := range []string{tool.ID, tool.Name, tool.Title} {
		if normalizedDesc != "" && normalizedDesc == normalizeCatalogComparable(candidate) {
			return true
		}
	}
	return false
}

func normalizeCatalogComparable(text string) string {
	text = strings.TrimSpace(strings.ToLower(text))
	text = strings.Trim(text, "`'\". ")
	return strings.Join(strings.Fields(text), " ")
}

func mcpServersForTools(tools []gact.Tool) []string {
	seen := map[string]bool{}
	out := make([]string, 0)
	for _, tool := range tools {
		serverID := strings.TrimSpace(tool.ServerID)
		if serverID == "" || seen[serverID] {
			continue
		}
		seen[serverID] = true
		out = append(out, serverID)
	}
	sort.Strings(out)
	return out
}

func stringInSlice(values []string, needle string) bool {
	for _, value := range values {
		if value == needle {
			return true
		}
	}
	return false
}

func formatToolDetail(tool gact.Tool) string {
	return formatToolDetailWithAgents(tool, nil)
}

func formatToolDetailWithAgents(tool gact.Tool, agents []gact.AgentDef) string {
	summary := []detailField{
		{"name", firstNonEmpty(tool.Name, tool.ID)},
		{"comes from", toolProviderLabel(tool)},
	}
	if tool.ServerID != "" {
		summary = append(summary, detailField{"connection", tool.ServerID})
	}
	if tool.Owner != "" {
		summary = append(summary, detailField{"workflow area", tool.Owner})
	}
	if tool.PermissionDefault != "" {
		summary = append(summary, detailField{"approval needed", tool.PermissionDefault})
	}
	if tool.ID != "" && tool.ID != tool.Name {
		summary = append(summary, detailField{"technical id", tool.ID})
	}
	rows := appendDetailSection(nil, "Operator summary", summary...)

	availability := make([]detailField, 0, 3)
	if len(tool.VisibleTo) > 0 {
		availability = append(availability, detailField{"available to", strings.Join(tool.VisibleTo, ", ")})
	}
	if len(tool.Tags) > 0 {
		availability = append(availability, detailField{"tagged", strings.Join(tool.Tags, ", ")})
	}
	if owners := owningAgentsForTool(tool, agents); len(owners) > 0 {
		ownerRows := make([]string, 0, len(owners))
		for _, owner := range owners {
			ownerRows = append(ownerRows, "- "+owner)
		}
		availability = append(availability, detailField{"used by", strings.Join(ownerRows, "\n") + "\n"})
	}
	if len(availability) > 0 {
		rows = appendDetailSection(rows, "Availability", availability...)
	}

	if desc := strings.TrimSpace(tool.Description); desc != "" {
		rows = appendDetailSection(rows, "Description", detailField{"", desc})
	}
	rows = appendSchemaSection(rows, "Inputs", tool.InputSchema)
	rows = appendSchemaSection(rows, "Outputs", tool.OutputSchema)
	rows = appendToolAnnotationsSection(rows, tool.Annotations)
	return strings.Join(rows, "\n")
}

func toolProviderLabel(tool gact.Tool) string {
	source := strings.TrimSpace(tool.Source)
	switch source {
	case "builtin":
		return "built-in"
	case "mcp":
		if tool.ServerID != "" {
			return "MCP"
		}
		return "MCP connection"
	case "":
		return "unknown"
	default:
		return source
	}
}

func appendToolAnnotationsSection(rows []string, annotations *gact.ToolAnnotations) []string {
	if annotations == nil {
		return rows
	}
	fields := make([]detailField, 0, 2)
	if title := strings.TrimSpace(annotations.Title); title != "" {
		fields = append(fields, detailField{"label", title})
	}
	hints := make([]string, 0, 4)
	if annotations.ReadOnlyHint {
		hints = append(hints, "read-only")
	}
	if annotations.DestructiveHint {
		hints = append(hints, "destructive")
	}
	if annotations.IdempotentHint {
		hints = append(hints, "idempotent")
	}
	if annotations.OpenWorldHint {
		hints = append(hints, "open-world")
	}
	hintText := "none supplied"
	if len(hints) > 0 {
		hintText = strings.Join(hints, ", ")
	}
	fields = append(fields, detailField{"hints", hintText})
	return appendDetailSection(rows, "Safety", fields...)
}

func owningAgentsForTool(tool gact.Tool, agents []gact.AgentDef) []string {
	toolIDs := map[string]bool{}
	for _, id := range []string{tool.ID, tool.Name, tool.Title} {
		id = strings.TrimSpace(id)
		if id != "" {
			toolIDs[id] = true
		}
	}
	visible := map[string]bool{}
	for _, id := range tool.VisibleTo {
		id = strings.TrimSpace(id)
		if id != "" {
			visible[id] = true
		}
	}
	owners := make([]string, 0)
	seen := map[string]bool{}
	for _, agent := range agents {
		if agent.ID == "" {
			continue
		}
		usesTool := visible[agent.ID]
		for _, declared := range agent.Tools {
			if toolIDs[strings.TrimSpace(declared)] {
				usesTool = true
				break
			}
		}
		if !usesTool {
			continue
		}
		label := operatorAgentTitle(agent)
		if agent.Specialization != "" {
			label += " · " + agent.Specialization
		} else if agent.Tier > 0 {
			label += " · tier " + itoa2(agent.Tier)
		}
		if !seen[label] {
			seen[label] = true
			owners = append(owners, label)
		}
	}
	sort.Strings(owners)
	return owners
}

func appendJSONMapSection(rows []string, label string, payload map[string]any) []string {
	if len(payload) == 0 {
		return rows
	}
	if body, err := json.MarshalIndent(payload, "", "  "); err == nil {
		return append(rows, "", label+":", string(body))
	}
	return append(rows, "", label+":", fmt.Sprint(payload))
}

func appendSchemaSection(rows []string, label string, payload map[string]any) []string {
	if len(payload) == 0 {
		return rows
	}
	summary := summarizeJSONSchema(payload)
	if len(summary) == 0 {
		return appendJSONMapSection(rows, label, payload)
	}
	return appendDetailSection(rows, label, detailField{"", strings.Join(summary, "\n")})
}

func summarizeJSONSchema(schema map[string]any) []string {
	rows := make([]string, 0, 8)
	schemaType := jsonSchemaType(schema)
	if schemaType != "" {
		rows = append(rows, "type: "+schemaType)
	}
	required := requiredFieldSet(schema["required"])
	if len(required) > 0 {
		rows = append(rows, "required: "+strings.Join(sortedMapKeys(required), ", "))
	}
	if disabledAdditionalProperties(schema["additionalProperties"]) {
		rows = append(rows, "additional_properties: disabled")
	}

	props, ok := schema["properties"].(map[string]any)
	if !ok || len(props) == 0 {
		if desc := strings.TrimSpace(stringFromAny(schema["description"])); desc != "" {
			rows = append(rows, "description: "+truncate(desc, 120))
		}
		if enum := schemaEnumSummary(schema["enum"]); enum != "" {
			rows = append(rows, "enum: "+enum)
		}
		return rows
	}

	rows = append(rows, "fields:")
	for _, name := range sortedAnyMapKeys(props) {
		prop, _ := props[name].(map[string]any)
		rows = append(rows, "- "+name+" — "+jsonSchemaPropertySummary(prop, required[name]))
	}
	return rows
}

func jsonSchemaPropertySummary(prop map[string]any, required bool) string {
	parts := make([]string, 0, 5)
	typ := jsonSchemaType(prop)
	if typ == "" {
		typ = "value"
	}
	parts = append(parts, typ)
	if required {
		parts = append(parts, "required")
	}
	if nested, ok := prop["properties"].(map[string]any); ok && len(nested) > 0 {
		parts = append(parts, "fields: "+strings.Join(sortedAnyMapKeys(nested), ", "))
	}
	if items, ok := prop["items"].(map[string]any); ok {
		if itemType := jsonSchemaType(items); itemType != "" {
			parts = append(parts, "items: "+itemType)
		}
	}
	if enum := schemaEnumSummary(prop["enum"]); enum != "" {
		parts = append(parts, "enum: "+enum)
	}
	if desc := strings.TrimSpace(stringFromAny(prop["description"])); desc != "" {
		parts = append(parts, truncate(desc, 96))
	}
	return strings.Join(parts, " · ")
}

func jsonSchemaType(schema map[string]any) string {
	if schema == nil {
		return ""
	}
	switch v := schema["type"].(type) {
	case string:
		return strings.TrimSpace(v)
	case []any:
		types := make([]string, 0, len(v))
		for _, item := range v {
			if s := strings.TrimSpace(stringFromAny(item)); s != "" {
				types = append(types, s)
			}
		}
		return strings.Join(types, " | ")
	case []string:
		return strings.Join(v, " | ")
	default:
		return ""
	}
}

func requiredFieldSet(value any) map[string]bool {
	out := map[string]bool{}
	switch v := value.(type) {
	case []any:
		for _, item := range v {
			if s := strings.TrimSpace(stringFromAny(item)); s != "" {
				out[s] = true
			}
		}
	case []string:
		for _, item := range v {
			if s := strings.TrimSpace(item); s != "" {
				out[s] = true
			}
		}
	}
	return out
}

func disabledAdditionalProperties(value any) bool {
	v, ok := value.(bool)
	return ok && !v
}

func sortedMapKeys(values map[string]bool) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func sortedAnyMapKeys(values map[string]any) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func schemaEnumSummary(value any) string {
	var values []string
	switch v := value.(type) {
	case []any:
		values = make([]string, 0, len(v))
		for _, item := range v {
			values = append(values, stringFromAny(item))
		}
	case []string:
		values = append(values, v...)
	}
	if len(values) == 0 {
		return ""
	}
	for i, value := range values {
		values[i] = truncate(value, 28)
	}
	if len(values) > 5 {
		return strings.Join(values[:5], ", ") + fmt.Sprintf(" (+%d more)", len(values)-5)
	}
	return strings.Join(values, ", ")
}

func stringFromAny(value any) string {
	switch v := value.(type) {
	case string:
		return v
	case fmt.Stringer:
		return v.String()
	case nil:
		return ""
	default:
		return fmt.Sprint(v)
	}
}

func formatMcpResourceContents(contents []gact.McpContent) string {
	if len(contents) == 0 {
		return "(resource returned no content)"
	}
	rows := make([]string, 0, len(contents)*5)
	for i, content := range contents {
		title := content.URI
		if title == "" {
			title = fmt.Sprintf("content[%d]", i)
		}
		fields := []detailField{{"uri", title}}
		fields = append(fields, detailField{"media type", content.MimeType})
		if content.Text != "" {
			fields = append(fields, detailField{"text", content.Text})
		}
		if content.Data != "" {
			fields = append(fields, detailField{"base64 data", fmt.Sprintf("%d bytes encoded", len(content.Data))})
		}
		rows = appendDetailSection(rows, "Resource content", fields...)
	}
	return strings.Join(rows, "\n")
}
