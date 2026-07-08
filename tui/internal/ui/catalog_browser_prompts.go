package ui

// catalog_browser_prompts.go handles prompt-detail loading/saving commands and the prompt-saved message.

import (
	"context"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

type promptSavedMsg struct {
	promptID string
	profile  string
	err      error
}

func (c *catalogComponent) handlePromptSaved(m promptSavedMsg) (tea.Model, tea.Cmd) {
	a := c.app
	if m.err != nil {
		a.setHint("prompt save failed: " + m.err.Error())
		return a, scheduleHintExpire(a.transientHint)
	}
	a.setHint("saved prompt profile " + m.profile)
	var cmd tea.Cmd
	if c.open && c.current != nil && c.current.kind == catalogKindPromptDetail && c.current.promptID == m.promptID {
		cmd = loadPromptDetailCmd(a.c, m.promptID, a.session.runtimeScope())
	}
	return a, tea.Batch(scheduleHintExpire(a.transientHint), cmd)
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
			title:      "Definition · " + stripPromptRowPrefix(valuefmt.FirstNonEmpty(def.Title, def.ID)),
			desc:       promptDefinitionDescription(def),
			inlineDesc: promptDefinitionInlineSummary(def),
			statusTag:  valuefmt.FirstNonEmpty(def.Scope, "prompt"),
		}}
		defaultProfile := valuefmt.FirstNonEmpty(def.DefaultProfile, "default")
		profiles := sortedPromptProfiles(def.Profiles)
		for _, profile := range profiles {
			p := def.Profiles[profile]
			status := valuefmt.FirstNonEmpty(p.Scope, def.Scope)
			if profile == def.DefaultProfile {
				status = valuefmt.FirstNonEmpty(status, "builtin") + " default"
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

func (c *catalogComponent) promptDefaultProfile() string {
	if c.current == nil {
		return "default"
	}
	return valuefmt.FirstNonEmpty(c.current.promptProfile, "default")
}

func (c *catalogComponent) renderPromptDefaultProfile() tea.Cmd {
	if c.current == nil || c.current.promptID == "" {
		return nil
	}
	return loadPromptRenderedDetailCmd(c.app.c, c.app.session.runtimeScope(), c.current.promptID, c.promptDefaultProfile())
}

func (c *catalogComponent) validatePromptDefaultProfile() tea.Cmd {
	if c.current == nil || c.current.promptID == "" {
		return nil
	}
	return loadPromptValidationDetailCmd(c.app.c, c.app.session.runtimeScope(), c.current.promptID, c.promptDefaultProfile())
}

func (c *catalogComponent) reloadPromptRegistry() tea.Cmd {
	return loadPromptReloadDetailCmd(c.app.c, c.app.session.runtimeScope())
}
