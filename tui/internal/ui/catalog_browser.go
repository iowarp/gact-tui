// Catalog-browser modal (L5). Used by the /mcp, /tools, /agents, and
// /skills slash commands to open a scoped list of items from the
// corresponding catalog endpoint. /agents-list shows a browseable
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
	mcpServerID  string
	agentID      string
	promptID     string
	expertPackID string
	blueprintID  string
	parent       *catalogBrowserState
}

// catalogItem is the common shape we flatten each backend response into
// for uniform rendering. Backends return typed structs; we translate on
// the loaded message to keep viewCatalogBrowser kind-agnostic.
type catalogItem struct {
	id        string
	title     string
	desc      string
	statusTag string // e.g. "connected" / "disconnected" for MCP
	disabled  bool
}

// catalogBrowserLoadedMsg delivers the fetch result.
type catalogBrowserLoadedMsg struct {
	kind    catalogBrowserKind
	items   []catalogItem
	errText string
	// mcpServerID echoes the server context for catalogKindMcpDetail
	// loads — protects against late-arriving messages overwriting a
	// browser the user has since navigated back from.
	mcpServerID  string
	promptID     string
	expertPackID string
	blueprintID  string
}

func (a *App) applyCapabilityGatesToCatalogItems(kind catalogBrowserKind, items []catalogItem) []catalogItem {
	out := append([]catalogItem(nil), items...)
	for i := range out {
		switch {
		case kind == catalogKindAgents && out[i].id == "action/create-agent":
			out[i].disabled = !a.caps.Capabilities.AgentWrite
			if out[i].disabled {
				out[i].desc = "backend does not advertise agent_write"
			}
		case kind == catalogKindAgents && out[i].id == "action/extract-agent":
			out[i].disabled = !a.caps.Capabilities.SkillsExtraction
			if out[i].disabled {
				out[i].desc = "backend does not advertise skills_extraction"
			}
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
			items := make([]catalogItem, 0, len(servers))
			for _, s := range servers {
				// McpServer.Status covers connecting|ready|error|
				// disconnected. Simplify to connected vs not for the
				// modal's status tag so the glance interpretation is
				// unambiguous.
				status := "disconnected"
				if s.Status == "ready" || s.Status == "connected" {
					status = "connected"
				}
				// Title already shows the server name; description is just
				// the transport so each row reads as a single line plus a
				// muted transport hint (was repeating the name twice).
				items = append(items, catalogItem{
					id: s.ID, title: s.Name, desc: s.Transport, statusTag: status,
				})
			}
			return catalogBrowserLoadedMsg{kind: kind, items: items}
		case catalogKindTools:
			// HHHHH1: unified view. /v1/tools already returns tools
			// from every source (built-in + each MCP server), but the
			// previous loader hid that — the user said "tools and mcps
			// were meant to be the same menu, not a separation". Now
			// each row is tagged with its source ("builtin", "mcp",
			// "recipe", "extension"); MCP-sourced tools also carry
			// the server id in the description so it's clear which
			// MCP exposes them. Sort by (source, name) so MCP tools
			// cluster together but the row stays scannable.
			tools, err := c.ListTools(ctx)
			if err != nil {
				return catalogBrowserLoadedMsg{kind: kind, errText: err.Error()}
			}
			sort.SliceStable(tools, func(i, j int) bool {
				if tools[i].Source != tools[j].Source {
					return tools[i].Source < tools[j].Source
				}
				return tools[i].Name < tools[j].Name
			})
			items := make([]catalogItem, 0, len(tools))
			for _, tl := range tools {
				src := tl.Source
				if src == "" {
					src = "builtin"
				}
				status := src
				if tl.ServerID != "" {
					status = tl.ServerID
				}
				items = append(items, catalogItem{
					id: tl.Name, title: tl.Name, desc: toolCatalogDescription(tl), statusTag: status,
				})
			}
			return catalogBrowserLoadedMsg{kind: kind, items: items}
		case catalogKindAgents, catalogKindSkills:
			// Per SPEC §6.5 line 807: skills *are* agents with
			// source="skill" — no dedicated namespace. Both verbs
			// hit /v1/agents; skills filter to source=skill, agents
			// shows everything.
			agents, err := c.ListAgentsScoped(ctx, scope)
			if err != nil {
				return catalogBrowserLoadedMsg{kind: kind, errText: err.Error()}
			}
			items := agentCatalogItems(agents, kind)
			if kind == catalogKindAgents {
				actions := []catalogItem{{
					id:        "action/create-agent",
					title:     "Create user agent",
					desc:      "create a minimal user-owned agent definition",
					statusTag: "write",
				}}
				if scope.SessionID != "" {
					actions = append(actions, catalogItem{
						id:        "action/extract-agent",
						title:     "Extract agent from current session",
						desc:      "derive a user agent from observed prompts and tool usage",
						statusTag: "session",
					})
				}
				items = append(actions, items...)
			}
			if len(items) == 0 && kind == catalogKindSkills {
				items = append(items, catalogItem{
					id:    "none",
					title: "(no skills on this backend)",
					desc:  "skills are agents with source=skill",
				})
			}
			return catalogBrowserLoadedMsg{kind: kind, items: items}
		case catalogKindPrompts:
			prompts, err := c.ListPromptsScoped(ctx, scope)
			if err != nil {
				return catalogBrowserLoadedMsg{kind: kind, errText: err.Error()}
			}
			items := promptCatalogItems(prompts)
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
			actions := []catalogItem{{
				id:        "action/install-blueprint",
				title:     "Install agent blueprint",
				desc:      "install a local path, git URL, or marketplace source into this workspace",
				statusTag: "write",
			}, {
				id:        "action/validate-blueprint",
				title:     "Validate agent blueprint",
				desc:      "preview parsed agents, MCP descriptors, and validation errors before installing",
				statusTag: "check",
			}, {
				id:        "action/source-registry",
				title:     "Marketplace sources",
				desc:      agentBlueprintSourceRegistryUnavailableDetail(),
				statusTag: "backend gap",
			}}
			items := append(actions, agentBlueprintCatalogItems(blueprints)...)
			return catalogBrowserLoadedMsg{kind: kind, items: items}
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

func (a *App) openPromptDetail(promptID, promptTitle string) tea.Cmd {
	parent := a.catalogBrowser
	title := firstNonEmpty(promptTitle, promptID)
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
	a.catalogBrowser = &catalogBrowserState{
		kind:        catalogKindMcpDetail,
		title:       "MCP · " + serverName,
		loading:     true,
		mcpServerID: serverID,
		parent:      parent,
	}
	return loadMcpDetailCmd(a.c, a.runtimeScope(), serverID)
}

func (a *App) openAgentDetail(agentID, agentTitle string) tea.Cmd {
	parent := a.catalogBrowser
	title := agentTitle
	if title == "" {
		title = agentID
	}
	a.catalogBrowser = &catalogBrowserState{
		kind:    catalogKindAgentDetail,
		title:   "Agent · " + title,
		loading: true,
		agentID: agentID,
		parent:  parent,
	}
	return loadAgentDetailCmd(a.c, agentID, a.runtimeScope())
}

// loadMcpDetailCmd fetches tools, resources, and prompts for one MCP
// server in parallel and merges them into a single list with type
// prefixes (`[tool]` / `[res]` / `[prompt]`). Failures per slice are
// surfaced inline rather than aborting — partial data is still useful.
func loadMcpDetailCmd(c *client.Client, scope client.RuntimeScope, serverID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		var items []catalogItem
		var errs []string
		agents, _ := c.ListAgentsScoped(ctx, scope)

		items = append(items, catalogItem{
			id:        "mcp-action/reconnect",
			title:     "Reconnect server",
			desc:      "re-probe this MCP server and surface backend reconnect errors truthfully",
			statusTag: "action",
		})
		if tools, err := c.McpServerTools(ctx, serverID); err != nil {
			errs = append(errs, "tools: "+err.Error())
		} else {
			for _, t := range tools {
				toolID := firstNonEmpty(t.ID, t.Name)
				desc := toolSummary(t)
				if desc == "" {
					desc = t.Description
				}
				if owners := owningAgentsForTool(t, agents); len(owners) > 0 {
					if desc != "" {
						desc += " · "
					}
					desc += "agents: " + strings.Join(owners, ", ")
				}
				items = append(items, catalogItem{
					id: "tool/" + toolID, title: "[tool] " + firstNonEmpty(t.Name, toolID), desc: desc,
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
				}
				items = append(items, catalogItem{
					id: "res/" + r.URI, title: "[res] " + name, desc: desc,
				})
			}
		}
		if ps, err := c.McpServerPrompts(ctx, serverID); err != nil {
			errs = append(errs, "prompts: "+err.Error())
		} else {
			for _, p := range ps {
				items = append(items, catalogItem{
					id: "prompt/" + p.Name, title: "[prompt] " + p.Name, desc: p.Description,
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
			title:     "Agent · " + agent.Title,
			desc:      agent.Description,
			statusTag: agent.Source,
		}}
		items = append(items, catalogItem{
			id:        "agent-action/clone",
			title:     "Clone as user agent",
			desc:      "create an editable user-owned copy without changing the source definition",
			statusTag: "write",
		})
		if agent.Source == "user" {
			items = append(items, catalogItem{
				id:        "agent-action/edit",
				title:     "Edit user agent",
				desc:      "update title, description, prompt, tools, keywords, and enabled state",
				statusTag: "write",
			})
			items = append(items, catalogItem{
				id:        "agent-action/delete",
				title:     "Delete user agent",
				desc:      "remove this user-owned agent through CLIO's permission-guarded delete path",
				statusTag: "delete",
			})
		}
		if parent := agentParentID(agent); parent != "" {
			items = append(items, catalogItem{
				id: "agent/" + parent, title: "Parent agent · " + agentTitleByID(allAgents, parent),
			})
		}
		for _, child := range childAgentsOf(allAgents, agent.ID) {
			items = append(items, catalogItem{
				id: "agent/" + child.ID, title: "Child agent · " + firstNonEmpty(child.Title, child.ID), desc: child.Description, statusTag: child.Source,
			})
		}
		if agent.Specialization != "" {
			items = append(items, catalogItem{
				id: "specialization", title: "Specialization · " + agent.Specialization,
			})
		}
		items = append(items, catalogItem{
			id: "model", title: "Default model", desc: agentModelText(agent),
		})
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
			items = append(items, catalogItem{id: "tools/none", title: "Tools · none declared"})
		} else {
			for _, tool := range visibleTools {
				toolID := firstNonEmpty(tool.ID, tool.Name)
				items = append(items, catalogItem{
					id:        "tool/" + toolID,
					title:     "Tool · " + firstNonEmpty(tool.Name, toolID),
					desc:      toolSummary(tool),
					statusTag: tool.Owner,
				})
			}
			for _, server := range mcpServersForTools(visibleTools) {
				items = append(items, catalogItem{
					id:    "mcpserver/" + server,
					title: "MCP server · " + server,
					desc:  "source server for visible tools",
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

func activateExpertPackCmd(c *client.Client, sessionID, packID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		state, err := c.SetSessionExpertPack(ctx, sessionID, gact.SetSessionExpertPackRequest{PackID: packID})
		return expertPackActivatedMsg{packID: packID, state: state, err: err}
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
			id:        "prompt/" + def.ID,
			title:     "Prompt · " + firstNonEmpty(def.Title, def.ID),
			desc:      def.Description,
			statusTag: firstNonEmpty(def.Scope, "prompt"),
		}}
		defaultProfile := firstNonEmpty(def.DefaultProfile, "default")
		items = append(items,
			catalogItem{
				id:        "render/" + defaultProfile,
				title:     "Rendered runtime preview",
				desc:      "render with current session/workspace context",
				statusTag: defaultProfile,
			},
			catalogItem{
				id:        "validate/" + defaultProfile,
				title:     "Validate prompt",
				desc:      "ask CLIO to validate the current prompt/profile",
				statusTag: defaultProfile,
			},
			catalogItem{
				id:        "reload",
				title:     "Reload prompt registry",
				desc:      "refresh CLIO prompt files and show source diagnostics",
				statusTag: "backend",
			},
		)
		profiles := sortedPromptProfiles(def.Profiles)
		for _, profile := range profiles {
			p := def.Profiles[profile]
			status := firstNonEmpty(p.Scope, def.Scope)
			if profile == def.DefaultProfile {
				status = firstNonEmpty(status, "builtin") + " default"
			}
			items = append(items, catalogItem{
				id:        "profile/" + profile,
				title:     "Profile · " + profile,
				desc:      promptProfileDescription(p),
				statusTag: status,
			})
		}
		if len(def.ValidationErrors) > 0 {
			items = append(items, catalogItem{
				id: "errors", title: "Validation errors", desc: strings.Join(def.ValidationErrors, "; "), statusTag: "error",
			})
		}
		return catalogBrowserLoadedMsg{kind: catalogKindPromptDetail, items: items, promptID: promptID}
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
		return "MCP servers"
	case catalogKindTools:
		return "Tools (built-in + MCP)"
	case catalogKindSkills:
		return "Skills"
	case catalogKindMcpDetail:
		return "MCP detail"
	case catalogKindAgentDetail:
		return "Agent detail"
	case catalogKindAgents:
		return "Agents"
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
	cb.sel = moveSelectionByWheel(cb.sel, len(cb.items), button)
	cb.offset = catalogBrowserClampOffsetForKind(cb.kind, cb.sel, cb.offset, len(cb.items))
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
	switch k.String() {
	case "esc", "ctrl+c":
		// LLL2: in MCP detail, esc pops back to parent server list
		// rather than closing the whole modal — gives back-out
		// affordance without juggling separate keys.
		if catalogBrowserCanPop(cb.kind) && cb.parent != nil {
			a.catalogBrowser = cb.parent
			return a, nil
		}
		a.closeCatalogBrowser()
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
			switch it.id {
			case "action/create-agent":
				a.openAgentWrite(agentWriteModeCreate, "", "new-agent")
				return a, nil
			case "action/extract-agent":
				seed := "extracted-" + strings.TrimPrefix(a.currentSessionID(), "sess_")
				a.openAgentWrite(agentWriteModeExtract, "", seed)
				return a, nil
			}
			return a, a.openAgentDetail(it.id, it.title)
		}
		if cb.kind == catalogKindPrompts && cb.sel >= 0 && cb.sel < len(cb.items) {
			it := cb.items[cb.sel]
			return a, a.openPromptDetail(it.id, it.title)
		}
		if cb.kind == catalogKindExpertPacks && cb.sel >= 0 && cb.sel < len(cb.items) {
			it := cb.items[cb.sel]
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
				a.openCatalogDetail(it.title, it.desc)
				return a, nil
			}
			if strings.HasPrefix(it.id, "source/") {
				a.openCatalogDetail(it.title, it.desc)
				return a, nil
			}
			return a, a.openAgentBlueprintDetail(it.id, it.title)
		}
		if cb.kind == catalogKindTools && cb.sel >= 0 && cb.sel < len(cb.items) {
			it := cb.items[cb.sel]
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
				agentID := a.catalogBrowser.agentID
				a.closeCatalogBrowser()
				return a, deleteAgentCmd(a.c, agentID)
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
				a.closeCatalogBrowser()
				return a, deleteAgentBlueprintCmd(a.c, a.runtimeScope(), cb.blueprintID)
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
			case strings.HasPrefix(it.id, "render/"):
				profile := strings.TrimPrefix(it.id, "render/")
				return a, loadPromptRenderedDetailCmd(a.c, a.runtimeScope(), cb.promptID, profile)
			case strings.HasPrefix(it.id, "validate/"):
				profile := strings.TrimPrefix(it.id, "validate/")
				return a, loadPromptValidationDetailCmd(a.c, a.runtimeScope(), cb.promptID, profile)
			case it.id == "reload":
				return a, loadPromptReloadDetailCmd(a.c, a.runtimeScope())
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
				if sid := a.currentSessionID(); sid != "" && cb.expertPackID != "" {
					return a, activateExpertPackCmd(a.c, sid, cb.expertPackID)
				}
				a.transientHint = "select a session before activating an expert pack"
				return a, scheduleHintExpire(a.transientHint)
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
			a.toggleToolDisabled(id)
		}
	case "s":
		if cb.kind == catalogKindPromptDetail && cb.sel >= 0 && cb.sel < len(cb.items) {
			it := cb.items[cb.sel]
			if strings.HasPrefix(it.id, "profile/") {
				profile := strings.TrimPrefix(it.id, "profile/")
				return a, savePromptProfileCmd(a.c, a.runtimeScope(), cb.promptID, profile, "codex")
			}
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
			a.setNextTurnAgent(cb.agentID, strings.TrimPrefix(cb.title, "Agent · "))
			a.closeCatalogBrowser()
			return a, scheduleHintExpire(a.transientHint)
		}
	case "e":
		if cb.kind == catalogKindPromptDetail && cb.sel >= 0 && cb.sel < len(cb.items) {
			it := cb.items[cb.sel]
			if strings.HasPrefix(it.id, "profile/") {
				profile := strings.TrimPrefix(it.id, "profile/")
				return a, loadPromptEditCmd(a.c, a.runtimeScope(), cb.promptID, profile)
			}
		}
	case "up", "k":
		if cb.sel > 0 {
			cb.sel--
		}
		cb.offset = catalogBrowserClampOffsetForKind(cb.kind, cb.sel, cb.offset, len(cb.items))
	case "down", "j":
		if cb.sel < len(cb.items)-1 {
			cb.sel++
		}
		cb.offset = catalogBrowserClampOffsetForKind(cb.kind, cb.sel, cb.offset, len(cb.items))
	case "i":
		// Install a third-party MCP server. Closes the catalog and
		// opens the small inline install overlay. Only meaningful in
		// the MCP server list view (top-level /mcp).
		if cb.kind == catalogKindMcp {
			a.closeCatalogBrowser()
			a.openMcpInstallModal()
		}
	case "d":
		// Delete the highlighted MCP server. Bundled in_process
		// servers are non-removable; the existing remove flow already
		// filters those out and reports the "no third-party MCPs" toast.
		if cb.kind == catalogKindMcp {
			a.closeCatalogBrowser()
			return a, a.openMcpRemoveModal()
		}
	case "r":
		if cb.kind == catalogKindMcpDetail && cb.mcpServerID != "" {
			return a, mcpReconnectCmd(a.c, cb.mcpServerID)
		}
	}
	return a, nil
}

func catalogBrowserCanPop(kind catalogBrowserKind) bool {
	return kind == catalogKindMcpDetail ||
		kind == catalogKindAgentDetail ||
		kind == catalogKindPromptDetail ||
		kind == catalogKindExpertPackDetail ||
		kind == catalogKindAgentBlueprintDetail
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
		fullText:  text,
	}
	a.detailViewOpen = true
	a.detailScroll = 0
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

const catalogBrowserRowBudget = 12
const catalogBrowserBodyRows = catalogBrowserRowBudget * 2
const catalogBrowserMinBodyRows = 8

func catalogBrowserClampOffset(sel, offset, itemCount int) int {
	return catalogBrowserClampOffsetForBudget(sel, offset, itemCount, catalogBrowserRowBudget)
}

func catalogBrowserClampOffsetForKind(kind catalogBrowserKind, sel, offset, itemCount int) int {
	return catalogBrowserClampOffsetForBudget(sel, offset, itemCount, catalogBrowserVisibleItemBudget(kind))
}

func catalogBrowserVisibleItemBudget(kind catalogBrowserKind) int {
	if kind == catalogKindTools {
		return catalogBrowserBodyRows
	}
	if kind == catalogKindPrompts {
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
	a.catalogBrowser.offset = catalogBrowserClampOffsetForKind(
		a.catalogBrowser.kind,
		a.catalogBrowser.sel,
		a.catalogBrowser.offset,
		len(a.catalogBrowser.items),
	)
	start := a.catalogBrowser.offset
	itemBudget := catalogBrowserVisibleItemBudget(a.catalogBrowser.kind)
	end := min(len(a.catalogBrowser.items), start+itemBudget)
	listItems := make([]modalListItem, 0, end-start)
	for i := start; i < end; i++ {
		item := a.catalogBrowser.items[i]
		// LLL2: dim disabled tools so the user can scan what's off
		// at a glance. Selected highlight still wins so the cursor
		// never disappears on a disabled row.
		isDisabled := item.disabled || (a.catalogBrowser.kind == catalogKindTools &&
			a.disabledTools != nil && a.disabledTools[item.id])
		idx := i
		description := compactCatalogText(item.desc)
		inlineMeta := ""
		if a.catalogBrowser.kind == catalogKindTools {
			inlineMeta = description
			description = ""
		}
		listItems = append(listItems, modalListItem{
			id:          fmt.Sprintf("catalog:item:%d", idx),
			title:       item.title,
			meta:        inlineMeta,
			description: description,
			status:      item.statusTag,
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
				_, cmd := app.handleCatalogBrowserKey(keyMsg("enter"))
				return cmd
			}
		}
	}
	descriptionLines := 2
	if a.catalogBrowser.kind == catalogKindTools {
		descriptionLines = 1
	}
	listW := modalInsetListWidth(w)
	list := a.renderModalList(listItems, modalListOptions{
		width:            listW,
		rowBudget:        catalogBrowserBodyRows,
		descriptionLines: descriptionLines,
	})
	listStartRow := len(rows)
	rows = append(rows, list.rows...)
	end = start + list.renderedItems
	bodyRows := catalogBrowserBodyRowsForContent(len(rows), len(a.catalogBrowser.items), itemBudget)

	// Hint text adapts per kind: tools can open detail or toggle, MCP-server
	// list gets Enter-to-drill, MCP-detail gets Backspace-to-back.
	var hintText string
	switch a.catalogBrowser.kind {
	case catalogKindTools:
		hintText = "↑/↓ navigate · Enter details · Space toggle · Esc close"
	case catalogKindMcp:
		hintText = "↑/↓ navigate · Enter drill in · i install · d delete · Esc close"
	case catalogKindAgents:
		hintText = "↑/↓ navigate · Enter details/create/extract · o use next turn · Esc close"
	case catalogKindMcpDetail:
		hintText = "↑/↓ navigate · Enter details/action · r reconnect · Esc/Backspace back"
	case catalogKindAgentDetail:
		hintText = "↑/↓ navigate · Enter details/clone/delete · o use next turn · Esc/Backspace back"
	case catalogKindPrompts:
		hintText = "↑/↓ navigate · Enter profiles · Esc close"
	case catalogKindPromptDetail:
		hintText = "↑/↓ navigate · Enter text/provenance · e edit · s save codex profile · Esc/Backspace back"
	case catalogKindExpertPacks:
		hintText = "↑/↓ navigate · Enter inspect · Esc close"
	case catalogKindExpertPackDetail:
		hintText = "↑/↓ navigate · Enter details/activate · Esc/Backspace back"
	case catalogKindAgentBlueprints:
		hintText = "↑/↓ navigate · Enter details · Esc close"
	case catalogKindAgentBlueprintDetail:
		hintText = "↑/↓ navigate · Enter activate/detail/enable MCP/hook · Esc/Backspace back"
	default:
		hintText = "↑/↓ navigate · Esc close"
	}
	win := scrollWindow{
		start:  start,
		end:    end,
		scroll: start,
		total:  len(a.catalogBrowser.items),
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
				app.catalogBrowser.sel = clampSelection(index, len(app.catalogBrowser.items))
				app.catalogBrowser.offset = catalogBrowserClampOffsetForKind(app.catalogBrowser.kind, app.catalogBrowser.sel, app.catalogBrowser.offset, len(app.catalogBrowser.items))
			}
			return nil
		},
	})
	return rendered.modal
}

// catalogCommandForID maps a slash-command ID into a browser kind.
// Returns (_, false) for commands that don't open a browser so the
// caller can fall through to the normal RunCommand dispatch.
func catalogCommandForID(id string) (catalogBrowserKind, bool) {
	switch strings.ToLower(id) {
	case "/mcp":
		return catalogKindMcp, true
	case "/tools", "/catalog":
		// HHHHH1: /catalog alias — the unified tool view IS the
		// catalog. Keeps /tools as the canonical name (back-compat
		// with help text + muscle memory) while letting users discover
		// the same view via /catalog.
		return catalogKindTools, true
	case "/skills":
		return catalogKindSkills, true
	case "/agents-list":
		// Distinct from /agents which still routes to Settings (richer
		// picker). LLL3 added this read-only browser route.
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

func promptCatalogItems(prompts []gact.PromptDefinition) []catalogItem {
	sort.SliceStable(prompts, func(i, j int) bool { return prompts[i].ID < prompts[j].ID })
	items := make([]catalogItem, 0, len(prompts))
	for _, p := range prompts {
		items = append(items, catalogItem{
			id:        p.ID,
			title:     firstNonEmpty(p.Title, p.ID),
			desc:      promptDefinitionDescription(p),
			statusTag: firstNonEmpty(p.Scope, "prompt"),
		})
	}
	return items
}

func expertPackCatalogItems(packs []gact.ExpertPackDefinition) []catalogItem {
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
			id:        pack.ID,
			title:     firstNonEmpty(pack.Title, pack.ID),
			desc:      expertPackDescription(pack),
			statusTag: status,
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
	for _, blueprint := range blueprints {
		status := firstNonEmpty(blueprint.Scope, "blueprint")
		if !blueprint.Enabled || len(blueprint.ValidationErrors) > 0 {
			status = "invalid"
		}
		items = append(items, catalogItem{
			id:        blueprint.ID,
			title:     firstNonEmpty(blueprint.Title, blueprint.ID),
			desc:      agentBlueprintDescription(blueprint),
			statusTag: status,
		})
	}
	items = append(items, agentBlueprintSourceCatalogItems(blueprints)...)
	return items
}

type agentBlueprintSourceSummary struct {
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
	warnings    []string
	errors      []string
}

func agentBlueprintSourceCatalogItems(blueprints []gact.AgentBlueprintDefinition) []catalogItem {
	byKey := map[string]*agentBlueprintSourceSummary{}
	for _, blueprint := range blueprints {
		install := agentBlueprintInstallMetadata(blueprint)
		source := firstNonEmpty(stringValue(install["source"]), stringValue(install["url"]), stringValue(install["path"]))
		if source == "" {
			continue
		}
		kind := firstNonEmpty(stringValue(install["source_kind"]), stringValue(install["kind"]), "source")
		ref := stringValue(install["ref"])
		key := strings.Join([]string{kind, source, ref, firstNonEmpty(stringValue(install["scope"]), blueprint.Scope)}, "\x00")
		summary := byKey[key]
		if summary == nil {
			summary = &agentBlueprintSourceSummary{
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
		summary.blueprints = append(summary.blueprints, firstNonEmpty(blueprint.Title, blueprint.ID))
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
	}
	keys := make([]string, 0, len(byKey))
	for key := range byKey {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	items := make([]catalogItem, 0, len(keys))
	for i, key := range keys {
		summary := byKey[key]
		sort.Strings(summary.blueprints)
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

func agentBlueprintSourceRegistryUnavailableDetail() string {
	return strings.Join(appendDetailSection(nil, "Marketplace Source Registry",
		detailField{"status", "unavailable"},
		detailField{"reason", "CLIO does not expose a durable marketplace-source registry API yet"},
		detailField{"available_now", "install, validate, update, delete installed blueprints"},
		detailField{"shown_now", "derived per-blueprint source provenance from metadata.install"},
		detailField{"blocked_operations", "add named source\nlist configured sources\nsync source\nremove source without deleting installed blueprints\ninspect resolved commit/checksum for uninstalled sources"},
	), "\n")
}

func sourceTitle(summary *agentBlueprintSourceSummary) string {
	if summary == nil {
		return "source"
	}
	if summary.kind != "" {
		return summary.kind + " · " + summary.source
	}
	return summary.source
}

func formatAgentBlueprintSourceSummary(summary *agentBlueprintSourceSummary) string {
	if summary == nil {
		return ""
	}
	rows := appendDetailSection(nil, "Marketplace Source",
		detailField{"source", summary.source},
		detailField{"source_kind", summary.kind},
		detailField{"ref", summary.ref},
		detailField{"commit", summary.commit},
		detailField{"checksum", summary.checksum},
		detailField{"status", summary.status},
		detailField{"status_message", summary.statusMsg},
		detailField{"trust", summary.trust},
		detailField{"installed_at", summary.installedAt},
		detailField{"synced_at", summary.syncedAt},
		detailField{"scope", summary.scope},
		detailField{"blueprints", strings.Join(summary.blueprints, ", ")},
	)
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
	if pack.Version != "" {
		parts = append(parts, "version: "+pack.Version)
	}
	if pack.DefinitionPath != "" {
		parts = append(parts, "definition: "+pack.DefinitionPath)
	}
	if len(pack.ValidationErrors) > 0 {
		parts = append(parts, "errors: "+strings.Join(pack.ValidationErrors, "; "))
	}
	if pack.Description != "" {
		parts = append(parts, compactCatalogText(pack.Description))
	}
	return strings.Join(parts, " · ")
}

func agentBlueprintDescription(blueprint gact.AgentBlueprintDefinition) string {
	parts := make([]string, 0, 10)
	if blueprint.Version != "" {
		parts = append(parts, "version: "+blueprint.Version)
	}
	if blueprint.RootExpert != "" {
		parts = append(parts, "root: "+blueprint.RootExpert)
	}
	if provenance := agentBlueprintProvenanceLine(blueprint); provenance != "" {
		parts = append(parts, provenance)
	}
	if blueprint.DefinitionPath != "" {
		parts = append(parts, "definition: "+blueprint.DefinitionPath)
	}
	if len(blueprint.ValidationErrors) > 0 {
		parts = append(parts, "errors: "+strings.Join(blueprint.ValidationErrors, "; "))
	}
	if blueprint.Description != "" {
		parts = append(parts, compactCatalogText(blueprint.Description))
	}
	return strings.Join(parts, " · ")
}

func expertPackDetailItems(detail gact.ExpertPackDetail) []catalogItem {
	pack := detail.ExpertPack
	items := []catalogItem{{
		id:        "activate",
		title:     "Activate for current session",
		desc:      "sets this expert pack as the active session runtime",
		statusTag: "session",
	}, {
		id:        "pack/" + pack.ID,
		title:     "Pack · " + firstNonEmpty(pack.Title, pack.ID),
		desc:      formatExpertPackSummary(pack),
		statusTag: firstNonEmpty(pack.Scope, "pack"),
	}}
	if len(pack.ValidationErrors) > 0 {
		items = append(items, catalogItem{
			id: "validation", title: "Validation errors", desc: strings.Join(pack.ValidationErrors, "; "), statusTag: "error",
		})
	}
	sortAgentsForCatalog(detail.Agents)
	for _, agent := range detail.Agents {
		status := firstNonEmpty(agent.Source, "expert")
		if !agent.Enabled || len(agent.ValidationErrors) > 0 {
			status = "invalid"
		}
		items = append(items, catalogItem{
			id:        "agent/" + agent.ID,
			title:     "Agent · " + firstNonEmpty(agent.Title, agent.ID),
			desc:      agentCatalogDescription(agent, detail.Agents),
			statusTag: status,
		})
	}
	return items
}

func agentBlueprintDetailItems(detail gact.AgentBlueprintDetail) []catalogItem {
	blueprint := detail.AgentBlueprint
	items := []catalogItem{{
		id:        "activate",
		title:     "Activate for current session",
		desc:      "sets this markdown agent blueprint as the active session runtime",
		statusTag: "session",
	}, {
		id:        "blueprint/" + blueprint.ID,
		title:     "Blueprint · " + firstNonEmpty(blueprint.Title, blueprint.ID),
		desc:      formatAgentBlueprintSummary(blueprint),
		statusTag: firstNonEmpty(blueprint.Scope, "blueprint"),
	}}
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
	if len(blueprint.ValidationErrors) > 0 {
		items = append(items, catalogItem{id: "validation", title: "Validation errors", desc: strings.Join(blueprint.ValidationErrors, "; "), statusTag: "error"})
	}
	for _, descriptor := range detail.MCPDescriptors {
		id := stringValue(descriptor["id"])
		title := firstNonEmpty(stringValue(descriptor["name"]), id)
		status := firstNonEmpty(stringValue(descriptor["status"]), "mcp")
		if errors := stringListFromAny(descriptor["validation_errors"]); len(errors) > 0 {
			status = "invalid"
		}
		items = append(items, catalogItem{
			id:        "mcp/" + id,
			title:     "MCP · " + title,
			desc:      agentBlueprintMCPDescription(descriptor),
			statusTag: status,
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
			id:        "hook/" + id,
			title:     "Hook · " + title,
			desc:      agentBlueprintHookDescription(descriptor),
			statusTag: status,
		})
	}
	sortAgentsForCatalog(detail.Agents)
	for _, agent := range detail.Agents {
		status := firstNonEmpty(agent.Source, "agent")
		if !agent.Enabled || len(agent.ValidationErrors) > 0 {
			status = "invalid"
		}
		items = append(items, catalogItem{
			id:        "agent/" + agent.ID,
			title:     "Agent · " + firstNonEmpty(agent.Title, agent.ID),
			desc:      agentCatalogDescription(agent, detail.Agents),
			statusTag: status,
		})
	}
	return items
}

func formatExpertPackSummary(pack gact.ExpertPackDefinition) string {
	rows := appendDetailSection(nil, "Expert Pack",
		detailField{"id", pack.ID},
		detailField{"title", pack.Title},
		detailField{"version", pack.Version},
		detailField{"scope", pack.Scope},
		detailField{"enabled", fmt.Sprintf("%t", pack.Enabled)},
		detailField{"root", pack.Root},
		detailField{"definition", pack.DefinitionPath},
	)
	if len(pack.ValidationErrors) > 0 {
		rows = appendDetailSection(rows, "Validation", detailField{"errors", strings.Join(pack.ValidationErrors, "\n")})
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

func agentBlueprintMCPDescription(descriptor map[string]any) string {
	parts := make([]string, 0, 10)
	for _, key := range []string{"transport", "command", "url", "source", "trust", "install", "runtime", "verification"} {
		parts = appendDescriptorMetadataParts(parts, key, descriptor[key])
	}
	for _, key := range []string{"env_policy", "source_blueprint_id", "server_id"} {
		parts = appendDescriptorMetadataParts(parts, key, descriptor[key])
	}
	if args := stringListFromAny(descriptor["args"]); len(args) > 0 {
		parts = append(parts, "args: "+strings.Join(args, " "))
	}
	if enabled := scalarText(descriptor["enabled"]); enabled != "" {
		parts = append(parts, "enabled: "+enabled)
	}
	if warnings := stringListFromAny(descriptor["validation_warnings"]); len(warnings) > 0 {
		parts = append(parts, "warnings: "+strings.Join(warnings, "; "))
	}
	if errors := stringListFromAny(descriptor["validation_errors"]); len(errors) > 0 {
		parts = append(parts, "errors: "+strings.Join(errors, "; "))
	}
	return strings.Join(parts, " · ")
}

func appendDescriptorMetadataParts(parts []string, key string, value any) []string {
	if text := descriptorMetadataValueText(value); text != "" {
		return append(parts, key+": "+text)
	}
	m := mapValue(value)
	if len(m) == 0 {
		return parts
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
		parts = append(parts, label+": "+descriptorMetadataValueText(m[subkey]))
	}
	return parts
}

func descriptorMetadataLabel(key, subkey string) string {
	switch key {
	case "trust":
		switch subkey {
		case "policy":
			return "trust_policy"
		case "trusted":
			return "trusted"
		case "source":
			return "trust_source"
		}
	case "env_policy":
		switch subkey {
		case "mode", "policy":
			return "env_policy"
		}
	}
	return key + "_" + subkey
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

func agentBlueprintHookDescription(descriptor map[string]any) string {
	parts := make([]string, 0, 12)
	for _, key := range []string{"event", "source", "scope", "agent_blueprint_id", "definition_path", "installed_path", "checksum"} {
		if value := stringValue(descriptor[key]); value != "" {
			parts = append(parts, key+": "+value)
		}
	}
	if trust := mapValue(descriptor["trust"]); len(trust) > 0 {
		if policy := stringValue(trust["policy"]); policy != "" {
			parts = append(parts, "trust_policy: "+policy)
		}
		if trusted := scalarText(trust["trusted"]); trusted != "" {
			parts = append(parts, "trusted: "+trusted)
		}
		if source := stringValue(trust["source"]); source != "" {
			parts = append(parts, "trust_source: "+source)
		}
	} else if trust := stringValue(descriptor["trust"]); trust != "" {
		parts = append(parts, "trust: "+trust)
	}
	if enabled := scalarText(descriptor["enabled"]); enabled != "" {
		parts = append(parts, "enabled: "+enabled)
	}
	if warnings := stringListFromAny(descriptor["validation_warnings"]); len(warnings) > 0 {
		parts = append(parts, "warnings: "+strings.Join(warnings, "; "))
	}
	if errors := stringListFromAny(descriptor["validation_errors"]); len(errors) > 0 {
		parts = append(parts, "errors: "+strings.Join(errors, "; "))
	}
	return strings.Join(parts, " · ")
}

func formatAgentBlueprintSummary(blueprint gact.AgentBlueprintDefinition) string {
	rows := appendDetailSection(nil, "Agent Blueprint",
		detailField{"id", blueprint.ID},
		detailField{"title", blueprint.Title},
		detailField{"version", blueprint.Version},
		detailField{"scope", blueprint.Scope},
		detailField{"enabled", fmt.Sprintf("%t", blueprint.Enabled)},
		detailField{"root_expert", blueprint.RootExpert},
		detailField{"root", blueprint.Root},
		detailField{"definition", firstNonEmpty(blueprint.DefinitionPath, blueprint.RootPath)},
	)
	rows = appendAgentBlueprintProvenanceSection(rows, blueprint)
	if len(blueprint.ValidationErrors) > 0 {
		rows = appendDetailSection(rows, "Validation", detailField{"errors", strings.Join(blueprint.ValidationErrors, "\n")})
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
		{"source", firstNonEmpty(stringValue(install["source"]), stringValue(install["url"]), stringValue(install["path"]))},
		{"source_kind", firstNonEmpty(stringValue(install["source_kind"]), stringValue(install["kind"]))},
		{"ref", stringValue(install["ref"])},
		{"commit", stringValue(install["commit"])},
		{"checksum", stringValue(install["checksum"])},
		{"status", stringValue(install["status"])},
		{"status_message", firstNonEmpty(stringValue(install["status_message"]), stringValue(install["message"]))},
		{"trust", firstNonEmpty(stringValue(install["trust"]), stringValue(install["trust_policy"]))},
		{"installed_at", stringValue(install["installed_at"])},
		{"synced_at", firstNonEmpty(stringValue(install["last_sync"]), stringValue(install["last_synced_at"]), stringValue(install["synced_at"]))},
		{"scope", firstNonEmpty(stringValue(install["scope"]), blueprint.Scope)},
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
		fields = append(fields, "status_message: "+message)
	}
	if syncedAt := firstNonEmpty(stringValue(install["last_sync"]), stringValue(install["last_synced_at"]), stringValue(install["synced_at"])); syncedAt != "" {
		fields = append(fields, "synced_at: "+syncedAt)
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

func promptDefinitionDescription(p gact.PromptDefinition) string {
	parts := make([]string, 0, 5)
	profiles := sortedPromptProfiles(p.Profiles)
	if len(profiles) > 0 {
		parts = append(parts, fmt.Sprintf("profiles: %s", strings.Join(profiles, ", ")))
	}
	if p.DefaultProfile != "" {
		parts = append(parts, "default: "+p.DefaultProfile)
	}
	if len(p.ValidationErrors) > 0 {
		parts = append(parts, "errors: "+strings.Join(p.ValidationErrors, "; "))
	}
	if desc := compactCatalogText(p.Description); desc != "" {
		parts = append(parts, desc)
	}
	return strings.Join(parts, " · ")
}

func sortedPromptProfiles(profiles map[string]gact.PromptProfile) []string {
	names := make([]string, 0, len(profiles))
	for name := range profiles {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

func promptProfileDescription(p gact.PromptProfile) string {
	parts := make([]string, 0, 5)
	if p.Provider != "" {
		parts = append(parts, "provider: "+p.Provider)
	}
	if p.Model != "" {
		parts = append(parts, "model: "+p.Model)
	}
	if p.Checksum != "" {
		parts = append(parts, "checksum: "+p.Checksum)
	}
	if p.SourcePath != "" {
		parts = append(parts, p.SourcePath)
	}
	if len(parts) == 0 {
		parts = append(parts, compactCatalogText(p.Text))
	}
	return strings.Join(parts, " · ")
}

func formatResolvedPrompt(p gact.ResolvedPrompt) string {
	summary := []detailField{
		{"id", p.ID},
		{"profile", p.Profile},
		{"scope", p.Scope},
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

func formatRenderedPrompt(p gact.ResolvedPrompt) string {
	rows := appendDetailSection(nil, "Rendered runtime prompt",
		detailField{"id", p.ID},
		detailField{"profile", p.Profile},
		detailField{"scope", p.Scope},
		detailField{"source", p.SourcePath},
		detailField{"checksum", p.Checksum},
		detailField{"provider", p.Provider},
		detailField{"model", p.Model},
	)
	if p.FallbackProfile != "" {
		rows = append(rows, detailFieldRows("fallback profile", p.FallbackProfile)...)
	}
	if len(p.ValidationErrors) > 0 {
		rows = appendDetailSection(rows, "Validation", detailField{"errors", strings.Join(p.ValidationErrors, "\n")})
	}
	if len(p.Metadata) > 0 {
		if payload, err := json.MarshalIndent(p.Metadata, "", "  "); err == nil {
			rows = appendDetailSection(rows, "Render provenance", detailField{"", string(payload)})
		}
	}
	rows = appendDetailSection(rows, "Rendered text", detailField{"", p.Text})
	return strings.Join(rows, "\n")
}

func formatPromptValidation(result gact.PromptValidationResult) string {
	status := "valid"
	if !result.Enabled || len(result.ValidationErrors) > 0 {
		status = "invalid"
	}
	rows := appendDetailSection(nil, "Validation",
		detailField{"status", status},
		detailField{"enabled", fmt.Sprintf("%t", result.Enabled)},
		detailField{"prompt_id", result.Prompt.ID},
		detailField{"scope", result.Prompt.Scope},
		detailField{"source", result.Prompt.SourcePath},
	)
	if len(result.ValidationErrors) > 0 {
		rows = appendDetailSection(rows, "Errors", detailField{"", strings.Join(result.ValidationErrors, "\n")})
	}
	return strings.Join(rows, "\n")
}

func formatPromptReload(result gact.PromptReloadResult) string {
	rows := appendDetailSection(nil, "Reload",
		detailField{"prompt_count", fmt.Sprintf("%d", result.PromptCount)},
		detailField{"prompt_ids", strings.Join(result.PromptIDs, ", ")},
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
				parts = append(parts, key+": "+value)
			}
		}
		if fallback := strings.TrimSpace(fmt.Sprint(res["fallback_profile"])); fallback != "" && fallback != "<nil>" {
			parts = append(parts, "fallback: "+fallback)
		}
	}
	if len(parts) == 0 {
		promptID := firstNonEmpty(agent.PromptID, stringFromMetadata(agent.Metadata, "prompt_id"), stringFromMetadata(agent.Metadata, "prompt"))
		profile := firstNonEmpty(agent.PromptProfile, stringFromMetadata(agent.Metadata, "prompt_profile"))
		if promptID != "" {
			parts = append(parts, "id: "+promptID)
		}
		if profile != "" {
			parts = append(parts, "profile: "+profile)
		}
	}
	return strings.Join(parts, " · ")
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
		items = append(items, agentCatalogItem(agent, agents, depth))
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

func agentCatalogItem(agent gact.AgentDef, allAgents []gact.AgentDef, depth int) catalogItem {
	title := firstNonEmpty(agent.Title, agent.ID)
	if depth > 0 {
		title = strings.Repeat("  ", min(depth, 3)) + "└─ " + title
	}
	return catalogItem{
		id:        agent.ID,
		title:     title,
		desc:      agentCatalogDescription(agent, allAgents),
		statusTag: firstNonEmpty(agent.Source, "agent"),
	}
}

func agentCatalogDescription(agent gact.AgentDef, allAgents []gact.AgentDef) string {
	parts := make([]string, 0, 6)
	if agent.Tier > 0 {
		parts = append(parts, "tier "+itoa2(agent.Tier))
	}
	if agent.Specialization != "" {
		parts = append(parts, agent.Specialization)
	}
	if parent := agentParentID(agent); parent != "" {
		parts = append(parts, "child of "+agentTitleByID(allAgents, parent))
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
		parts = append(parts, "tools: "+toolSummary)
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
		parts = append(parts, "commands: "+commandSummary)
	}
	if len(agent.ValidationErrors) > 0 {
		parts = append(parts, "errors: "+strings.Join(agent.ValidationErrors, "; "))
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
			return firstNonEmpty(agent.Title, agent.ID)
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
		parts = append(parts, "server: "+tool.ServerID)
	}
	if len(tool.Tags) > 0 {
		parts = append(parts, "tags: "+strings.Join(tool.Tags, ", "))
	}
	if len(tool.VisibleTo) > 0 {
		parts = append(parts, "visible to: "+strings.Join(tool.VisibleTo, ", "))
	}
	return strings.Join(parts, " · ")
}

func toolCatalogDescription(tool gact.Tool) string {
	parts := make([]string, 0, 6)
	if tool.Owner != "" {
		parts = append(parts, "owner: "+tool.Owner)
	}
	if tool.PermissionDefault != "" {
		parts = append(parts, "permission: "+tool.PermissionDefault)
	}
	if fields := schemaFieldNames(tool.InputSchema, 2); len(fields) > 0 {
		parts = append(parts, "inputs: "+strings.Join(fields, ", "))
	}
	if len(tool.Tags) > 0 {
		parts = append(parts, "tags: "+strings.Join(limitStrings(tool.Tags, 1), ", "))
	}
	if len(parts) == 0 {
		if desc := toolPurposeSummary(tool); desc != "" {
			parts = append(parts, desc)
		}
	}
	return truncate(strings.Join(parts, " · "), 88)
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
		{"source", firstNonEmpty(tool.Source, "unknown")},
	}
	if tool.ServerID != "" {
		summary = append(summary, detailField{"server", tool.ServerID})
	}
	if tool.Owner != "" {
		summary = append(summary, detailField{"owner", tool.Owner})
	}
	if tool.PermissionDefault != "" {
		summary = append(summary, detailField{"permission", tool.PermissionDefault})
	}
	if tool.ID != "" && tool.ID != tool.Name {
		summary = append(summary, detailField{"tool id", tool.ID})
	}
	rows := appendDetailSection(nil, "Summary", summary...)

	availability := make([]detailField, 0, 3)
	if len(tool.VisibleTo) > 0 {
		availability = append(availability, detailField{"visible to", strings.Join(tool.VisibleTo, ", ")})
	}
	if len(tool.Tags) > 0 {
		availability = append(availability, detailField{"tags", strings.Join(tool.Tags, ", ")})
	}
	if owners := owningAgentsForTool(tool, agents); len(owners) > 0 {
		ownerRows := make([]string, 0, len(owners))
		for _, owner := range owners {
			ownerRows = append(ownerRows, "- "+owner)
		}
		availability = append(availability, detailField{"owning agents", strings.Join(ownerRows, "\n") + "\n"})
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

func appendToolAnnotationsSection(rows []string, annotations *gact.ToolAnnotations) []string {
	if annotations == nil {
		return rows
	}
	fields := make([]detailField, 0, 2)
	if title := strings.TrimSpace(annotations.Title); title != "" {
		fields = append(fields, detailField{"display title", title})
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
	return appendDetailSection(rows, "Safety hints", fields...)
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
		label := firstNonEmpty(agent.Title, agent.ID)
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
		fields = append(fields, detailField{"mime_type", content.MimeType})
		if content.Text != "" {
			fields = append(fields, detailField{"text", content.Text})
		}
		if content.Data != "" {
			fields = append(fields, detailField{"base64_data", fmt.Sprintf("%d bytes encoded", len(content.Data))})
		}
		rows = appendDetailSection(rows, "Resource content", fields...)
	}
	return strings.Join(rows, "\n")
}
