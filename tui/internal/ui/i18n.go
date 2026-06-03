package ui

import (
	"embed"
	"encoding/json"
	"fmt"
	"path/filepath"
	"sort"
	"strings"
)

//go:embed locale/*.json
var localeFiles embed.FS

type messageID string

const (
	msgPostFailureRetry              messageID = "post.failure.retry"
	msgPostFailureRetryWithError     messageID = "post.failure.retry_with_error"
	msgPostFailureAgentStarting      messageID = "post.failure.agent.starting"
	msgPostFailureAgentFailed        messageID = "post.failure.agent.failed"
	msgPostFailureAgentNotConfigured messageID = "post.failure.agent.not_configured"
	msgPostFailureAgentUnknown       messageID = "post.failure.agent.unknown"
	msgSettingsTitle                 messageID = "settings.title"
	msgSettingsTabModel              messageID = "settings.tab.model"
	msgSettingsTabAgent              messageID = "settings.tab.agent"
	msgSettingsTabTheme              messageID = "settings.tab.theme"
	msgSettingsTabTUI                messageID = "settings.tab.tui"
	msgSettingsTabLanguage           messageID = "settings.tab.language"
	msgSettingsCurrent               messageID = "settings.current"
	msgSettingsFooter                messageID = "settings.footer"
	msgLanguageCurrent               messageID = "language.current"
	msgLanguageMachine               messageID = "language.machine"
	msgLanguageNativeName            messageID = "language.native_name"
	msgLanguageEnglish               messageID = "language.english"
	msgLanguageSpanish               messageID = "language.spanish"
	msgLanguageJapanese              messageID = "language.japanese"
	msgLanguageDescription           messageID = "language.description"
	msgLanguageHint                  messageID = "language.hint"
	msgLanguageApplied               messageID = "language.applied"
	msgChromeConnectingTitle         messageID = "chrome.connecting.title"
	msgChromeConnectingStatus        messageID = "chrome.connecting.status"
	msgChromeConnectingRetry         messageID = "chrome.connecting.retry"
	msgChromeConnectionError         messageID = "chrome.connection_error"
	msgChromeBackend                 messageID = "chrome.backend"
	msgChromeWorkspace               messageID = "chrome.workspace"
	msgChromeSession                 messageID = "chrome.session"
	msgChromeModel                   messageID = "chrome.model"
	msgChromeAgent                   messageID = "chrome.agent"
	msgChromeRouting                 messageID = "chrome.routing"
	msgChromeFocus                   messageID = "chrome.focus"
	msgChromeFocusSidebar            messageID = "chrome.focus.sidebar"
	msgChromeFocusConversation       messageID = "chrome.focus.conversation"
	msgChromeFocusRightSidebar       messageID = "chrome.focus.right_sidebar"
	msgChromeFocusInput              messageID = "chrome.focus.input"
	msgChromeFocusProviderSetup      messageID = "chrome.focus.provider_setup"
	msgFooterNew                     messageID = "footer.new"
	msgFooterPane                    messageID = "footer.pane"
	msgFooterSettings                messageID = "footer.settings"
	msgFooterCommand                 messageID = "footer.command"
	msgFooterHelp                    messageID = "footer.help"
	msgFooterQuit                    messageID = "footer.quit"
	msgFooterSidebarSelect           messageID = "footer.sidebar.select"
	msgFooterSidebarOpen             messageID = "footer.sidebar.open"
	msgFooterSidebarRename           messageID = "footer.sidebar.rename"
	msgFooterSidebarDelete           messageID = "footer.sidebar.delete"
	msgFooterSidebarContext          messageID = "footer.sidebar.context"
	msgFooterSidebarChildren         messageID = "footer.sidebar.children"
	msgFooterSidebarArchive          messageID = "footer.sidebar.archive"
	msgFooterSidebarCopyID           messageID = "footer.sidebar.copy_id"
	msgFooterSidebarFilter           messageID = "footer.sidebar.filter"
	msgFooterSidebarFilterType       messageID = "footer.sidebar.filter_type"
	msgFooterSidebarApply            messageID = "footer.sidebar.apply"
	msgFooterSidebarCancel           messageID = "footer.sidebar.cancel"
	msgFooterSidebarSections         messageID = "footer.sidebar.sections"
	msgFooterSidebarToggle           messageID = "footer.sidebar.toggle"
	msgFooterConversationSelect      messageID = "footer.conversation.select"
	msgFooterConversationDetails     messageID = "footer.conversation.details"
	msgFooterConversationBottom      messageID = "footer.conversation.bottom"
	msgFooterConversationCopy        messageID = "footer.conversation.copy"
	msgFooterConversationCopyFull    messageID = "footer.conversation.copy_full"
	msgFooterConversationRetry       messageID = "footer.conversation.retry"
	msgFooterConversationDelete      messageID = "footer.conversation.delete"
	msgFooterInputSend               messageID = "footer.input.send"
	msgFooterInputNewline            messageID = "footer.input.newline"
	msgFooterInputCompose            messageID = "footer.input.compose"
	msgFooterMemoryHit               messageID = "footer.memory_hit"
	msgInputPlaceholder              messageID = "input.placeholder"
	msgLMConfigTitle                 messageID = "lm_config.title"
	msgLMConfigIntro                 messageID = "lm_config.intro"
	msgLMConfigFetching              messageID = "lm_config.fetching"
	msgLMConfigSaveFailed            messageID = "lm_config.save_failed"
	msgLMConfigSaveRetry             messageID = "lm_config.save_retry"
	msgLMConfigNoEndpoint            messageID = "lm_config.no_endpoint"
	msgLMConfigHint                  messageID = "lm_config.hint"
	msgLMConfigSaving                messageID = "lm_config.saving"
	msgLMConfigConfiguring           messageID = "lm_config.configuring"
	msgLMConfigNoPresets             messageID = "lm_config.no_presets"
	msgLMConfigProviderTitle         messageID = "lm_config.provider.title"
	msgLMConfigFilter                messageID = "lm_config.filter"
	msgLMConfigProviderMore          messageID = "lm_config.provider.more"
	msgLMConfigNoProvidersMatch      messageID = "lm_config.provider.no_match"
	msgLMConfigSelectedTitle         messageID = "lm_config.selected.title"
	msgLMConfigNoProviderSelected    messageID = "lm_config.selected.none"
	msgLMConfigApplied               messageID = "lm_config.selected.applied"
	msgLMConfigPending               messageID = "lm_config.selected.pending"
	msgLMConfigAPIKey                messageID = "lm_config.api_key"
	msgLMConfigAPIBase               messageID = "lm_config.api_base"
	msgLMConfigAuthRequired          messageID = "lm_config.auth.required"
	msgLMConfigAuthReady             messageID = "lm_config.auth.ready"
	msgLMConfigAuthenticate          messageID = "lm_config.auth.authenticate"
	msgLMConfigRefreshToken          messageID = "lm_config.auth.refresh"
	msgLMConfigLaunchingLogin        messageID = "lm_config.auth.launching"
	msgLMConfigNoKeyRequired         messageID = "lm_config.auth.no_key"
	msgLMConfigLocalCLI              messageID = "lm_config.transport.local_cli"
	msgLMConfigStatus                messageID = "lm_config.status"
	msgLMConfigModelTitle            messageID = "lm_config.model.title"
	msgLMConfigModelCandidatesTitle  messageID = "lm_config.model.candidates_title"
	msgLMConfigCheckingCatalog       messageID = "lm_config.model.checking_catalog"
	msgLMConfigOllamaNoModels        messageID = "lm_config.model.ollama_no_models"
	msgLMConfigProviderUnavailable   messageID = "lm_config.model.provider_unavailable"
	msgLMConfigNoSelectableCatalog   messageID = "lm_config.model.no_selectable_catalog"
	msgLMConfigNoModelsMatch         messageID = "lm_config.model.no_match"
	msgLMConfigTypedSnapBack         messageID = "lm_config.model.typed_snap_back"
	msgLMConfigModelMore             messageID = "lm_config.model.more"
	msgLMConfigAdvancedTitle         messageID = "lm_config.advanced.title"
	msgLMConfigAdjustHint            messageID = "lm_config.advanced.adjust_hint"
	msgLMConfigTemperature           messageID = "lm_config.advanced.temperature"
	msgLMConfigMaxOutput             messageID = "lm_config.advanced.max_output"
	msgLMConfigLoadContext           messageID = "lm_config.advanced.load_context"
	msgLMConfigThinkingBudget        messageID = "lm_config.advanced.thinking_budget"
	msgLMConfigBackendDefault        messageID = "lm_config.advanced.backend_default"
	msgLMConfigProviderDefault       messageID = "lm_config.advanced.provider_default"
	msgLMConfigLMStudioDefault       messageID = "lm_config.advanced.lm_studio_default"
	msgLMConfigDefaultDisabled       messageID = "lm_config.advanced.default_disabled"
	msgLMConfigManagedByProvider     messageID = "lm_config.advanced.managed_by_provider"
	msgLMConfigModelDetails          messageID = "lm_config.details.title"
	msgLMConfigModelName             messageID = "lm_config.details.name"
	msgLMConfigMaxContext            messageID = "lm_config.details.max_context"
	msgLMConfigRequestedContext      messageID = "lm_config.details.requested_context"
	msgLMConfigMaxContextUnknown     messageID = "lm_config.details.max_context_unknown"
	msgLMConfigMaxOutputDetail       messageID = "lm_config.details.max_output"
	msgSidebarTitle                  messageID = "sidebar.title"
	msgSidebarTitleDetached          messageID = "sidebar.title.detached"
	msgSidebarTitleBusy              messageID = "sidebar.title.busy"
	msgSidebarTitleDetachedBusy      messageID = "sidebar.title.detached_busy"
	msgSidebarTitleChildren          messageID = "sidebar.title.children"
	msgSidebarSectionCollapsed       messageID = "sidebar.section.collapsed"
	msgSidebarNoSessions             messageID = "sidebar.no_sessions"
	msgSidebarCreate                 messageID = "sidebar.create"
	msgSidebarFilter                 messageID = "sidebar.filter"
	msgSidebarFilterPrompt           messageID = "sidebar.filter_prompt"
	msgSidebarNoMatches              messageID = "sidebar.no_matches"
	msgSidebarUntitled               messageID = "sidebar.untitled"
	msgSidebarMoreAbove              messageID = "sidebar.more_above"
	msgSidebarMoreBelow              messageID = "sidebar.more_below"
	msgSidebarFiles                  messageID = "sidebar.files"
	msgSidebarAgents                 messageID = "sidebar.agents"
	msgSidebarContext                messageID = "sidebar.context"
	msgSidebarNoFiles                messageID = "sidebar.no_files"
	msgSidebarCountsActiveFirst      messageID = "sidebar.counts.active_first"
	msgSidebarCountsArchivedFirst    messageID = "sidebar.counts.archived_first"
	msgConversationTitle             messageID = "conversation.title"
	msgConversationPermissionNeeded  messageID = "conversation.permission_needed"
	msgConversationFirstPrompt       messageID = "conversation.first_prompt"
	msgConversationSidebarIntro      messageID = "conversation.sidebar_intro"
	msgConversationNew               messageID = "conversation.new"
	msgConversationRename            messageID = "conversation.rename"
	msgConversationDelete            messageID = "conversation.delete"
	msgConversationArchive           messageID = "conversation.archive"
	msgConversationArchived          messageID = "conversation.archived"
	msgConversationDetached          messageID = "conversation.detached"
	msgConversationBusy              messageID = "conversation.busy"
	msgConversationFilter            messageID = "conversation.filter"
	msgConversationAttachFile        messageID = "conversation.attach_file"
	msgConversationPick              messageID = "conversation.pick"
	msgConversationOtherThings       messageID = "conversation.other_things"
	msgConversationPickModelAgent    messageID = "conversation.pick_model_agent"
	msgConversationCommandPalette    messageID = "conversation.command_palette"
	msgConversationHelp              messageID = "conversation.help"
	msgConversationDetachPrefix      messageID = "conversation.detach_prefix"
	msgConversationReattaches        messageID = "conversation.reattaches"
	msgConversationDetachedSessions  messageID = "conversation.detached_sessions"
	msgConversationResumeMostRecent  messageID = "conversation.resume_most_recent"
	msgConversationNoMessages        messageID = "conversation.no_messages"
	msgConversationAttachWorkspace   messageID = "conversation.attach_workspace"
	msgConversationCompose           messageID = "conversation.compose"
	msgConversationSettings          messageID = "conversation.settings"
	msgConversationPickPalette       messageID = "conversation.pick_palette"
	msgConversationThinking          messageID = "conversation.thinking"
	msgPaletteCommandsTitle          messageID = "palette.commands.title"
	msgPaletteFilter                 messageID = "palette.filter"
	msgPaletteSearchHint             messageID = "palette.search_hint"
	msgPaletteNoMatches              messageID = "palette.no_matches"
	msgPaletteRunHint                messageID = "palette.run_hint"
	msgPaletteSearchTitle            messageID = "palette.search.title"
	msgPaletteQuery                  messageID = "palette.query"
	msgPaletteSearching              messageID = "palette.searching"
	msgPaletteTypeQuery              messageID = "palette.type_query"
	msgPaletteEnterSearch            messageID = "palette.enter_search"
	msgPaletteJumpHint               messageID = "palette.jump_hint"
	msgPaletteCloseHint              messageID = "palette.close_hint"
	msgHelpTitle                     messageID = "help.title"
	msgHelpHint                      messageID = "help.hint"
	msgHelpTabGlobal                 messageID = "help.tab.global"
	msgHelpTabSidebar                messageID = "help.tab.sidebar"
	msgHelpTabConversation           messageID = "help.tab.conversation"
	msgHelpTabInput                  messageID = "help.tab.input"
	msgHelpTabCommands               messageID = "help.tab.commands"
	msgHelpTabPermission             messageID = "help.tab.permission"
	msgSettingsUnset                 messageID = "settings.unset"
	msgSettingsModelChange           messageID = "settings.model.change"
	msgSettingsModelChangeDesc       messageID = "settings.model.change_desc"
	msgSettingsModelHint             messageID = "settings.model.hint"
	msgSettingsLoading               messageID = "settings.loading"
	msgSettingsTUIDisplayPrefs       messageID = "settings.tui.display_prefs"
	msgSettingsTUIRuntimeState       messageID = "settings.tui.runtime_state"
	msgSettingsTUIBackendURL         messageID = "settings.tui.backend_url"
	msgSettingsTUIVoiceCmd           messageID = "settings.tui.voice_cmd"
	msgSettingsTUIVoiceUnset         messageID = "settings.tui.voice_unset"
	msgSettingsTUITheme              messageID = "settings.tui.theme"
	msgSettingsTUIAltScreen          messageID = "settings.tui.alt_screen"
	msgSettingsTUIAdjustHint         messageID = "settings.tui.adjust_hint"
	msgSettingsTUILayoutContext      messageID = "settings.tui.layout.context"
	msgSettingsTUILayoutContextHint  messageID = "settings.tui.layout.context_hint"
	msgSettingsTUILayoutEditor       messageID = "settings.tui.layout.editor"
	msgSettingsTUILayoutEditorHint   messageID = "settings.tui.layout.editor_hint"
	msgSettingsTUILayoutOpen         messageID = "settings.tui.layout.open"
	msgSettingsTUILayoutLeft         messageID = "settings.tui.layout.left"
	msgSettingsTUILayoutRight        messageID = "settings.tui.layout.right"
	msgSettingsTUILayoutHidden       messageID = "settings.tui.layout.hidden"
	msgSettingsOn                    messageID = "settings.value.on"
	msgSettingsOff                   messageID = "settings.value.off"
	msgQuitTitle                     messageID = "quit.title"
	msgQuitHint                      messageID = "quit.hint"
	msgQuitClose                     messageID = "quit.close"
	msgQuitNo                        messageID = "quit.no"
	msgQuitDetach                    messageID = "quit.detach"
	msgQuitKeyHint                   messageID = "quit.key_hint"
)

