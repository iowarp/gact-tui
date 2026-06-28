package main

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

	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
	"github.com/JaimeCernuda/gact-tui/tui/internal/config"
)

func runContextUpload(args []string) int {
	fs := flag.NewFlagSet("context upload", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	mode := fs.String("mode", "read", "context mode: read | edit | pin")
	format := fs.String("format", "tsv", "tsv | json")
	known := map[string]bool{
		"--backend": true, "-backend": true,
		"--mode": true, "-mode": true,
		"--format": true, "-format": true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 2 {
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
	sid := fs.Arg(0)
	localPath := fs.Arg(1)
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
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
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
	fs := flag.NewFlagSet("context add", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	mode := fs.String("mode", "read", "context mode: read | edit | pin")
	known := map[string]bool{
		"--backend": true, "-backend": true,
		"--mode": true, "-mode": true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 2 {
		fmt.Fprintln(os.Stderr, "usage: gact context add <session_id> <path> [--mode read|edit|pin]")
		return 2
	}
	sid := fs.Arg(0)
	path := fs.Arg(1)
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if _, err := c.AddContextFile(ctx, sid, path, *mode); err != nil {
		fmt.Fprintf(os.Stderr, "gact context add: %v\n", err)
		return 1
	}
	return 0
}

func runContextRm(args []string) int {
	fs := flag.NewFlagSet("context rm", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	known := map[string]bool{"--backend": true, "-backend": true}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 2 {
		fmt.Fprintln(os.Stderr, "usage: gact context rm <session_id> <path> [--backend URL]")
		return 2
	}
	sid := fs.Arg(0)
	path := fs.Arg(1)
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := c.RemoveContextFile(ctx, sid, path); err != nil {
		fmt.Fprintf(os.Stderr, "gact context rm: %v\n", err)
		return 1
	}
	return 0
}
