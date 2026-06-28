package ui

// execution_turns.go buckets execution-timeline events into per-turn projections.

import (
	"sort"
	"strings"
)

type executionTimelineTurnBucket struct {
	turnID string
	events []executionTimelineEvent
	first  int
}

func projectExecutionTimelineTurns(events []executionTimelineEvent) []executionProjectedTurn {
	if len(events) == 0 {
		return nil
	}
	buckets, order := bucketExecutionTimelineEventsByTurn(events)
	turns := make([]executionProjectedTurn, 0, len(order))
	for _, key := range order {
		nodes := projectExecutionTimeline(buckets[key].events)
		if len(nodes) == 0 {
			continue
		}
		turnID := buckets[key].turnID
		if turnID == "__unscoped__" {
			turnID = ""
		}
		turns = append(turns, executionProjectedTurn{TurnID: turnID, Nodes: nodes})
	}
	return turns
}

func bucketExecutionTimelineEventsByTurn(events []executionTimelineEvent) (map[string]*executionTimelineTurnBucket, []string) {
	buckets := map[string]*executionTimelineTurnBucket{}
	var order []string
	for _, event := range events {
		if event.Type == "turn.user_message" {
			continue
		}
		key := strings.TrimSpace(event.TurnID)
		if key == "" {
			key = "__unscoped__"
		}
		if buckets[key] == nil {
			buckets[key] = &executionTimelineTurnBucket{turnID: key, first: event.Sequence}
			order = append(order, key)
		}
		buckets[key].events = append(buckets[key].events, event)
		if event.Sequence < buckets[key].first {
			buckets[key].first = event.Sequence
		}
	}
	sort.SliceStable(order, func(i, j int) bool {
		return buckets[order[i]].first < buckets[order[j]].first
	})
	return buckets, order
}
