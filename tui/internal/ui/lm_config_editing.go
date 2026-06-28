package ui

// lm_config_editing.go handles LM-config field text/number editing and paste.

import (
	"fmt"
	"strconv"
	"strings"

	tea "charm.land/bubbletea/v2"
)

func (c *lmConfigComponent) handleHorizontal(delta int) {
	if !c.open {
		return
	}
	switch c.field {
	case lmFieldTemperature:
		cur := 1.0
		if v, err := strconv.ParseFloat(c.temperature, 64); err == nil {
			cur = v
		}
		cur += float64(delta) * 0.1
		if cur < 0 {
			cur = 0
		}
		if cur > 2 {
			cur = 2
		}
		c.temperature = fmt.Sprintf("%.1f", cur)
	case lmFieldMaxTokens:
		c.maxTokens = stepLMConfigInt(c.maxTokens, delta, 512, 64000)
	case lmFieldContextLength:
		c.contextLength = stepLMConfigInt(c.contextLength, delta, 4096, 262144)
	case lmFieldThinkingBudget:
		c.thinkingBudget = stepLMConfigInt(c.thinkingBudget, delta, 1024, 32000)
	case lmFieldParallel:
		c.parallel = stepLMConfigInt(c.parallel, delta, 1, 16)
	}
}

func stepLMConfigInt(raw string, delta, step, max int) string {
	cur := 0
	if v, err := strconv.Atoi(raw); err == nil {
		cur = v
	}
	cur += delta * step
	if cur < 0 {
		cur = 0
	}
	if cur > max {
		cur = max
	}
	if cur == 0 {
		return ""
	}
	return fmt.Sprintf("%d", cur)
}

func (c *lmConfigComponent) handleBackspace() tea.Cmd {
	if !c.open {
		return nil
	}
	switch c.field {
	case lmFieldPreset:
		if len(c.providerFilter) > 0 {
			c.providerFilter = c.providerFilter[:len(c.providerFilter)-1]
			c.selectFirstFiltered()
			return c.syncFromPreset()
		}
	case lmFieldAPIBase:
		if len(c.apiBase) > 0 {
			c.apiBase = c.apiBase[:len(c.apiBase)-1]
			c.invalidateCurrentCatalog()
		}
	case lmFieldModel:
		if len(c.modelFilter) > 0 {
			c.modelFilter = c.modelFilter[:len(c.modelFilter)-1]
			c.selectFirstFilteredModel()
		}
	case lmFieldAPIKey:
		if len(c.apiKey) > 0 {
			c.apiKey = c.apiKey[:len(c.apiKey)-1]
		}
	}
	return nil
}

func (c *lmConfigComponent) handleTextInput(text string) tea.Cmd {
	if !c.open || text == "" {
		return nil
	}
	switch c.field {
	case lmFieldPreset:
		c.providerFilter += text
		c.selectFirstFiltered()
		return c.syncFromPreset()
	case lmFieldAPIBase:
		c.apiBase += text
		c.invalidateCurrentCatalog()
	case lmFieldModel:
		c.modelFilter += text
		c.selectFirstFilteredModel()
	case lmFieldAPIKey:
		c.apiKey += text
	}
	return nil
}

func (c *lmConfigComponent) handlePaste(content string) tea.Cmd {
	if !c.open || content == "" {
		return nil
	}
	text := strings.TrimSpace(strings.ReplaceAll(content, "\r\n", "\n"))
	if text == "" {
		return nil
	}
	switch c.field {
	case lmFieldPreset:
		c.providerFilter += strings.ReplaceAll(text, "\n", " ")
		c.selectFirstFiltered()
		return c.syncFromPreset()
	case lmFieldAPIBase:
		c.apiBase += strings.ReplaceAll(text, "\n", "")
		c.invalidateCurrentCatalog()
	case lmFieldModel:
		c.modelFilter += strings.ReplaceAll(text, "\n", " ")
		c.selectFirstFilteredModel()
	case lmFieldAPIKey:
		c.apiKey += strings.ReplaceAll(text, "\n", "")
	}
	return nil
}
