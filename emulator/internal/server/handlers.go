package server

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/internal/store"
	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// ContractVersion is the GACT contract version this emulator implements.
const ContractVersion = "0.1"

// EmulatorVersion is the emulator binary's own version (SemVer).
const EmulatorVersion = "0.1.0"

// --- Encoding helpers -------------------------------------------------------

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(body)
}

// writeError responds with the standard SPEC §6.0 error envelope.
func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, gact.Error{Error: gact.ErrorBody{Code: code, Message: message}})
}

// writeStoreError maps a store-layer error onto an appropriate HTTP status.
func writeStoreError(w http.ResponseWriter, err error, notFoundCode, validationCode string) {
	switch {
	case errors.Is(err, store.ErrNotFound):
		writeError(w, http.StatusNotFound, notFoundCode, err.Error())
	case errors.Is(err, store.ErrAlreadyExists):
		writeError(w, http.StatusConflict, "already_exists", err.Error())
	case errors.Is(err, store.ErrInvalidArg):
		writeError(w, http.StatusBadRequest, validationCode, err.Error())
	default:
		writeError(w, http.StatusInternalServerError, "internal_error", err.Error())
	}
}

// decodeJSON parses the request body into v. Returns true on success;
// otherwise it has already written a 400 and the caller should return.
// Body may be empty for endpoints whose request bodies are optional —
// pass allowEmpty=true in that case.
func decodeJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields() // strict — vendor extensions go in metadata or under /ext/
	if err := dec.Decode(v); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_body", fmt.Sprintf("decode: %v", err))
		return false
	}
	return true
}

// decodeJSONOptional is like decodeJSON but treats EOF as "no body sent" and
// returns true with v left at its zero value.
func decodeJSONOptional(w http.ResponseWriter, r *http.Request, v any) bool {
	if r.ContentLength == 0 {
		return true
	}
	return decodeJSON(w, r, v)
}

// --- §3 health + capabilities ----------------------------------------------

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, gact.HealthResponse{
		Healthy: true,
		UptimeS: int(time.Since(s.started).Seconds()),
	})
}

func (s *Server) handleCapabilities(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, gact.Capabilities{
		ContractVersion: ContractVersion,
		Backend: gact.BackendInfo{
			Name:     "gact-emulator",
			Version:  EmulatorVersion,
			Vendor:   "gact",
			Homepage: "https://github.com/JaimeCernuda/gact-tui",
		},
		Capabilities: gact.CapabilityFlags{
			Workspaces:        true,
			Sessions:          true,
			Subagents:         true,
			MCP:               true,
			LSP:               false,
			Files:             true,
			Diffs:             true,
			Permissions:       true,
			Providers:         true,
			Commands:          true,
			Voice:             false,
			ScheduledSessions: false,
			Metrics:           true,
			SessionBranching:  true,
			SessionSharing:    false,
			SessionExport:     true,
			CostTracking:      true,
			ThinkingBlocks:    true,
			EditModes:         false,
			PlanMode:          false,
			SearchMessages:    true,
			AgentWrite:        false,
			SkillsExtraction:  false,
		},
		Transports: gact.TransportFlags{
			EventsSSE:       true,
			EventsWebSocket: false,
		},
		Auth: gact.AuthInfo{
			Schemes: []string{"trust_socket"},
			Current: "trust_socket",
		},
		Extensions: []gact.Extension{},
	})
}
