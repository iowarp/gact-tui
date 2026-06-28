package main

import (
	"context"
	"encoding/base64"
	"flag"
	"fmt"
	"os"
	"time"

	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
	"github.com/JaimeCernuda/gact-tui/tui/internal/config"
)

func runMcpResourceRead(args []string) int {
	fs := flag.NewFlagSet("mcp resource-read", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	known := map[string]bool{"--backend": true, "-backend": true}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 2 {
		fmt.Fprintln(os.Stderr, "usage: gact mcp resource-read <server-id> <uri>")
		return 2
	}
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	contents, err := c.McpResourceRead(ctx, fs.Arg(0), fs.Arg(1))
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact mcp resource-read: %v\n", err)
		return 1
	}
	for _, ch := range contents {
		if ch.Text != "" {
			_, _ = os.Stdout.WriteString(ch.Text)
			continue
		}
		if ch.Data != "" {
			decoded, err := base64.StdEncoding.DecodeString(ch.Data)
			if err != nil {
				fmt.Fprintf(os.Stderr, "gact mcp resource-read: bad base64 for %s: %v\n", ch.URI, err)
				return 1
			}
			_, _ = os.Stdout.Write(decoded)
		}
	}
	return 0
}

func runMcpReconnect(args []string) int {
	fs := flag.NewFlagSet("mcp reconnect", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	known := map[string]bool{"--backend": true, "-backend": true}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact mcp reconnect <server-id>")
		return 2
	}
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := c.McpReconnect(ctx, fs.Arg(0)); err != nil {
		fmt.Fprintf(os.Stderr, "gact mcp reconnect: %v\n", err)
		return 1
	}
	return 0
}
