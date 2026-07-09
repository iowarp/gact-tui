package ui

// file_viewer_preview.go builds local-file preview detail modes and text/JSON previews.

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"unicode/utf8"

	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

const maxLocalFilePreviewBytes = 2 * 1024 * 1024

// detailModesWithRoot computes file detail modes as if the tree were rooted at
// root, restoring the live root afterwards. The seam for the execution-detail
// component, which previously swapped fileViewerRoot inline to preview a file
// outside the workspace tree. Unlike setRoot it does not reload the tree or
// reset selection — it only scopes the info-text root for the computation.
func (c *fileViewerComponent) detailModesWithRoot(root string, entry fileTreeEntry, fullPath string) []fileDetailMode {
	oldRoot := c.fileViewerRoot
	c.fileViewerRoot = root
	modes := c.fileDetailModes(entry, fullPath)
	c.fileViewerRoot = oldRoot
	return modes
}

func (c *fileViewerComponent) fileDetailModes(entry fileTreeEntry, fullPath string) []fileDetailMode {
	info := localFileInfoText(entry, c.fileViewerRoot)
	ext := localFileExtension(entry.Path)
	if modes, handled := c.externalDetailModes(fullPath, info, ext); handled {
		return modes
	}
	if ext == ".csv" || ext == ".tsv" {
		table, err := previewDelimitedFilePath(fullPath, ext, 40)
		if err != nil {
			return []fileDetailMode{{
				id:    "info",
				label: "Info",
				text:  info + "\n\npreview: unavailable\nreason: " + err.Error(),
			}}
		}
		modes := []fileDetailMode{{id: "table", label: "Table", text: info + "\n\n" + table}}
		if entry.Size <= maxLocalFilePreviewBytes {
			if data, err := os.ReadFile(fullPath); err == nil && looksLikeTextBytes(data) {
				modes = append(modes, fileDetailMode{id: "raw", label: "Raw", text: info + "\n\n" + truncateLocalPreview(string(data))})
			}
		} else {
			modes = append(modes, fileDetailMode{id: "info", label: "Info", text: info + "\n\nraw preview skipped: file is " + textutil.HumanBytes(entry.Size) + ", above the " + textutil.HumanBytes(maxLocalFilePreviewBytes) + " inline raw limit"})
		}
		return modes
	}
	if isKnownExternalOnlyFile(ext) {
		return []fileDetailMode{{
			id:    "info",
			label: "Info",
			text:  localFileUnsupportedText(info, entry.Path, ext, "No terminal preview renderer is configured for this file type."),
		}}
	}
	if entry.Size > maxLocalFilePreviewBytes {
		return []fileDetailMode{{
			id:    "info",
			label: "Info",
			text: localFileUnsupportedText(info, entry.Path, ext,
				fmt.Sprintf("This file is %s, which is above the %s inline preview limit.",
					textutil.HumanBytes(entry.Size), textutil.HumanBytes(maxLocalFilePreviewBytes))),
		}}
	}
	data, err := os.ReadFile(fullPath)
	if err != nil {
		return []fileDetailMode{{
			id:    "info",
			label: "Info",
			text:  info + "\n\nerror: " + err.Error(),
		}}
	}
	if !looksLikeTextBytes(data) {
		return []fileDetailMode{{
			id:    "info",
			label: "Info",
			text:  localFileUnsupportedText(info, entry.Path, ext, "This appears to be a binary file."),
		}}
	}
	raw := truncateLocalPreview(string(data))
	switch ext {
	case ".md", ".markdown":
		rendered := info + "\n\n" + renderMarkdown(raw, c.app.Theme, maxInt(40, modalBodyContentWidth(c.app.modals.detailModalWidth())-4))
		return []fileDetailMode{
			{id: "rendered", label: "Rendered", text: rendered},
			{id: "raw", label: "Raw", text: info + "\n\n" + raw},
		}
	case ".json":
		pretty, err := prettyJSON(data)
		if err == nil {
			return []fileDetailMode{
				{id: "pretty", label: "Pretty", text: info + "\n\n" + pretty},
				{id: "raw", label: "Raw", text: info + "\n\n" + raw},
			}
		}
		return []fileDetailMode{
			{id: "raw", label: "Raw", text: info + "\n\n" + raw + "\n\njson parse error: " + err.Error()},
		}
	case ".jsonl", ".ndjson":
		return []fileDetailMode{
			{id: "preview", label: "Preview", text: info + "\n\n" + previewJSONLines(data, 40)},
			{id: "raw", label: "Raw", text: info + "\n\n" + raw},
		}
	case ".csv", ".tsv":
		table, err := previewDelimitedBytes(data, ext, 40)
		if err == nil {
			return []fileDetailMode{
				{id: "table", label: "Table", text: info + "\n\n" + table},
				{id: "raw", label: "Raw", text: info + "\n\n" + raw},
			}
		}
		return []fileDetailMode{
			{id: "raw", label: "Raw", text: info + "\n\n" + raw + "\n\nparse error: " + err.Error()},
		}
	case ".html", ".htm":
		return []fileDetailMode{
			{id: "info", label: "Info", text: localFileUnsupportedText(info, entry.Path, ext,
				"No terminal text-browser renderer is available for this HTML file.")},
			{id: "raw", label: "Raw", text: info + "\n\n" + raw},
		}
	default:
		return []fileDetailMode{{id: "raw", label: "Raw", text: info + "\n\n" + raw}}
	}
}

