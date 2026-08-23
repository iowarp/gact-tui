package ui

// conversationComponent: the transcript viewport, selection, copy, and render-cache domain.

import "github.com/JaimeCernuda/gact-tui/contract/gact"

// conversationComponent owns the transcript domain: the loaded message list,
// viewport scroll/selection cursor, per-message render cache, and the
// conversation action menu. The hit-target registry lives on the interaction
// component (a.interaction). It embeds appConversationState (so the
// component's own methods read c.messages/c.scrollOffset/… directly via
// promotion), folds in the conversationActions menu, and holds a back-reference
// to the root App for shared services (client, theme, dimensions, focus,
// cross-domain components). Replaces the formerly App-embedded
// appConversationState; external callers reach it via a.conversation.<field>.
type conversationComponent struct {
	app *App
	appConversationState
	// actions is the conversation row action menu, opened from a rendered
	// transcript part's secondary-click target or `m` in body focus.
	actions conversationActionsModal
}

// appConversationState groups transcript viewport, selection, copy, and render
// cache state. It is embedded in conversationComponent so render and input
// handlers retain direct field access while the root model has a clearer state
// map.
type appConversationState struct {
	// Loaded messages for the currently selected session.
	messages       []gact.Message
	scrollOffset   int // 0 = stick to bottom; >0 = scrolled up
	stickyToBottom bool

	// searchHitMessageID marks the message that was jumped to from the
	// palette ?search results. The render layer draws a gutter marker
	// on that row so users can spot their hit. Cleared on the next
	// action.
	searchHitMessageID string

	// bodySelMsgIdx is the body-focus message cursor. -1 means no
	// selection; n/N walk it forward/backward.
	bodySelMsgIdx int

	// bodySelPartIdx is the body cursor's part index within the selected
	// message's addressable parts. -1 means auto.
	bodySelPartIdx int

	// pendingPartScroll is set by cursor movement handlers. On the next
	// render pass, renderBody adjusts scrollOffset so the selected block
	// stays in view, then clears this flag.
	pendingPartScroll bool

	// conversationRenderCache keeps expensive per-message render output
	// across frames. Scrolling, mouse movement, and footer updates should
	// not re-render hundreds of unchanged CLIO semantic events.
	conversationRenderCache    map[uint64]conversationRenderCacheEntry
	conversationRenderRevision uint64

	// msgRenderEpoch is a per-message content version. It is bumped only
	// when a message's render-affecting content actually changes (the five
	// SSE mutation handlers in live_message_parts.go / live_message_events.go
	// — see bumpMessageEpoch). The render cache keys on this epoch instead of
	// deep-hashing every part's content each frame, so a warm re-render is
	// O(messages) rather than O(total content). Whole-list swaps reset it via
	// invalidateConversationRenderCache (the revision bump already namespaces
	// keys, so the reset is purely to bound memory across sessions).
	msgRenderEpoch map[string]uint64
}
