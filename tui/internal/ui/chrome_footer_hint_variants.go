package ui

// chrome_footer_hint_variants.go builds the context and global footer hint variant clusters.

func (c *chromeComponent) footerContextHintVariants(mk func(string, string) string) [][]string {
	switch c.app.focus {
	case FocusSidebar:
		if c.app.sidebar.sessionFilterActive {
			return [][]string{
				{
					mk("type", c.app.localizer.t(msgFooterSidebarFilterType, nil)),
					mk("Enter", c.app.localizer.t(msgFooterSidebarApply, nil)),
					mk("Esc", c.app.localizer.t(msgFooterSidebarCancel, nil)),
				},
				{
					mk("Enter", c.app.localizer.t(msgFooterSidebarApply, nil)),
					mk("Esc", c.app.localizer.t(msgFooterSidebarCancel, nil)),
				},
			}
		}
		if c.app.sidebar.sessionsCollapsed || c.app.sidebar.sectionCursor {
			return [][]string{
				{
					mk("↑/↓", c.app.localizer.t(msgFooterSidebarSections, nil)),
					mk("Enter", c.app.localizer.t(msgFooterSidebarToggle, nil)),
					mk("S/C", c.app.localizer.t(msgFooterSidebarSections, nil)),
				},
				{
					mk("↑/↓", c.app.localizer.t(msgFooterSidebarSections, nil)),
					mk("Enter", c.app.localizer.t(msgFooterSidebarToggle, nil)),
				},
			}
		}
		return [][]string{
			{
				mk("↑/↓", c.app.localizer.t(msgFooterSidebarSelect, nil)),
				mk("Enter", c.app.localizer.t(msgFooterSidebarOpen, nil)),
				mk("e", c.app.localizer.t(msgFooterSidebarRename, nil)),
				mk("x", c.app.localizer.t(msgFooterSidebarDelete, nil)),
				mk("c", c.app.localizer.t(msgFooterSidebarChildren, nil)),
				mk("A", c.app.localizer.t(msgFooterSidebarArchive, nil)),
				mk("y", c.app.localizer.t(msgFooterSidebarCopyID, nil)),
				mk("f", c.app.localizer.t(msgFooterSidebarFilter, nil)),
				mk("o", c.app.localizer.t(msgFooterSidebarContext, nil)),
				mk("S/C", c.app.localizer.t(msgFooterSidebarSections, nil)),
			},
			{
				mk("↑/↓", c.app.localizer.t(msgFooterSidebarSelect, nil)),
				mk("Enter", c.app.localizer.t(msgFooterSidebarOpen, nil)),
				mk("e", c.app.localizer.t(msgFooterSidebarRename, nil)),
				mk("x", c.app.localizer.t(msgFooterSidebarDelete, nil)),
				mk("c", c.app.localizer.t(msgFooterSidebarChildren, nil)),
				mk("A", c.app.localizer.t(msgFooterSidebarArchive, nil)),
				mk("y", c.app.localizer.t(msgFooterSidebarCopyID, nil)),
				mk("f", c.app.localizer.t(msgFooterSidebarFilter, nil)),
				mk("S/C", c.app.localizer.t(msgFooterSidebarSections, nil)),
			},
			{
				mk("e", c.app.localizer.t(msgFooterSidebarRename, nil)),
				mk("x", c.app.localizer.t(msgFooterSidebarDelete, nil)),
				mk("A", c.app.localizer.t(msgFooterSidebarArchive, nil)),
				mk("y", c.app.localizer.t(msgFooterSidebarCopyID, nil)),
			},
			{
				mk("↑/↓", c.app.localizer.t(msgFooterSidebarSelect, nil)),
				mk("Enter", c.app.localizer.t(msgFooterSidebarOpen, nil)),
				mk("f", c.app.localizer.t(msgFooterSidebarFilter, nil)),
			},
		}
	case FocusBody:
		variants := [][]string{
			{
				mk("↑/↓", c.app.localizer.t(msgFooterConversationSelect, nil)),
				mk("Enter/Ctrl+E", c.app.localizer.t(msgFooterConversationDetails, nil)),
				mk("y", c.app.localizer.t(msgFooterConversationCopy, nil)),
				mk("Y", c.app.localizer.t(msgFooterConversationCopyFull, nil)),
				mk("R", c.app.localizer.t(msgFooterConversationRetry, nil)),
				mk("d", c.app.localizer.t(msgFooterConversationDelete, nil)),
				mk("G", c.app.localizer.t(msgFooterConversationBottom, nil)),
			},
			{
				mk("↑/↓", c.app.localizer.t(msgFooterConversationSelect, nil)),
				mk("Enter/Ctrl+E", c.app.localizer.t(msgFooterConversationDetails, nil)),
				mk("y", c.app.localizer.t(msgFooterConversationCopy, nil)),
				mk("Y", c.app.localizer.t(msgFooterConversationCopyFull, nil)),
				mk("R", c.app.localizer.t(msgFooterConversationRetry, nil)),
				mk("G", c.app.localizer.t(msgFooterConversationBottom, nil)),
			},
			{
				mk("Enter/Ctrl+E", c.app.localizer.t(msgFooterConversationDetails, nil)),
				mk("y", c.app.localizer.t(msgFooterConversationCopy, nil)),
				mk("Y", c.app.localizer.t(msgFooterConversationCopyFull, nil)),
				mk("R", c.app.localizer.t(msgFooterConversationRetry, nil)),
				mk("G", c.app.localizer.t(msgFooterConversationBottom, nil)),
			},
			{
				mk("Enter/Ctrl+E", c.app.localizer.t(msgFooterConversationDetails, nil)),
				mk("y", c.app.localizer.t(msgFooterConversationCopy, nil)),
				mk("R", c.app.localizer.t(msgFooterConversationRetry, nil)),
			},
			{
				mk("y", c.app.localizer.t(msgFooterConversationCopy, nil)),
				mk("R", c.app.localizer.t(msgFooterConversationRetry, nil)),
				mk("d", c.app.localizer.t(msgFooterConversationDelete, nil)),
			},
			{
				mk("Enter/Ctrl+E", c.app.localizer.t(msgFooterConversationDetails, nil)),
				mk("y", c.app.localizer.t(msgFooterConversationCopy, nil)),
			},
		}
		if c.app.MouseEnabled {
			nativeSelectLabel := c.app.localizer.t(msgFooterConversationNativeSelect, nil)
			dragCopy := mk("drag", c.app.localizer.t(msgFooterConversationDragCopy, nil))
			nativeSelect := mk("Alt+drag", nativeSelectLabel)
			insertPositions := []int{4, 4, 3, 2, 1, 2}
			for i := range variants {
				insertAt := len(variants[i])
				if i < len(insertPositions) && insertPositions[i] < insertAt {
					insertAt = insertPositions[i]
				}
				variants[i] = append(variants[i], "")
				copy(variants[i][insertAt+1:], variants[i][insertAt:])
				variants[i][insertAt] = dragCopy
			}
			variants = append([][]string{
				append([]string{nativeSelect}, variants[0]...),
				{
					nativeSelect,
					mk("Enter/Ctrl+E", c.app.localizer.t(msgFooterConversationDetails, nil)),
					mk("y", c.app.localizer.t(msgFooterConversationCopy, nil)),
					dragCopy,
					mk("G", c.app.localizer.t(msgFooterConversationBottom, nil)),
				},
				{
					nativeSelect,
					mk("y", c.app.localizer.t(msgFooterConversationCopy, nil)),
					dragCopy,
				},
			}, variants...)
		}
		return variants
	case FocusInput:
		variants := [][]string{
			{
				mk("Enter", c.app.localizer.t(msgFooterInputSend, nil)),
				mk("\\+Enter", c.app.localizer.t(msgFooterInputNewline, nil)),
				mk("Ctrl+G", c.app.localizer.t(msgFooterInputCompose, nil)),
			},
			{
				mk("Enter", c.app.localizer.t(msgFooterInputSend, nil)),
				mk("\\+Enter", c.app.localizer.t(msgFooterInputNewline, nil)),
			},
		}
		if c.app.MouseEnabled {
			nativeSelectLabel := c.app.localizer.t(msgFooterConversationNativeSelect, nil)
			dragCopy := mk("drag", c.app.localizer.t(msgFooterConversationDragCopy, nil))
			nativeSelect := mk("Alt+drag", nativeSelectLabel)
			variants = [][]string{
				{
					dragCopy,
					nativeSelect,
					mk("Enter", c.app.localizer.t(msgFooterInputSend, nil)),
					mk("\\+Enter", c.app.localizer.t(msgFooterInputNewline, nil)),
				},
				{
					dragCopy,
					mk("Enter", c.app.localizer.t(msgFooterInputSend, nil)),
					mk("\\+Enter", c.app.localizer.t(msgFooterInputNewline, nil)),
				},
				{
					mk("Enter", c.app.localizer.t(msgFooterInputSend, nil)),
					mk("\\+Enter", c.app.localizer.t(msgFooterInputNewline, nil)),
				},
				{
					mk("Enter", c.app.localizer.t(msgFooterInputSend, nil)),
					mk("\\+Enter", c.app.localizer.t(msgFooterInputNewline, nil)),
					mk("Ctrl+G", c.app.localizer.t(msgFooterInputCompose, nil)),
				},
				{
					dragCopy,
					mk("Enter", c.app.localizer.t(msgFooterInputSend, nil)),
					mk("Ctrl+G", c.app.localizer.t(msgFooterInputCompose, nil)),
				},
				{
					dragCopy,
					mk("Enter", c.app.localizer.t(msgFooterInputSend, nil)),
				},
			}
		}
		return variants
	default:
		return [][]string{{}}
	}
}

func (c *chromeComponent) footerGlobalHintVariants(mk func(string, string) string) [][]string {
	return [][]string{{
		mk("Ctrl+N", c.app.localizer.t(msgFooterNew, nil)),
		mk("Tab", c.app.localizer.t(msgFooterPane, nil)),
		mk("Ctrl+S", c.app.localizer.t(msgFooterSettings, nil)),
		mk("/", c.app.localizer.t(msgFooterCommand, nil)),
		mk("?", c.app.localizer.t(msgFooterHelp, nil)),
	}, {
		mk("Ctrl+N", c.app.localizer.t(msgFooterNew, nil)),
		mk("Ctrl+S", c.app.localizer.t(msgFooterSettings, nil)),
		mk("/", c.app.localizer.t(msgFooterCommand, nil)),
		mk("?", c.app.localizer.t(msgFooterHelp, nil)),
	}, {
		mk("Ctrl+N", c.app.localizer.t(msgFooterNew, nil)),
		mk("Ctrl+S", c.app.localizer.t(msgFooterSettings, nil)),
		mk("?", c.app.localizer.t(msgFooterHelp, nil)),
	}, {
		mk("?", c.app.localizer.t(msgFooterHelp, nil)),
	}}
}
