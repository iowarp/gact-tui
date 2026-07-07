package cli

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

func runContextUpload(args []string) int {
	var (
		mode   *string
		format *string
	)
	cc, rest, code := newCmdCtx("context upload", args, withFlags(func(fs *flag.FlagSet) {
		mode = fs.String("mode", "read", "context mode: read | edit | pin")
		format = fs.String("format", "tsv", "tsv | json")
	}))
	if cc == nil {
		return code
	}
	if len(rest) != 2 {
		fmt.Fprintln(os.Stderr, "usage: gact context upload <session_id> <local_path> [--mode read|edit|pin] [--format tsv|json] [--backend URL]")
		return 2
	}
	switch *mode {
	case "read", "edit", "pin":
	default:
		fmt.Fprintf(os.Stderr, "gact context upload: unknown --mode %q (want read|edit|pin)\n", *mode)
		return 2
	}
	if *format != "tsv" && *format != "json" {
		fmt.Fprintf(os.Stderr, "gact context upload: unknown format %q (want tsv|json)\n", *format)
		return 2
	}
	sid := rest[0]
	localPath := rest[1]
	data, err := os.ReadFile(localPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact context upload: read %s: %v\n", localPath, err)
		return 1
	}
	mimeType := mime.TypeByExtension(filepath.Ext(localPath))
	if mimeType == "" && len(data) > 0 {
		sniffLen := len(data)
		if sniffLen > 512 {
			sniffLen = 512
		}
		mimeType = http.DetectContentType(data[:sniffLen])
	}
	c := cc.client
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	cf, err := c.UploadAttachment(ctx, sid, filepath.Base(localPath), mimeType, *mode, data)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact context upload: %v\n", err)
		return 1
	}
	if *format == "json" {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		if err := enc.Encode(cf); err != nil {
			fmt.Fprintf(os.Stderr, "gact context upload: encode: %v\n", err)
			return 1
		}
		return 0
	}
	modeLabel := firstNonEmptyCLI(cf.Mode, *mode, "?")
	fmt.Printf("%s\t%s\n", modeLabel, cf.Path)
	return 0
}

func runContextAdd(args []string) int {
	var mode *string
	cc, rest, code := newCmdCtx("context add", args, withFlags(func(fs *flag.FlagSet) {
		mode = fs.String("mode", "read", "context mode: read | edit | pin")
	}))
	if cc == nil {
		return code
	}
	if len(rest) != 2 {
		fmt.Fprintln(os.Stderr, "usage: gact context add <session_id> <path> [--mode read|edit|pin]")
		return 2
	}
	sid := rest[0]
	path := rest[1]
	c := cc.client
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if _, err := c.AddContextFile(ctx, sid, path, *mode); err != nil {
		fmt.Fprintf(os.Stderr, "gact context add: %v\n", err)
		return 1
	}
	return 0
}

func runContextRm(args []string) int {
	cc, rest, code := newCmdCtx("context rm", args)
	if cc == nil {
		return code
	}
	if len(rest) != 2 {
		fmt.Fprintln(os.Stderr, "usage: gact context rm <session_id> <path> [--backend URL]")
		return 2
	}
	sid := rest[0]
	path := rest[1]
	c := cc.client
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := c.RemoveContextFile(ctx, sid, path); err != nil {
		fmt.Fprintf(os.Stderr, "gact context rm: %v\n", err)
		return 1
	}
	return 0
}
