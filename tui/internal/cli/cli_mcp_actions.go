package cli

import (
	"context"
	"encoding/base64"
	"fmt"
	"os"
	"time"
)

func runMcpResourceRead(args []string) int {
	cc, rest, code := newCmdCtx("mcp resource-read", args)
	if cc == nil {
		return code
	}
	if len(rest) != 2 {
		fmt.Fprintln(os.Stderr, "usage: gact mcp resource-read <server-id> <uri>")
		return 2
	}
	c := cc.client
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	contents, err := c.McpResourceRead(ctx, rest[0], rest[1])
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
	cc, rest, code := newCmdCtx("mcp reconnect", args)
	if cc == nil {
		return code
	}
	if len(rest) != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact mcp reconnect <server-id>")
		return 2
	}
	c := cc.client
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := c.McpReconnect(ctx, rest[0]); err != nil {
		fmt.Fprintf(os.Stderr, "gact mcp reconnect: %v\n", err)
		return 1
	}
	return 0
}
