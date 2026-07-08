package ui

// agentBlueprintManageModal: the agent-blueprint install/validate management overlay.

import (
	"fmt"
	"strings"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/widget"
)

const (
	agentBlueprintManageInstall  = "install"
	agentBlueprintManageValidate = "validate"
	agentBlueprintManageSource   = "source"
)

// agentBlueprintManageModal is the blueprint install/validate prompt's state:
// the source input, the mode (install vs validate), and inline error/saving
// status. lastValidatedSource lives here too but survives reset() so the
// "validated X" hint stays visible after the prompt closes. It owns its
// behaviour (open/close/key/insert/view) and holds an app back-ref for shared
// services, wired centrally in wireComponents().
type agentBlueprintManageModal struct {
	app                 *App
	open                bool
	mode                string
	input               widget.TextInput
	err                 string
	saving              bool
	lastValidatedSource string
}

func (m *agentBlueprintManageModal) openModal(mode string) {
	m.open = true
	m.mode = mode
	m.input.SetValue("")
	m.input.SetCursor(0)
	m.err = ""
	m.saving = false
	if mode == agentBlueprintManageInstall && strings.TrimSpace(m.lastValidatedSource) != "" {
		m.input.SetValue(strings.TrimSpace(m.lastValidatedSource))
		m.input.SetCursor(len([]rune(m.input.Value())))
	}
}

// reset clears the editor but preserves lastValidatedSource, matching the
// original close which left the last validated source intact.
func (m *agentBlueprintManageModal) reset() {
	*m = agentBlueprintManageModal{app: m.app, lastValidatedSource: m.lastValidatedSource}
}

func (m *agentBlueprintManageModal) close() { m.reset() }

func (m *agentBlueprintManageModal) handleKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	if m.saving {
		return m.app, nil
	}
	switch k.String() {
	case "esc":
		m.close()
		return m.app, nil
	case "enter":
		source := strings.TrimSpace(m.input.Value())
		if source == "" {
			m.err = m.mode + " path/source is required"
			return m.app, nil
		}
		m.saving = true
		switch m.mode {
		case agentBlueprintManageValidate:
			return m.app, validateAgentBlueprintCmd(m.app.c, m.app.session.runtimeScope(), source)
		case agentBlueprintManageSource:
			return m.app, addAgentBlueprintSourceCmd(m.app.c, source)
		default:
			return m.app, installAgentBlueprintCmd(m.app.c, m.app.session.runtimeScope(), source)
		}
	}
	m.input.HandleKey(k)
	return m.app, nil
}

func (m *agentBlueprintManageModal) insert(text string) {
	if text == "" {
		return
	}
	text = strings.TrimRight(strings.ReplaceAll(text, "\r\n", "\n"), "\n")
	m.input.Insert(text)
	m.err = ""
}

func clampAgentBlueprintCursor(cursor, maxLen int) int {
	if cursor < 0 {
		return 0
	}
	if cursor > maxLen {
		return maxLen
	}
	return cursor
}

func formatAgentBlueprintValidation(result gact.AgentBlueprintValidationResult) string {
	return formatAgentBlueprintValidationWithSource(result, "")
}

func formatAgentBlueprintValidationWithSource(result gact.AgentBlueprintValidationResult, source string) string {
	status := "valid"
	if !result.Enabled || len(result.ValidationErrors) > 0 {
		status = "invalid"
	} else if len(result.ValidationWarnings) > 0 {
		status = "warning"
	}
	rows := []string{}
	source = strings.TrimSpace(source)
	if source != "" {
		next := "fix validation errors, then validate again before installing"
		if status == "valid" || status == "warning" {
			next = "press Esc, choose install source, and use the same source"
		}
		rows = appendDetailSection(rows, "Validated source",
			detailField{"source", source},
			detailField{"next action", next},
		)
		rows = append(rows, "")
	}
	rows = appendDetailSection(rows, "Validation",
		detailField{"status", status},
		detailField{"enabled", fmt.Sprintf("%t", result.Enabled)},
	)
	if len(result.ValidationErrors) > 0 {
		rows = append(rows, "errors: "+strings.Join(result.ValidationErrors, "; "))
	}
	if len(result.ValidationWarnings) > 0 {
		rows = append(rows, "warnings: "+strings.Join(result.ValidationWarnings, "; "))
	}
	if result.AgentBlueprint.ID != "" {
		rows = append(rows, "")
		rows = append(rows, formatAgentBlueprintSummary(result.AgentBlueprint))
	}
	if len(result.MCPDescriptors) > 0 {
		rows = append(rows, "", "MCP descriptors")
		for _, descriptor := range result.MCPDescriptors {
			rows = append(rows, "- "+valuefmt.FirstNonEmpty(valuefmt.StringValue(descriptor["name"]), valuefmt.StringValue(descriptor["id"]))+": "+agentBlueprintMCPDescription(descriptor))
		}
	}
	if len(result.HookDescriptors) > 0 {
		rows = append(rows, "", "Packaged hooks")
		for _, descriptor := range result.HookDescriptors {
			rows = append(rows, "- "+valuefmt.FirstNonEmpty(valuefmt.StringValue(descriptor["title"]), valuefmt.StringValue(descriptor["name"]), valuefmt.StringValue(descriptor["id"]))+": "+agentBlueprintHookDescription(descriptor))
		}
	}
	if len(result.Agents) > 0 {
		rows = append(rows, "", "Experts")
		for _, agent := range result.Agents {
			rows = append(rows, "- "+valuefmt.FirstNonEmpty(agent.Title, agent.ID)+": "+agentCatalogDescription(agent, result.Agents))
		}
	}
	return strings.Join(rows, "\n")
}