type languageOption struct {
	Locale      string
	NativeName  string
	EnglishName string
	Source      string
	Direction   string
	Machine     bool
}

// Localizer resolves user-visible strings from locale catalog files.
type Localizer struct {
	locale  string
	catalog map[string]string
}

func newLocalizer(locale string) Localizer {
	normalized := normalizeLocale(locale)
	catalog, ok := loadLocaleCatalog(normalized)
	if !ok && normalized != "en" {
		catalog, ok = loadLocaleCatalog("en")
		normalized = "en"
	}
	if !ok {
		catalog = map[string]string{}
	}
	return Localizer{locale: normalized, catalog: catalog}
}

// SetLocale switches the active UI locale immediately.
func (a *App) SetLocale(locale string) {
	a.localizer = newLocalizer(locale)
	a.refreshLocalizedPlaceholders()
}

// Locale returns the normalized active locale code.
func (a *App) Locale() string {
	return a.localizer.locale
}

func (a *App) refreshLocalizedPlaceholders() {
	a.input.Placeholder = a.localizer.t(msgInputPlaceholder, nil)
}

func (l Localizer) languageOptionLabel(opt languageOption) string {
	label := opt.NativeName
	if label == "" {
		label = opt.Locale
	}
	if opt.Machine {
		label += " (" + l.t(msgLanguageMachine, nil) + ")"
	}
	return label
}

