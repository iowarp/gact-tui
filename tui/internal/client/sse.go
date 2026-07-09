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

		sc := newSSEScanner(resp.Body)
		for {
			ev, err := sc.next()
			if err != nil {
				if err != io.EOF && ctx.Err() == nil {
					errs <- err
				}
				return
			}
			select {
			case events <- ev:
			case <-ctx.Done():
				return
			}
		}
	}()

	return events, errs, nil
}

// sseScanner decodes a Server-Sent Events byte stream into SSEEvents using the
// WHATWG field-parsing rules (https://html.spec.whatwg.org/#event-stream):
// each line is split at the first colon into a field name and value, one
// optional leading space is stripped from the value, and consecutive `data`
// fields are accumulated with `\n` joins. A blank line dispatches the buffered
// event; comment lines (leading colon) and unknown fields are ignored. This
// replaces the earlier prefix-with-mandatory-space parser that also overwrote
// (rather than accumulated) multi-line data.
type sseScanner struct {
	r        *bufio.Reader
	current  SSEEvent
	data     strings.Builder
	haveData bool
}

func newSSEScanner(r io.Reader) *sseScanner {
	return &sseScanner{r: bufio.NewReader(r)}
}

// next returns the next decoded event, or io.EOF when the stream ends. A final
// event without a terminating blank line is discarded, per the SSE spec.
func (s *sseScanner) next() (SSEEvent, error) {
	for {
		line, err := s.r.ReadString('\n')
		if err != nil {
			// A partial final line (returned alongside io.EOF) is
			// incomplete and discarded; any other read error is fatal.
			if err == io.EOF {
				return SSEEvent{}, io.EOF
			}
			return SSEEvent{}, err
		}
		// The SSE wire spec uses CRLF, but some servers emit LF only.
		// Strip both so the blank-line dispatch works either way.
		line = strings.TrimRight(line, "\r\n")
		if line == "" {
			if ev, ok := s.dispatch(); ok {
				return ev, nil
			}
			continue
		}
		if strings.HasPrefix(line, ":") {
			// Comment line; ignore.
			continue
		}
		field, value := splitSSEField(line)
		switch field {
		case "id":
			s.current.ID = value
		case "event":
			s.current.Type = value
		case "data":
			s.data.WriteString(value)
			s.data.WriteByte('\n')
			s.haveData = true
		default:
			// Unknown field (e.g. retry, or vendor extensions); ignore.
		}
	}
}

// dispatch finalizes the buffered event. It reports ok=false for an event that
// accumulated no `data` field (e.g. a comment-only or metadata-only block),
// matching the SSE spec's "if the data buffer is empty, do not dispatch" rule.
func (s *sseScanner) dispatch() (SSEEvent, bool) {
	if !s.haveData {
		s.reset()
		return SSEEvent{}, false
	}
	// The accumulator appends a trailing newline after every data line; the
	// SSE spec drops the last one before dispatch.
	raw := strings.TrimSuffix(s.data.String(), "\n")
	ev := s.current
	ev.Raw = []byte(raw)
	var d map[string]any
	if err := json.Unmarshal([]byte(raw), &d); err == nil {
		ev.Payload = d
		if ev.Type == "" {
			if t, ok := d["type"].(string); ok {
				ev.Type = t
			}
		}
	}
	s.reset()
	return ev, true
}

func (s *sseScanner) reset() {
	s.current = SSEEvent{}
	s.data.Reset()
	s.haveData = false
}

// splitSSEField splits an SSE line into its field name and value. If the line
// contains a colon, the field is the text before it and the value the text
// after, with one optional leading space removed. A line with no colon is a
// field name with an empty value.
func splitSSEField(line string) (field, value string) {
	if i := strings.IndexByte(line, ':'); i >= 0 {
		field = line[:i]
		value = line[i+1:]
		if len(value) > 0 && value[0] == ' ' {
			value = value[1:]
		}
		return field, value
	}
	return line, ""
}
