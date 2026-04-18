package server

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// ContractVersion is the GACT contract version this emulator implements.
const ContractVersion = "0.1"

// EmulatorVersion is the emulator binary's own version (SemVer).
const EmulatorVersion = "0.1.0"

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(body)
}

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
