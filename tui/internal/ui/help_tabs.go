package ui

// helpTabs is the fixed list of help-overlay tabs. Keep the slice sorted
// by pane-discovery order (global -> where the cursor is -> deeper modes).
type helpKey struct {
	key    string
	descID messageID
}

var helpTabs = []struct {
	title string
	keys  []helpKey
}{
	{
		title: "Global",
		keys: []helpKey{
			{"Tab / ⇧Tab", "help.global.cycle_focus"},
			{"Ctrl+N", "help.global.new_session"},
			{"Ctrl+B", "help.global.session_setup"},
			{"Ctrl+W", "help.global.switch_workspace"},
			{"Ctrl+S", "help.global.settings"},
			{"Ctrl+T", "help.global.metrics"},
			{"Ctrl+Alt+T", "help.global.cycle_theme"},
			{"Ctrl+R", "help.global.refresh"},
			{"Ctrl+L", "help.global.reload_config"},
			{"Ctrl+X", "help.global.cancel_turn"},
			{"Ctrl+Y", "help.global.voice"},
			{"Ctrl+Z", "help.global.detach"},
			{"?", "help.global.toggle_help"},
			{"Esc", "help.global.escape"},
			{"Ctrl+C", "help.global.quit"},
		},
	},
	{
		title: "Sidebar",
		keys: []helpKey{
			{"↑/↓ · j/k", "help.sidebar.pick"},
			{"g / G", "help.sidebar.jump"},
			{"PgUp/PgDn", "help.sidebar.page"},
			{"n", "help.sidebar.new"},
			{"e", "help.sidebar.rename"},
			{"x", "help.sidebar.delete"},
			{"A", "help.sidebar.archive"},
			{"h", "help.sidebar.toggle_archived"},
			{"d", "help.sidebar.toggle_detached"},
			{"b", "help.sidebar.toggle_busy"},
			{"y", "help.sidebar.yank"},
			{"/", "help.sidebar.filter"},
			{"o", "help.sidebar.context"},
		},
	},
	{
		title: "Conversation",
		keys: []helpKey{
			{"↑/↓ · j/k", "help.conversation.move_cursor"},
			{"g / G", "help.conversation.jump"},
			{"PgUp/PgDn · Ctrl+U/D", "help.conversation.page"},
			{"y", "help.conversation.copy_selected"},
			{"Y", "help.conversation.copy_full"},
			{"Drag", "help.conversation.drag_copy"},
			{"Alt+drag", "help.conversation.native_select"},
			{"R", "help.conversation.retry"},
			{"d", "help.conversation.delete"},
			{"t", "help.conversation.timestamps"},
			{"n / N", "help.conversation.next_prev"},
			{"Ctrl+E · Enter", "help.conversation.expand"},
			{"a / r", "help.conversation.diff"},
		},
	},
	{
		title: "Input",
		keys: []helpKey{
			{"Enter", "help.input.send"},
			{"\\<Enter>", "help.input.newline_always"},
			{"Shift+Enter · Alt+Enter · Ctrl+J", "help.input.newline_terminal"},
			{"↑ on empty", "help.input.recall"},
			{"/", "help.input.palette"},
			{"/?<query>", "help.input.search"},
			{"Paste ≥ N lines", "help.input.paste"},
			{"Ctrl+P", "help.input.expand_paste"},
			{"Ctrl+G · Ctrl+⇧P", "help.input.compose"},
			{"@", "help.input.file_picker"},
		},
	},
	{
		// Slash-commands users can type after pressing `/`. Palette
		// shows them all; this tab serves as a quick-reference for
		// the newer ones that might not jump out of the flat list.
		title: "Commands",
		keys: []helpKey{
			{"/clear", "help.commands.clear"},
			{"/copy", "help.commands.copy"},
			{"/cancel", "help.commands.cancel"},
			{"/compact", "help.commands.compact"},
			{"/mode", "help.commands.mode"},
			{"/new", "help.commands.new"},
			{"/rename", "help.commands.rename"},
			{"/tools", "help.commands.tools"},
			{"/mcp", "help.commands.mcp"},
			{"/skills", "help.commands.skills"},
			{"/experts", "help.commands.agents"},
			{"/prompts", "help.commands.prompts"},
			{"/expert-packs", "help.commands.expert_packs"},
			{"/agent-blueprints", "help.commands.agent_blueprints"},
			{"/sessions", "help.commands.sessions"},
			{"/theme", "help.commands.theme"},
			{"/agent", "help.commands.agent"},
			{"/model", "help.commands.model"},
			{"/doctor", "help.commands.doctor"},
			{"/permissions", "help.commands.permissions"},
			{"/metrics", "help.commands.metrics"},
			{"/memory", "help.commands.memory"},
			{"/mouse", "help.commands.mouse"},
			{"/theme-next", "help.commands.theme_next"},
			{"/theme-prev", "help.commands.theme_prev"},
			{"/duplicate", "help.commands.duplicate"},
			{"/help", "help.commands.help"},
			{"/add", "help.commands.add"},
			{"/drop", "help.commands.drop"},
			{"/diff", "help.commands.diff"},
		},
	},
	{
		title: "Permission",
		keys: []helpKey{
			{"a / d", "help.permission.once"},
			{"s", "help.permission.session"},
			{"w", "help.permission.workspace"},
		},
	},
}

var helpTabCount = len(helpTabs)

func (m *helpModal) localizedTabTitle(title string) string {
	a := m.app
	switch title {
	case "Global":
		return a.localizer.t(msgHelpTabGlobal, nil)
	case "Sidebar":
		return a.localizer.t(msgHelpTabSidebar, nil)
	case "Conversation":
		return a.localizer.t(msgHelpTabConversation, nil)
	case "Input":
		return a.localizer.t(msgHelpTabInput, nil)
	case "Commands":
		return a.localizer.t(msgHelpTabCommands, nil)
	case "Permission":
		return a.localizer.t(msgHelpTabPermission, nil)
	default:
		return title
	}
}