func availableLanguageOptions() []languageOption {
	entries, err := localeFiles.ReadDir("locale")
	if err != nil {
		return []languageOption{{Locale: "en", NativeName: "English", EnglishName: "English"}}
	}
	out := make([]languageOption, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
			continue
		}
		locale := normalizeLocale(strings.TrimSuffix(entry.Name(), filepath.Ext(entry.Name())))
		catalog, ok := loadLocaleCatalog(locale)
		if !ok {
			continue
		}
		source := strings.TrimSpace(catalog["__meta.translation_source"])
		opt := languageOption{
			Locale:      locale,
			NativeName:  firstNonEmpty(catalog["__meta.native_name"], catalog[string(msgLanguageNativeName)], locale),
			EnglishName: firstNonEmpty(catalog["__meta.english_name"], locale),
			Source:      source,
			Direction:   firstNonEmpty(catalog["__meta.text_direction"], "ltr"),
			Machine:     strings.Contains(strings.ToLower(source), "machine"),
		}
		out = append(out, opt)
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Locale == "en" {
			return true
		}
		if out[j].Locale == "en" {
			return false
		}
		return out[i].Locale < out[j].Locale
	})
	if len(out) == 0 {
		return []languageOption{{Locale: "en", NativeName: "English", EnglishName: "English"}}
	}
	return out
}

