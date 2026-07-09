package cli

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"
)

// runMcp dispatches per-server MCP detail subcommands. `gact catalog
// mcp` lists all servers; this drills into one to inspect what it
// exposes:
//
//	gact mcp tools     <server-id>   — TSV: id  name
//	gact mcp resources <server-id>   — TSV: uri  mime  name
//	gact mcp prompts   <server-id>   — TSV: name  title
func runMcp(args []string) int {
	if len(args) == 0 {
		fmt.Fprintln(os.Stderr, "usage: gact mcp list|tools|resources|prompts <server-id> [--format tsv|json]")
		return 2
	}
	verb := args[0]
	rest := args[1:]
	switch verb {
	case "list", "ls":
		return runMcpList(rest)
	case "tools":
		return runMcpTools(rest)
	case "resources":
		return runMcpResources(rest)
	case "prompts":
		return runMcpPrompts(rest)
	case "reconnect":
		return runMcpReconnect(rest)
	case "resource-read", "read":
		return runMcpResourceRead(rest)
	}
	fmt.Fprintf(os.Stderr, "gact mcp: unknown verb %q (want list|tools|resources|prompts|reconnect|resource-read)\n", verb)
	return 2
}

// runMcpList enumerates the backend's MCP servers (`GET
// /v1/mcp/servers`). TSV columns: id, name, status, transport,
// protocol_version, capabilities (compact "tools,resources,
// prompts,logging"), last_error. JSON mode dumps the array as-is
// for downstream tooling. (JJJJ1)
func runMcpList(args []string) int {
	var format *string
	cc, rest, code := newCmdCtx("mcp list", args, mcpFormatFlag(&format))
	if cc == nil {
		return code
	}
	if len(rest) != 0 {
		fmt.Fprintln(os.Stderr, "usage: gact mcp list [--format tsv|json]")
		return 2
	}
	c := cc.client
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	servers, err := c.ListMcpServers(ctx)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact mcp list: %v\n", err)
		return 1
	}
	if *format == "json" {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		if err := enc.Encode(servers); err != nil {
			fmt.Fprintf(os.Stderr, "gact mcp list: encode: %v\n", err)
			return 1
		}
		return 0
	}
	if *format != "tsv" {
		fmt.Fprintf(os.Stderr, "gact mcp list: unknown format %q (want tsv|json)\n", *format)
		return 2
	}
	fmt.Println("id\tname\tstatus\ttransport\tprotocol\tcaps\tlast_error")
	for _, s := range servers {
		caps := []string{}
		if s.DeclaredCapabilities.Tools {
			caps = append(caps, "tools")
		}
		if s.DeclaredCapabilities.Resources != nil {
			caps = append(caps, "resources")
		}
		if s.DeclaredCapabilities.Prompts != nil {
			caps = append(caps, "prompts")
		}
		if s.DeclaredCapabilities.Logging {
			caps = append(caps, "logging")
		}
		capStr := strings.Join(caps, ",")
		if capStr == "" {
			capStr = "-"
		}
		errStr := s.LastError
		if errStr == "" {
			errStr = "-"
		}
		fmt.Printf("%s\t%s\t%s\t%s\t%s\t%s\t%s\n",
			s.ID, s.Name, s.Status, s.Transport, s.ProtocolVersion, capStr, errStr)
	}
	return 0
}

// mcpFormatFlag registers the shared `--format tsv|json` flag used by
// every `gact mcp` subcommand, capturing the parsed value into dst.
func mcpFormatFlag(dst **string) cmdOpt {
	return withFlags(func(fs *flag.FlagSet) {
		*dst = fs.String("format", "tsv", "tsv | json")
	})
}

func runMcpTools(args []string) int {
	var format *string
	cc, rest, code := newCmdCtx("mcp tools", args, mcpFormatFlag(&format))
	if cc == nil {
		return code
	}
	if len(rest) != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact mcp tools <server-id> [--format tsv|json]")
		return 2
	}
	if *format != "tsv" && *format != "json" {
		fmt.Fprintf(os.Stderr, "gact mcp tools: unknown format %q\n", *format)
		return 2
	}
	c := cc.client
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	tools, err := c.McpServerTools(ctx, rest[0])
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact mcp tools: %v\n", err)
		return 1
	}
	if *format == "json" {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		_ = enc.Encode(tools)
		return 0
	}
	for _, t := range tools {
		fmt.Printf("%s\t%s\n", t.ID, t.Name)
	}
	return 0
}

func runMcpResources(args []string) int {
	var format *string
	cc, rest, code := newCmdCtx("mcp resources", args, mcpFormatFlag(&format))
	if cc == nil {
		return code
	}
	if len(rest) != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact mcp resources <server-id> [--format tsv|json]")
		return 2
	}
	if *format != "tsv" && *format != "json" {
		fmt.Fprintf(os.Stderr, "gact mcp resources: unknown format %q\n", *format)
		return 2
	}
	c := cc.client
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	rs, err := c.McpServerResources(ctx, rest[0])
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact mcp resources: %v\n", err)
		return 1
	}
	if *format == "json" {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		_ = enc.Encode(rs)
		return 0
	}
	for _, r := range rs {
		fmt.Printf("%s\t%s\t%s\n", r.URI, r.MimeType, r.Name)
	}
	return 0
}

func runMcpPrompts(args []string) int {
	var format *string
	cc, rest, code := newCmdCtx("mcp prompts", args, mcpFormatFlag(&format))
	if cc == nil {
		return code
	}
	if len(rest) != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact mcp prompts <server-id> [--format tsv|json]")
		return 2
	}
	if *format != "tsv" && *format != "json" {
		fmt.Fprintf(os.Stderr, "gact mcp prompts: unknown format %q\n", *format)
		return 2
	}
	c := cc.client
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	ps, err := c.McpServerPrompts(ctx, rest[0])
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact mcp prompts: %v\n", err)
		return 1
	}
	if *format == "json" {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		_ = enc.Encode(ps)
		return 0
	}
	for _, p := range ps {
		fmt.Printf("%s\t%s\n", p.Name, p.Title)
	}
	return 0
}
