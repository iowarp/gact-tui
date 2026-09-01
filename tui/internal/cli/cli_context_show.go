package cli

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

func runContextShow(args []string) int {
	var format *string
	cc, rest, code := newCmdCtx("context show", args, withFlags(func(fs *flag.FlagSet) {
		format = fs.String("format", "text", "text | json")
	}))
	if cc == nil {
		return code
	}
	if len(rest) != 2 {
		fmt.Fprintln(os.Stderr, "usage: gact context show <session_id> <path> [--format text|json] [--backend URL]")
		return 2
	}
	if *format != "text" && *format != "json" {
		fmt.Fprintf(os.Stderr, "gact context show: unknown format %q (want text|json)\n", *format)
		return 2
	}
	sid := rest[0]
	filePath := rest[1]
	c := cc.client
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	content, err := c.ContextFileContent(ctx, sid, filePath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact context show: %v\n", err)
		return 1
	}
	if *format == "json" {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		if err := enc.Encode(content); err != nil {
			fmt.Fprintf(os.Stderr, "gact context show: encode: %v\n", err)
			return 1
		}
		return 0
	}
	if err := printContextFileContentText(os.Stdout, content); err != nil {
		fmt.Fprintf(os.Stderr, "gact context show: %v\n", err)
		return 1
	}
	return 0
}

func printContextFileContentText(w io.Writer, content gact.ContextFileContent) error {
	pathLabel := firstNonEmptyCLI(content.DisplayPath, content.Path, "(unknown)")
	fmt.Fprintf(w, "path: %s\n", pathLabel)
	if content.Size > 0 {
		fmt.Fprintf(w, "size: %d bytes\n", content.Size)
	}
	if strings.TrimSpace(content.MediaType) != "" {
		fmt.Fprintf(w, "media_type: %s\n", content.MediaType)
	}
	if strings.TrimSpace(content.Encoding) != "" {
		fmt.Fprintf(w, "encoding: %s\n", content.Encoding)
	}
	if !contextContentIsText(content.MediaType) {
		fmt.Fprintln(w, "preview: binary content not rendered")
		return nil
	}
	if strings.TrimSpace(content.Data) == "" {
		fmt.Fprintln(w, "preview: empty")
		return nil
	}
	decoded, err := base64.StdEncoding.DecodeString(content.Data)
	if err != nil {
		return fmt.Errorf("bad base64 content for %s: %w", pathLabel, err)
	}
	text := strings.ReplaceAll(string(decoded), "\r\n", "\n")
	text = strings.ReplaceAll(text, "\r", "\n")
	const maxPreviewRunes = 12000
	truncated := false
	if len([]rune(text)) > maxPreviewRunes {
		runes := []rune(text)
		text = string(runes[:maxPreviewRunes])
		truncated = true
	}
	fmt.Fprintln(w, "preview:")
	fmt.Fprint(w, text)
	if !strings.HasSuffix(text, "\n") {
		fmt.Fprintln(w)
	}
	if truncated {
		fmt.Fprintf(w, "truncated: shown first %d characters\n", maxPreviewRunes)
	}
	return nil
}

func contextContentIsText(mediaType string) bool {
	mediaType = strings.ToLower(strings.TrimSpace(mediaType))
	if mediaType == "" || strings.HasPrefix(mediaType, "text/") || strings.Contains(mediaType, "charset=utf-8") {
		return true
	}
	for _, prefix := range []string{"application/json", "application/xml", "application/yaml", "application/toml"} {
		if strings.HasPrefix(mediaType, prefix) {
			return true
		}
	}
	return false
}
