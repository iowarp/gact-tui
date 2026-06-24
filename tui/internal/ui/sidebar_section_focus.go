package ui

// sidebar_section_focus.go computes sidebar sections from modules and manages section focus cycling.

func (c *sidebarComponent) sections() []sidebarSection {
	return sidebarSectionsFromModules(c.modules())
}

func (c *sidebarComponent) activeSections() []sidebarSection {
	if c.app.focus == FocusRightSidebar {
		return sidebarSectionsFromModules(c.rightModules())
	}
	return c.sections()
}

func sidebarSectionsFromModules(modules []resolvedSidebarModule) []sidebarSection {
	sections := make([]sidebarSection, 0, len(modules))
	for _, module := range modules {
		if module.Disabled {
			continue
		}
		sections = append(sections, module.Definition.Section)
	}
	return sections
}

func (c *sidebarComponent) sectionPosition() int {
	sections := c.activeSections()
	for i, section := range sections {
		if section == c.sectionFocus {
			return i
		}
	}
	return 0
}

func (c *sidebarComponent) focusPreviousSection() {
	sections := c.activeSections()
	if len(sections) == 0 {
		return
	}
	pos := c.sectionPosition()
	if pos > 0 {
		pos--
	}
	c.sectionFocus = sections[pos]
}

func (c *sidebarComponent) focusNextSection() {
	sections := c.activeSections()
	if len(sections) == 0 {
		return
	}
	pos := c.sectionPosition()
	if pos < len(sections)-1 {
		pos++
	}
	c.sectionFocus = sections[pos]
}

func (c *sidebarComponent) toggleFocusedSection() {
	switch c.sectionFocus {
	case sidebarSectionFiles:
		c.activateSection(sidebarSectionFiles)
	case sidebarSectionContext:
		c.activateSection(sidebarSectionContext)
	default:
		c.activateSection(sidebarSectionSessions)
	}
}
