package ui

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

func writeJSONForTest(t *testing.T, w http.ResponseWriter, v any) {
	t.Helper()
	if err := json.NewEncoder(w).Encode(v); err != nil {
		t.Fatalf("encode JSON: %v", err)
	}
}

func catalogItemsTextForTest(items []catalogItem) string {
	var b strings.Builder
	for _, item := range items {
		b.WriteString(item.id)
		b.WriteByte('\n')
		b.WriteString(item.title)
		b.WriteByte('\n')
		b.WriteString(item.inlineDesc)
		b.WriteByte('\n')
		b.WriteString(item.desc)
		b.WriteByte('\n')
		b.WriteString(item.statusTag)
		b.WriteByte('\n')
	}
	return b.String()
}
