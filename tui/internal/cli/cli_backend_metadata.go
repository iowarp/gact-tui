package cli

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"reflect"
	"strings"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// runCapabilities prints the backend's contract version, identity, and
// capability flag matrix. Lets shell scripts feature-detect before
// calling endpoints (e.g. skip `gact undo` if `session_branching` is
// off). The TUI Connect screen already calls this on startup; this
// just exposes it from the shell.
func runCapabilities(args []string) int {
	var format *string
	cc, _, code := newCmdCtx("capabilities", args, withFlags(func(fs *flag.FlagSet) {
		format = fs.String("format", "text", "text | json")
	}))
	if cc == nil {
		return code
	}
	if *format != "text" && *format != "json" {
		fmt.Fprintf(os.Stderr, "gact capabilities: unknown format %q\n", *format)
		return 2
	}
	c := cc.client
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	caps, err := c.Capabilities(ctx)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact capabilities: %v\n", err)
		return 1
	}
	if *format == "json" {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		_ = enc.Encode(caps)
		return 0
	}
	fmt.Printf("contract_version: %s\n", caps.ContractVersion)
	fmt.Printf("backend:          %s %s (%s)\n", caps.Backend.Name, caps.Backend.Version, caps.Backend.Vendor)
	if caps.Backend.Homepage != "" {
		fmt.Printf("homepage:         %s\n", caps.Backend.Homepage)
	}
	fmt.Printf("transports:       sse=%t websocket=%t\n", caps.Transports.EventsSSE, caps.Transports.EventsWebSocket)
	if len(caps.Auth.Schemes) > 0 {
		fmt.Printf("auth:             %s (current: %s)\n", strings.Join(caps.Auth.Schemes, ","), caps.Auth.Current)
	}
	fmt.Println("capabilities:")
	for _, f := range capabilityFlagTextRows(caps.Capabilities) {
		mark := "·"
		if f.on {
			mark = "✓"
		}
		fmt.Printf("  %s %s\n", mark, f.name)
	}
	for _, e := range caps.Extensions {
		fmt.Printf("extension:        %s %s %s\n", e.ID, e.Version, e.Docs)
	}
	return 0
}

type capabilityFlagTextRow struct {
	name string
	on   bool
}

func capabilityFlagTextRows(flags gact.CapabilityFlags) []capabilityFlagTextRow {
	value := reflect.ValueOf(flags)
	typ := value.Type()
	rows := make([]capabilityFlagTextRow, 0, typ.NumField())
	for i := 0; i < typ.NumField(); i++ {
		field := typ.Field(i)
		name := strings.Split(field.Tag.Get("json"), ",")[0]
		if name == "" || name == "-" {
			continue
		}
		rows = append(rows, capabilityFlagTextRow{
			name: name,
			on:   capabilityFlagValueEnabled(value.Field(i)),
		})
	}
	return rows
}

func capabilityFlagValueEnabled(value reflect.Value) bool {
	switch value.Kind() {
	case reflect.Bool:
		return value.Bool()
	case reflect.String:
		return strings.TrimSpace(value.String()) != "" && value.String() != "none"
	case reflect.Map, reflect.Slice, reflect.Array:
		return value.Len() > 0
	default:
		return false
	}
}

// runAgentShow is the SPEC §6.5 "agent metadata lookup" command that
// the original `gact agent` family exposed. OOOOOOOOO1 folded it
// under a unified `gact agent <verb>` dispatcher; this helper stays
// as the show-specific body.
//
//	gact agent show <id> [--format text|json]
func runAgentShow(args []string) int {
	var format *string
	cc, rest, code := newCmdCtx("agent show", args, withFlags(func(fs *flag.FlagSet) {
		format = fs.String("format", "text", "text | json")
	}))
	if cc == nil {
		return code
	}
	if len(rest) != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact agent show <id> [--format text|json]")
		return 2
	}
	if *format != "text" && *format != "json" {
		fmt.Fprintf(os.Stderr, "gact agent show: unknown format %q\n", *format)
		return 2
	}
	c := cc.client
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	a, err := c.GetAgent(ctx, rest[0])
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact agent show: %v\n", err)
		return 1
	}
	if *format == "json" {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		_ = enc.Encode(a)
		return 0
	}
	fmt.Printf("id:            %s\n", a.ID)
	fmt.Printf("source:        %s\n", a.Source)
	fmt.Printf("title:         %s\n", a.Title)
	if a.Description != "" {
		fmt.Printf("description:   %s\n", a.Description)
	}
	if a.DefaultModel != nil {
		fmt.Printf("default_model: %s/%s\n", a.DefaultModel.ProviderID, a.DefaultModel.ModelID)
	}
	if len(a.Tools) > 0 {
		fmt.Printf("tools:         %s\n", strings.Join(a.Tools, ", "))
	}
	for _, p := range a.Parameters {
		req := ""
		if p.Required {
			req = " (required)"
		}
		fmt.Printf("param:         %s [%s]%s — %s\n", p.Name, p.Type, req, p.Description)
	}
	if a.SystemPrompt != "" {
		fmt.Printf("system_prompt:\n%s\n", a.SystemPrompt)
	}
	return 0
}
