package ui

// catalog_tool_schema.go summarizes JSON-schema sections of a tool detail into displayable rows.

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
)

func appendJSONMapSection(rows []string, label string, payload map[string]any) []string {
	if len(payload) == 0 {
		return rows
	}
	if body, err := json.MarshalIndent(payload, "", "  "); err == nil {
		return append(rows, "", label+":", string(body))
	}
	return append(rows, "", label+":", fmt.Sprint(payload))
}

func appendSchemaSection(rows []string, label string, payload map[string]any) []string {
	if len(payload) == 0 {
		return rows
	}
	summary := summarizeJSONSchema(payload)
	if len(summary) == 0 {
		return appendJSONMapSection(rows, label, payload)
	}
	return appendDetailSection(rows, label, detailField{"", strings.Join(summary, "\n")})
}

func summarizeJSONSchema(schema map[string]any) []string {
	rows := make([]string, 0, 8)
	schemaType := jsonSchemaType(schema)
	if schemaType != "" {
		rows = append(rows, "type: "+schemaType)
	}
	required := requiredFieldSet(schema["required"])
	if len(required) > 0 {
		rows = append(rows, "required: "+strings.Join(sortedMapKeys(required), ", "))
	}
	if disabledAdditionalProperties(schema["additionalProperties"]) {
		rows = append(rows, "additional_properties: disabled")
	}

	props, ok := schema["properties"].(map[string]any)
	if !ok || len(props) == 0 {
		if desc := strings.TrimSpace(stringFromAny(schema["description"])); desc != "" {
			rows = append(rows, "description: "+textutil.Truncate(desc, 120))
		}
		if enum := schemaEnumSummary(schema["enum"]); enum != "" {
			rows = append(rows, "enum: "+enum)
		}
		return rows
	}

	rows = append(rows, "fields:")
	for _, name := range sortedAnyMapKeys(props) {
		prop, _ := props[name].(map[string]any)
		rows = append(rows, "- "+name+" — "+jsonSchemaPropertySummary(prop, required[name]))
	}
	return rows
}

func jsonSchemaPropertySummary(prop map[string]any, required bool) string {
	parts := make([]string, 0, 5)
	typ := jsonSchemaType(prop)
	if typ == "" {
		typ = "value"
	}
	parts = append(parts, typ)
	if required {
		parts = append(parts, "required")
	}
	if nested, ok := prop["properties"].(map[string]any); ok && len(nested) > 0 {
		parts = append(parts, "fields: "+strings.Join(sortedAnyMapKeys(nested), ", "))
	}
	if items, ok := prop["items"].(map[string]any); ok {
		if itemType := jsonSchemaType(items); itemType != "" {
			parts = append(parts, "items: "+itemType)
		}
	}
	if enum := schemaEnumSummary(prop["enum"]); enum != "" {
		parts = append(parts, "enum: "+enum)
	}
	if desc := strings.TrimSpace(stringFromAny(prop["description"])); desc != "" {
		parts = append(parts, textutil.Truncate(desc, 96))
	}
	return strings.Join(parts, " · ")
}

func jsonSchemaType(schema map[string]any) string {
	if schema == nil {
		return ""
	}
	switch v := schema["type"].(type) {
	case string:
		return strings.TrimSpace(v)
	case []any:
		types := make([]string, 0, len(v))
		for _, item := range v {
			if s := strings.TrimSpace(stringFromAny(item)); s != "" {
				types = append(types, s)
			}
		}
		return strings.Join(types, " | ")
	case []string:
		return strings.Join(v, " | ")
	default:
		return ""
	}
}

func requiredFieldSet(value any) map[string]bool {
	out := map[string]bool{}
	switch v := value.(type) {
	case []any:
		for _, item := range v {
			if s := strings.TrimSpace(stringFromAny(item)); s != "" {
				out[s] = true
			}
		}
	case []string:
		for _, item := range v {
			if s := strings.TrimSpace(item); s != "" {
				out[s] = true
			}
		}
	}
	return out
}

func disabledAdditionalProperties(value any) bool {
	v, ok := value.(bool)
	return ok && !v
}

func sortedMapKeys(values map[string]bool) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func sortedAnyMapKeys(values map[string]any) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func schemaEnumSummary(value any) string {
	var values []string
	switch v := value.(type) {
	case []any:
		values = make([]string, 0, len(v))
		for _, item := range v {
			values = append(values, stringFromAny(item))
		}
	case []string:
		values = append(values, v...)
	}
	if len(values) == 0 {
		return ""
	}
	for i, value := range values {
		values[i] = textutil.Truncate(value, 28)
	}
	if len(values) > 5 {
		return strings.Join(values[:5], ", ") + fmt.Sprintf(" (+%d more)", len(values)-5)
	}
	return strings.Join(values, ", ")
}

func stringFromAny(value any) string {
	switch v := value.(type) {
	case string:
		return v
	case fmt.Stringer:
		return v.String()
	case nil:
		return ""
	default:
		return fmt.Sprint(v)
	}
}

func formatMcpResourceContents(contents []gact.McpContent) string {
	if len(contents) == 0 {
		return "(resource returned no content)"
	}
	rows := make([]string, 0, len(contents)*5)
	for i, content := range contents {
		title := content.URI
		if title == "" {
			title = fmt.Sprintf("content[%d]", i)
		}
		fields := []detailField{{"uri", title}}
		fields = append(fields, detailField{"media type", content.MimeType})
		if content.Text != "" {
			fields = append(fields, detailField{"text", content.Text})
		}
		if content.Data != "" {
			fields = append(fields, detailField{"base64 data", fmt.Sprintf("%d bytes encoded", len(content.Data))})
		}
		rows = appendDetailSection(rows, "Resource content", fields...)
	}
	return strings.Join(rows, "\n")
}