func localFileInfoText(entry fileTreeEntry, root string) string {
	rows := []string{
		"path: " + entry.Path,
		"root: " + root,
	}
	if entry.Size > 0 {
		rows = append(rows, "size: "+textutil.HumanBytes(entry.Size))
	}
	if ext := strings.TrimPrefix(localFileExtension(entry.Path), "."); ext != "" {
		rows = append(rows, "type: "+ext)
	}
	return strings.Join(rows, "\n")
}

func localFileExtension(path string) string {
	base := strings.ToLower(filepath.Base(path))
	for _, ext := range []string{".vcf.gz"} {
		if strings.HasSuffix(base, ext) {
			return ext
		}
	}
	return strings.ToLower(filepath.Ext(base))
}

func localFileUnsupportedText(info, path, ext, reason string) string {
	rows := []string{
		info,
		"",
		"preview: unsupported",
		"reason: " + reason,
	}
	if guidance := localFileRendererGuidance(ext); guidance != "" {
		rows = append(rows, "optional renderer: "+guidance)
	}
	rows = append(rows,
		"",
		"Open externally with o or the open button.",
		"If this file type matters to your workflow, please open an issue on the repository and include this extension: "+valuefmt.FirstNonEmpty(ext, filepath.Ext(path), "unknown")+".",
	)
	return strings.Join(rows, "\n")
}

func isKnownExternalOnlyFile(ext string) bool {
	switch ext {
	case ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg",
		".pdf", ".parquet", ".arrow", ".feather", ".h5", ".hdf5",
		".nc", ".nc4", ".cdf", ".netcdf", ".npy", ".npz", ".bam", ".cram",
		".vcf.gz", ".bcf":
		return true
	default:
		return false
	}
}

func looksLikeTextBytes(data []byte) bool {
	if len(data) == 0 {
		return true
	}
	if bytes.IndexByte(data, 0) >= 0 {
		return false
	}
	if !utf8.Valid(data) {
		return false
	}
	control := 0
	for _, b := range data {
		if b == '\t' || b == '\n' || b == '\r' || b == '\f' || b == '\v' {
			continue
		}
		if b < 0x20 {
			control++
		}
	}
	return control == 0
}

func truncateLocalPreview(s string) string {
	const limit = 12000
	if len(s) <= limit {
		return s
	}
	return s[:limit] + "\n[truncated]"
}

func prettyJSON(data []byte) (string, error) {
	var v any
	if err := json.Unmarshal(data, &v); err != nil {
		return "", err
	}
	out, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return "", err
	}
	return string(out), nil
}

func previewJSONLines(data []byte, limit int) string {
	lines := strings.Split(strings.TrimRight(string(data), "\n"), "\n")
	var out strings.Builder
	fmt.Fprintf(&out, "jsonl: %d records (showing first %d)\n\n", len(lines), valuefmt.MinInt(limit, len(lines)))
	for i, line := range lines {
		if i >= limit {
			break
		}
		var v any
		if err := json.Unmarshal([]byte(line), &v); err != nil {
			fmt.Fprintf(&out, "[%d] <invalid json: %v>\n", i, err)
			continue
		}
		pretty, _ := json.Marshal(v)
		fmt.Fprintf(&out, "[%d] %s\n", i, pretty)
	}
	return strings.TrimRight(out.String(), "\n")
}
