package ui

// execution_observation_line_model.go classifies execution observation lines (text/tabular) for rendering.

import "strings"

type executionObservationLineKind int

const (
	executionObservationLinePlain executionObservationLineKind = iota
	executionObservationLineAdded
	executionObservationLineRemoved
	executionObservationLineTable
	executionObservationLineAffordance
)

func classifyExecutionObservationLine(line string) executionObservationLineKind {
	trimmed := strings.TrimSpace(line)
	switch {
	case strings.HasPrefix(trimmed, "+ "):
		return executionObservationLineAdded
	case strings.HasPrefix(trimmed, "- "):
		return executionObservationLineRemoved
	case strings.HasPrefix(trimmed, "Ctrl+E"):
		return executionObservationLineAffordance
	case executionObservationLineLooksTabular(trimmed):
		return executionObservationLineTable
	default:
		return executionObservationLinePlain
	}
}

func executionObservationLineLooksTabular(trimmed string) bool {
	if trimmed == "" {
		return false
	}
	if strings.Contains(trimmed, "|") {
		return true
	}
	if strings.Count(trimmed, ",") < 2 {
		return false
	}
	fields := strings.Split(trimmed, ",")
	nonEmpty := 0
	for _, field := range fields {
		if strings.TrimSpace(field) != "" {
			nonEmpty++
		}
	}
	return nonEmpty >= 3
}
