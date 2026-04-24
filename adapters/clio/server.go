package clio

// Placeholder — the GACT v0.1 HTTP server exposed by this adapter.
//
// TODO (CLIO-BBBBBBBBBB Phase 1):
//   - type Server struct { client *Client; sessions SessionStore }
//   - func (s *Server) Handler() http.Handler
//   - /v1/health, /v1/capabilities, /v1/sessions CRUD, /v1/sessions/
//     {id}/messages POST, /v1/sessions/{id}/events GET (SSE),
//     /v1/catalog/{agents,tools}, /v1/metrics
//
// The bulk of the work sits in translate.go (GACT <-> CLIO event
// conversion); this file just wires the HTTP mux.
