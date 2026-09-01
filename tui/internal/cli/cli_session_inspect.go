package cli

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
	"github.com/JaimeCernuda/gact-tui/tui/internal/config"
)

// runInfo prints a single session's metadata. The default text format
// is a key:value layout — easy for humans to skim and easy for awk to
// parse (one key per line). `--format json` dumps the raw Session
// struct for jq pipelines. Useful when scripts need to check status,
// model, or message_count without parsing `gact list` TSV.
//
// --include CSV pulls in extra sections. Supported tokens:
//
//	tasks  — session tasks (GET /v1/sessions/{id}/tasks)
//	hooks  — hooks scoped to this session (filtered from ListHooks)
//
// In text mode, extra sections are appended under "--- tasks ---" /
// "--- hooks ---" headers. In JSON mode the response is wrapped:
// {"session": {...}, "tasks": [...], "hooks": [...]}.
func runInfo(args []string) int {
	var (
		format  *string
		include *string
	)
	cc, rest, code := newCmdCtx("info", args, withFlags(func(fs *flag.FlagSet) {
		format = fs.String("format", "text", "text | json")
		include = fs.String("include", "", "comma-separated extras: tasks,hooks")
	}))
	if cc == nil {
		return code
	}
	if len(rest) != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact info <session_id> [--format text|json] [--include tasks,hooks,perms]")
		return 2
	}
	if *format != "text" && *format != "json" {
		fmt.Fprintf(os.Stderr, "gact info: unknown format %q (want text|json)\n", *format)
		return 2
	}
	wantTasks, wantHooks, wantPerms := false, false, false
	for _, t := range strings.Split(*include, ",") {
		switch strings.TrimSpace(t) {
		case "":
		case "tasks":
			wantTasks = true
		case "hooks":
			wantHooks = true
		case "perms":
			// --include perms pulls every permission request
			// the session has seen (pending + resolved). Useful for
			// "what did I allow/deny in this session?" audits without
			// chaining info + perms list.
			wantPerms = true
		default:
			fmt.Fprintf(os.Stderr, "gact info: unknown --include token %q (want tasks|hooks|perms)\n", t)
			return 2
		}
	}
	sid := rest[0]
	c := cc.client
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	s, err := c.GetSession(ctx, sid)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact info: %v\n", err)
		return 1
	}
	var tasks []gact.SessionTask
	if wantTasks {
		tasks, err = c.ListSessionTasks(ctx, sid)
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact info: list tasks: %v\n", err)
			return 1
		}
	}
	var perms []client.PermissionWire
	if wantPerms {
		// All permissions the session has seen — including resolved
		// ones — so the user can see the full a/d/s/w trail. Pass
		// onlyPending=false to get the full set.
		perms, err = c.ListPermissions(ctx, sid, false)
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact info: list permissions: %v\n", err)
			return 1
		}
	}
	var sessionHooks []gact.Hook
	if wantHooks {
		all, err := c.ListHooks(ctx)
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact info: list hooks: %v\n", err)
			return 1
		}
		// Keep hooks scoped to this session OR with no scope (global
		// applies to every session). Workspace-scoped hooks for this
		// session's workspace also count — they fire for this session.
		for _, h := range all {
			switch {
			case h.SessionID == sid:
				sessionHooks = append(sessionHooks, h)
			case h.SessionID == "" && h.WorkspaceID == "":
				sessionHooks = append(sessionHooks, h)
			case h.SessionID == "" && h.WorkspaceID == s.WorkspaceID:
				sessionHooks = append(sessionHooks, h)
			}
		}
	}
	// Read-only probe of the local detached registry so
	// `gact info <sid>` shows the same "did I walk away from this?"
	// flag the dashboard / list / sidebar already surface. Soft-
	// fails to false on missing registry.
	isDetached := false
	if path, err := config.DetachedPath(); err == nil {
		if reg, err := config.LoadDetached(path); err == nil {
			for _, r := range reg.Records {
				if r.SessionID == sid && r.Backend == c.BaseURL() {
					isDetached = true
					break
				}
			}
		}
	}
	if *format == "json" {
		out := map[string]any{"session": s, "detached": isDetached}
		if wantTasks {
			if tasks == nil {
				tasks = []gact.SessionTask{}
			}
			out["tasks"] = tasks
		}
		if wantHooks {
			if sessionHooks == nil {
				sessionHooks = []gact.Hook{}
			}
			out["hooks"] = sessionHooks
		}
		if wantPerms {
			if perms == nil {
				perms = []client.PermissionWire{}
			}
			out["perms"] = perms
		}
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		if err := enc.Encode(out); err != nil {
			fmt.Fprintf(os.Stderr, "gact info: %v\n", err)
			return 1
		}
		return 0
	}
	fmt.Printf("id:            %s\n", s.ID)
	fmt.Printf("title:         %s\n", s.Title)
	fmt.Printf("status:        %s\n", s.Status)
	fmt.Printf("workspace:     %s\n", s.WorkspaceID)
	if s.ParentSessionID != "" {
		fmt.Printf("parent:        %s\n", s.ParentSessionID)
	}
	if s.Model.ProviderID != "" || s.Model.ModelID != "" {
		fmt.Printf("model:         %s/%s\n", s.Model.ProviderID, s.Model.ModelID)
	}
	if s.Agent.ID != "" {
		fmt.Printf("agent:         %s\n", s.Agent.ID)
	}
	fmt.Printf("messages:      %d\n", s.MessageCount)
	fmt.Printf("tokens_in:     %d\n", s.Tokens.Input)
	fmt.Printf("tokens_out:    %d\n", s.Tokens.Output)
	fmt.Printf("cost_usd:      %.4f\n", s.CostUSD)
	fmt.Printf("created_at:    %s\n", s.CreatedAt.Format(time.RFC3339))
	fmt.Printf("updated_at:    %s\n", s.UpdatedAt.Format(time.RFC3339))
	if s.ArchivedAt != nil {
		fmt.Printf("archived_at:   %s\n", s.ArchivedAt.Format(time.RFC3339))
	}
	if s.Summary != "" {
		fmt.Printf("summary:       %s\n", s.Summary)
	}
	// Surface whether this session appears in the local
	// detached registry. Always printed (yes/no) so scripts parsing
	// `gact info` get a deterministic field.
	if isDetached {
		fmt.Println("detached:      yes")
	} else {
		fmt.Println("detached:      no")
	}
	if wantTasks {
		fmt.Println("--- tasks ---")
		if len(tasks) == 0 {
			fmt.Println("(none)")
		} else {
			for _, t := range tasks {
				fmt.Printf("%s\t%s\t%s\n", t.Status, t.ID, t.Title)
			}
		}
	}
	if wantHooks {
		fmt.Println("--- hooks ---")
		if len(sessionHooks) == 0 {
			fmt.Println("(none)")
		} else {
			for _, h := range sessionHooks {
				target := h.Command
				if h.URL != "" {
					target = h.URL
				}
				scope := "global"
				if h.SessionID != "" {
					scope = "session=" + h.SessionID
				} else if h.WorkspaceID != "" {
					scope = "workspace=" + h.WorkspaceID
				}
				fmt.Printf("%s\t%s\t%s\t%s\n", h.ID, h.Event, target, scope)
			}
		}
	}
	if wantPerms {
		fmt.Println("--- perms ---")
		if len(perms) == 0 {
			fmt.Println("(none)")
		} else {
			for _, p := range perms {
				summary := p.Summary
				if summary == "" {
					summary = p.ToolCall.ToolName
				}
				row := fmt.Sprintf("%s\t%s\t%s", p.Status, p.ID, summary)
				if p.Action != "" {
					row += "\taction=" + string(p.Action)
				}
				fmt.Println(row)
			}
		}
	}
	return 0
}