func languageIndex(locale string) int {
	normalized := normalizeLocale(locale)
	for i, opt := range availableLanguageOptions() {
		if opt.Locale == normalized {
			return i
		}
	}
	return 0
}

func activeLanguageOption(locale string) languageOption {
	options := availableLanguageOptions()
	idx := languageIndex(locale)
	if idx < 0 || idx >= len(options) {
		idx = 0
	}
	return options[idx]
}

func (l Localizer) activeLanguageLabel() string {
	return l.languageOptionLabel(activeLanguageOption(l.locale))
}

func normalizeLocale(locale string) string {
	locale = strings.TrimSpace(strings.ToLower(locale))
	if locale == "" {
		return "en"
	}
	locale = strings.ReplaceAll(locale, "_", "-")
	if idx := strings.Index(locale, "-"); idx > 0 {
		return locale[:idx]
	}
	return locale
}

func loadLocaleCatalog(locale string) (map[string]string, bool) {
	body, err := localeFiles.ReadFile("locale/" + locale + ".json")
	if err != nil {
		return nil, false
	}
	var catalog map[string]string
	if err := json.Unmarshal(body, &catalog); err != nil {
		return nil, false
	}
	return catalog, true
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func (l Localizer) t(id messageID, values map[string]string) string {
	text := l.catalog[string(id)]
	if text == "" && l.locale != "en" {
		if fallback, ok := loadLocaleCatalog("en"); ok {
			text = fallback[string(id)]
		}
	}
	if text == "" {
		text = string(id)
	}
	for key, value := range values {
		text = strings.ReplaceAll(text, "{{"+key+"}}", value)
	}
	return text
}

func (l Localizer) tf(id messageID, values map[string]any) string {
	stringValues := make(map[string]string, len(values))
	for key, value := range values {
		stringValues[key] = fmt.Sprint(value)
	}
	return l.t(id, stringValues)
}
