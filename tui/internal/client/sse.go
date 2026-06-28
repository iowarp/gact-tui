package client

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// SSEEvent is a single decoded SSE event.
type SSEEvent struct {
	ID      string         // SSE id: line; empty if absent
	Type    string         // SSE event: line; mirrors data.type
	Payload map[string]any // decoded JSON of data:
	Raw     []byte         // raw data: line for callers that want it
}

// SeqID returns the parsed numeric ID, or 0 if absent or non-numeric.
func (e SSEEvent) SeqID() uint64 {
	if e.ID == "" {
		return 0
	}
	n, _ := strconv.ParseUint(e.ID, 10, 64)
	return n
}

// EventStreamScope selects which stream to subscribe to.
type EventStreamScope struct {
	WorkspaceID string // workspace-scoped stream (use this OR SessionID)
	SessionID   string // session-scoped stream
	LastEventID uint64 // resume from this ID (exclusive)
}

func (s EventStreamScope) path() string {
	if s.SessionID != "" {
		return "/v1/sessions/" + url.PathEscape(s.SessionID) + "/events"
	}
	if s.WorkspaceID != "" {
		q := url.Values{}
		q.Set("workspace_id", s.WorkspaceID)
		return "/v1/events?" + q.Encode()
	}
	return "/v1/events"
}

// StreamEvents opens an SSE stream and returns a channel of events. The
// channel closes when the connection ends (clean close, error, or ctx cancel).
// Errors during read are surfaced through the returned error channel.
//
// The caller is responsible for reconnecting. Use the LastEventID from the
// last event seen to resume.
func (c *Client) StreamEvents(ctx context.Context, scope EventStreamScope) (<-chan SSEEvent, <-chan error, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+scope.path(), nil)
	if err != nil {
		return nil, nil, err
	}
	req.Header.Set("Accept", "text/event-stream")
	if scope.LastEventID > 0 {
		req.Header.Set("Last-Event-ID", strconv.FormatUint(scope.LastEventID, 10))
	}
	if c.bearer != "" {
		req.Header.Set("Authorization", "Bearer "+c.bearer)
	}

	// Use a dedicated client without read timeout for long-lived SSE.
	streamClient := &http.Client{Timeout: 0, Transport: c.httpClient.Transport}
	resp, err := streamClient.Do(req)
	if err != nil {
		return nil, nil, fmt.Errorf("connect: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		return nil, nil, fmt.Errorf("sse status %d: %s", resp.StatusCode, body)
	}

	events := make(chan SSEEvent, 64)
	errs := make(chan error, 1)

	go func() {
		defer resp.Body.Close()
		defer close(events)
		defer close(errs)

		rdr := bufio.NewReader(resp.Body)
		var current SSEEvent
		for {
			line, err := rdr.ReadString('\n')
			if err != nil {
				if err != io.EOF && ctx.Err() == nil {
					errs <- err
				}
				return
			}
			// SSE wire spec uses CRLF, but some servers emit LF only.
			// Trim both so the blank-line dispatch + prefix matches
			// work regardless of which the upstream picks.
			line = strings.TrimRight(line, "\r\n")
			if line == "" {
				// dispatch
				if current.Raw != nil {
					select {
					case events <- current:
					case <-ctx.Done():
						return
					}
				}
				current = SSEEvent{}
				continue
			}
			switch {
			case strings.HasPrefix(line, "id: "):
				current.ID = strings.TrimPrefix(line, "id: ")
			case strings.HasPrefix(line, "event: "):
				current.Type = strings.TrimPrefix(line, "event: ")
			case strings.HasPrefix(line, "data: "):
				raw := []byte(strings.TrimPrefix(line, "data: "))
				current.Raw = raw
				var d map[string]any
				if err := json.Unmarshal(raw, &d); err == nil {
					current.Payload = d
					if current.Type == "" {
						if t, ok := d["type"].(string); ok {
							current.Type = t
						}
					}
				}
			case strings.HasPrefix(line, ":"):
				// SSE comment line; ignore.
			}
		}
	}()

	_ = time.Second // keep import for future per-event timing if needed
	return events, errs, nil
}
