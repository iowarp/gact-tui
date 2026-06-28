package ui

// chrome_footer_hints.go selects footer hint clusters that fit the available width and labels the focus zone.

import (
	"strings"

	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"
)

func (c *chromeComponent) footerHintClusters(mk func(string, string) string, available int) [][]string {
	contexts := c.footerContextHintVariants(mk)
	globals := c.footerGlobalHintVariants(mk)
	exit := []string{mk("Ctrl+C", c.app.localizer.t(msgFooterQuit, nil))}
	if c.app.focus != FocusInput {
		for _, context := range contexts {
			for _, global := range globals {
				clusters := [][]string{context, global, exit}
				if footerClustersWidth(clusters) <= available {
					return clusters
				}
			}
		}
		for _, context := range contexts {
			clusters := [][]string{context, exit}
			if footerClustersWidth(clusters) <= available {
				return clusters
			}
		}
		for _, global := range globals {
			clusters := [][]string{global, exit}
			if footerClustersWidth(clusters) <= available {
				return clusters
			}
		}
		return [][]string{
			{
				mk("Ctrl+N", c.app.localizer.t(msgFooterNew, nil)),
				mk("?", c.app.localizer.t(msgFooterHelp, nil)),
			},
			exit,
		}
	}
	if available < 130 {
		if c.app.MouseEnabled {
			for _, context := range contexts {
				clusters := [][]string{context, exit}
				if footerClustersWidth(clusters) <= available {
					return clusters
				}
			}
		}
		for _, global := range globals {
			clusters := [][]string{global, exit}
			if footerClustersWidth(clusters) <= available {
				return clusters
			}
		}
	} else {
		if c.app.MouseEnabled {
			for _, global := range globals {
				for _, context := range contexts {
					joined := ansi.Strip(strings.Join(context, " "))
					if !strings.Contains(joined, "Ctrl+G") {
						continue
					}
					clusters := [][]string{context, global, exit}
					if footerClustersWidth(clusters) <= available {
						return clusters
					}
				}
			}
		}
		for _, global := range globals {
			for _, context := range contexts {
				clusters := [][]string{context, global, exit}
				if footerClustersWidth(clusters) <= available {
					return clusters
				}
			}
		}
	}
	for _, context := range contexts {
		clusters := [][]string{context, exit}
		if footerClustersWidth(clusters) <= available {
			return clusters
		}
	}
	if available >= 130 {
		for _, global := range globals {
			clusters := [][]string{global, exit}
			if footerClustersWidth(clusters) <= available {
				return clusters
			}
		}
	}
	return [][]string{
		{
			mk("Ctrl+N", c.app.localizer.t(msgFooterNew, nil)),
			mk("?", c.app.localizer.t(msgFooterHelp, nil)),
		},
		exit,
	}
}

func footerClustersWidth(clusters [][]string) int {
	parts := make([]string, 0, len(clusters))
	for _, cluster := range clusters {
		if len(cluster) == 0 {
			continue
		}
		parts = append(parts, strings.Join(cluster, " · "))
	}
	return lipgloss.Width(strings.Join(parts, "  │  "))
}

func (c *chromeComponent) focusLabel(f FocusZone) string {
	switch f {
	case FocusSidebar:
		return c.app.localizer.t(msgChromeFocusSidebar, nil)
	case FocusBody:
		return c.app.localizer.t(msgChromeFocusConversation, nil)
	case FocusRightSidebar:
		return c.app.localizer.t(msgChromeFocusRightSidebar, nil)
	case FocusInput:
		return c.app.localizer.t(msgChromeFocusInput, nil)
	}
	return "?"
}
