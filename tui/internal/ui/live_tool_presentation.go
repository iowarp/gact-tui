package ui

import (
	"encoding/json"
	"unicode/utf8"

	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func (c *conversationComponent) applyToolPresentationDelta(e client.SSEEvent) {
	payload, ok := e.Payload["payload"].(map[string]any)
	if !ok {
		return
	}
	var delta struct {
		CallID  string `json:"call_id"`
		BlockID string `json:"block_id"`
		Offset  int    `json:"offset"`
		Text    string `json:"text"`
	}
	data, err := json.Marshal(payload)
	if err != nil || json.Unmarshal(data, &delta) != nil {
		return
	}
	for i := range c.messages {
		for j := range c.messages[i].Parts {
			part := &c.messages[i].Parts[j]
			if part.CallID != delta.CallID || part.Presentation == nil {
				continue
			}
			for k := range part.Presentation.Blocks {
				block := &part.Presentation.Blocks[k]
				if block.ID == delta.BlockID && utf8.RuneCountInString(block.Text) == delta.Offset {
					block.Text += delta.Text
					c.bumpMessageEpoch(c.messages[i].ID)
					return
				}
			}
		}
	}
}
