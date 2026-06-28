package ui

// detail_sections.go provides detail-section row builders for fields, bodies, and JSON payloads.

import (
	"encoding/json"
	"fmt"
	"strings"
)

type detailField struct {
	label string
	value string
}

func appendDetailSection(rows []string, title string, fields ...detailField) []string {
	if len(rows) > 0 {
		rows = append(rows, "")
	}
	rows = append(rows, title)
	for _, field := range fields {
		value := strings.TrimSpace(field.value)
		if value == "" {
			continue
		}
		if strings.TrimSpace(field.label) == "" {
			rows = append(rows, detailBodyRows(value)...)
			continue
		}
		rows = append(rows, detailFieldRows(field.label, value)...)
	}
	return rows
}

func detailFieldRows(label string, value string) []string {
	label = strings.TrimSpace(label)
	if !strings.Contains(value, "\n") && !strings.HasPrefix(strings.TrimSpace(value), "- ") {
		return []string{"  " + label + ": " + value}
	}
	rows := []string{"  " + label + ":"}
	rows = append(rows, detailBodyRows(value)...)
	return rows
}

func detailBodyRows(value string) []string {
	lines := strings.Split(strings.TrimSpace(value), "\n")
	rows := make([]string, 0, len(lines))
	for _, line := range lines {
		rows = append(rows, "    "+line)
	}
	return rows
}

func appendJSONSection(rows []string, label string, payload map[string]any) []string {
	if len(payload) == 0 {
		return rows
	}
	if body, err := json.MarshalIndent(payload, "", "  "); err == nil {
		return append(rows, detailFieldRows(label, string(body))...)
	}
	return append(rows, detailFieldRows(label, fmt.Sprint(payload))...)
}

func appendAnyJSONSection(rows []string, label string, payload any) []string {
	if payload == nil {
		return rows
	}
	if body, err := json.MarshalIndent(payload, "", "  "); err == nil {
		return append(rows, detailFieldRows(label, string(body))...)
	}
	return append(rows, detailFieldRows(label, fmt.Sprint(payload))...)
}
