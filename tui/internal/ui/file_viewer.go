package ui

import (
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

type fileTreeEntry struct {
	Path  string
	Name  string
	Dir   bool
	Depth int
	Size  int64
}

const fileViewerRefreshInterval = 2 * time.Second

type fileViewerRefreshTickMsg struct{}

func fileViewerRefreshCmd() tea.Cmd {
	return tea.Tick(fileViewerRefreshInterval, func(time.Time) tea.Msg {
		return fileViewerRefreshTickMsg{}
	})
}

func (a *App) initFileViewerFromCwd() {
	cwd, err := os.Getwd()
	if err != nil {
		a.fileViewerRoot = "."
		a.fileTreeRootMode = "cwd"
		a.fileTreeErr = err.Error()
		a.fileTreeExpanded = map[string]bool{}
		return
	}
	a.SetFileViewerRoot(cwd)
	a.fileTreeRootMode = "cwd"
}

func (a *App) SetFileViewerRoot(root string) {
	root = strings.TrimSpace(root)
	if root == "" {
		root = "."
	}
	abs, err := filepath.Abs(root)
	if err != nil {
		abs = root
	}
	if a.fileViewerRoot == abs && len(a.fileTreeEntries) > 0 {
		return
	}
	a.fileViewerRoot = abs
	a.fileTreeExpanded = map[string]bool{}
	a.fileTreeSel = 0
	a.reloadFileViewer()
}

func (a *App) syncFileViewerRootToWorkspace() {
	root := strings.TrimSpace(a.currentWorkspaceRootPath())
	if root == "" {
		if a.fileViewerRoot == "" {
			a.initFileViewerFromCwd()
		}
		a.fileTreeRootMode = "cwd"
		return
	}
	a.SetFileViewerRoot(root)
	a.fileTreeRootMode = "workspace"
}

func (a *App) currentWorkspaceRootPath() string {
	for _, ws := range a.workspaces {
		if ws.ID == a.wsID {
			return workspaceFileRootPath(ws)
		}
	}
	return ""
}

func workspaceFileRootPath(ws gact.Workspace) string {
	root := strings.TrimSpace(ws.RootPath)
	name := strings.TrimSpace(ws.Name)
	if workspaceNamePathShouldOverrideRoot(name, root) {
		return name
	}
	return root
}

func workspaceNamePathShouldOverrideRoot(name, root string) bool {
	if name == "" || !filepath.IsAbs(name) {
		return false
	}
	name = filepath.Clean(name)
	root = filepath.Clean(strings.TrimSpace(root))
	if root != "" && root == name {
		return false
	}
	if info, err := os.Stat(name); err != nil || !info.IsDir() {
		return false
	}
	if root == "." || root == "" {
		return true
	}
	tmp := filepath.Clean(os.TempDir())
	if root == tmp || !strings.HasPrefix(root, tmp+string(filepath.Separator)) {
		return false
	}
	return strings.HasPrefix(filepath.Base(root), "grind-")
}

func (a *App) reloadFileViewer() {
	selectedPath := a.selectedFileTreePath()
	entries, err := scanFileTreeExpanded(a.fileViewerRoot, "", 0, a.fileTreeExpanded)
	a.fileTreeEntries = entries
	a.fileTreeErr = ""
	a.fileTreeUpdated = time.Now()
	if err != nil {
		a.fileTreeErr = err.Error()
	}
	a.restoreFileTreeSelection(selectedPath)
	a.clampFileTreeSelection()
}

func (a *App) refreshFileViewerFromWorkspace() {
	root := strings.TrimSpace(a.currentWorkspaceRootPath())
	if root == "" {
		if a.fileTreeRootMode == "workspace" && a.fileViewerRoot != "" {
			a.reloadFileViewer()
		}
		return
	}
	abs, err := filepath.Abs(root)
	if err != nil {
		abs = root
	}
	if a.fileViewerRoot != abs {
		a.SetFileViewerRoot(root)
		a.fileTreeRootMode = "workspace"
		return
	}
	a.reloadFileViewer()
	a.fileTreeRootMode = "workspace"
}

func scanFileTreeDir(root string, rel string, depth int) ([]fileTreeEntry, error) {
	info, err := os.Stat(root)
	if err != nil {
		return nil, err
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("%s is not a directory", root)
	}
	abs := root
	if rel != "" {
		abs = filepath.Join(root, filepath.FromSlash(rel))
	}
	children, err := os.ReadDir(abs)
	if err != nil {
		return nil, err
	}
	sort.Slice(children, func(i, j int) bool {
		if children[i].IsDir() != children[j].IsDir() {
			return children[i].IsDir()
		}
		return strings.ToLower(children[i].Name()) < strings.ToLower(children[j].Name())
	})
	entries := make([]fileTreeEntry, 0, len(children))
	for _, child := range children {
		name := child.Name()
		childRel := name
		if rel != "" {
			childRel = filepath.ToSlash(filepath.Join(rel, name))
		}
		entry := fileTreeEntry{
			Path:  childRel,
			Name:  name,
			Dir:   child.IsDir(),
			Depth: depth,
		}
		if info, err := child.Info(); err == nil {
			entry.Size = info.Size()
		}
		entries = append(entries, entry)
	}
	return entries, nil
}

func scanFileTreeExpanded(root string, rel string, depth int, expanded map[string]bool) ([]fileTreeEntry, error) {
	entries, err := scanFileTreeDir(root, rel, depth)
	if err != nil {
		return nil, err
	}
	out := make([]fileTreeEntry, 0, len(entries))
	for _, entry := range entries {
		out = append(out, entry)
		if !entry.Dir || !expanded[entry.Path] {
			continue
		}
		children, err := scanFileTreeExpanded(root, entry.Path, entry.Depth+1, expanded)
		if err != nil {
			return out, err
		}
		out = append(out, children...)
	}
	return out, nil
}

func (a *App) selectedFileTreePath() string {
	visible := a.visibleFileTreeEntries()
	if a.fileTreeSel < 0 || a.fileTreeSel >= len(visible) {
		return ""
	}
	return visible[a.fileTreeSel].Path
}

func (a *App) restoreFileTreeSelection(path string) {
	if path == "" {
		return
	}
	visible := a.visibleFileTreeEntries()
	for i, entry := range visible {
		if entry.Path == path {
			a.fileTreeSel = i
			return
		}
	}
}

func (a *App) visibleFileTreeEntries() []fileTreeEntry {
	visible := make([]fileTreeEntry, 0, len(a.fileTreeEntries))
	parentExpanded := map[int]bool{-1: true}
	for _, entry := range a.fileTreeEntries {
		parentDepth := entry.Depth - 1
		if !parentExpanded[parentDepth] {
			parentExpanded[entry.Depth] = false
			continue
		}
		visible = append(visible, entry)
		if entry.Dir {
			parentExpanded[entry.Depth] = a.fileTreeExpanded[entry.Path]
		}
	}
	return visible
}

func (a *App) clampFileTreeSelection() {
	visible := a.visibleFileTreeEntries()
	if len(visible) == 0 {
		a.fileTreeSel = 0
		return
	}
	a.fileTreeSel = clampSelection(a.fileTreeSel, len(visible))
}

func (a *App) activateFileTreeSelection() {
	if strings.TrimSpace(a.fileTreeErr) != "" {
		a.openFileViewerRootDetail()
		return
	}
	visible := a.visibleFileTreeEntries()
	if len(visible) == 0 {
		return
	}
	a.fileTreeSel = clampSelection(a.fileTreeSel, len(visible))
	entry := visible[a.fileTreeSel]
	if entry.Dir {
		if !a.fileTreeExpanded[entry.Path] {
			a.loadFileTreeChildren(entry)
		}
		a.fileTreeExpanded[entry.Path] = !a.fileTreeExpanded[entry.Path]
		return
	}
	a.openFileViewerDetail(entry)
}

func (a *App) loadFileTreeChildren(entry fileTreeEntry) {
	if !entry.Dir || a.fileTreeChildrenLoaded(entry.Path) {
		return
	}
	children, err := scanFileTreeDir(a.fileViewerRoot, entry.Path, entry.Depth+1)
	if err != nil {
		a.fileTreeErr = err.Error()
		return
	}
	insertAt := -1
	for i, existing := range a.fileTreeEntries {
		if existing.Path == entry.Path {
			insertAt = i + 1
			break
		}
	}
	if insertAt < 0 {
		return
	}
	next := make([]fileTreeEntry, 0, len(a.fileTreeEntries)+len(children))
	next = append(next, a.fileTreeEntries[:insertAt]...)
	next = append(next, children...)
	next = append(next, a.fileTreeEntries[insertAt:]...)
	a.fileTreeEntries = next
}

func (a *App) fileTreeChildrenLoaded(path string) bool {
	for _, entry := range a.fileTreeEntries {
		if entry.Path == path {
			continue
		}
		if filepath.ToSlash(filepath.Dir(entry.Path)) == path {
			return true
		}
	}
	return false
}

func (a *App) openFileViewerDetail(entry fileTreeEntry) {
	fullPath := filepath.Join(a.fileViewerRoot, filepath.FromSlash(entry.Path))
	modes := a.localFileDetailModes(entry, fullPath)
	active := ""
	fullText := ""
	if len(modes) > 0 {
		active = modes[0].id
		fullText = modes[0].text
	}
	a.detailView = &bulkyPartRef{
		messageID: "files",
		partID:    entry.Path,
		title:     "File · " + entry.Path,
		fullText:  fullText,
		localPath: fullPath,
		fileModes: modes,
		fileMode:  active,
	}
	a.detailViewOpen = true
	a.detailScroll = 0
}

const maxLocalFilePreviewBytes = 2 * 1024 * 1024
const maxExternalRendererRunes = 64 * 1024

var fileViewerLookPath = exec.LookPath

func (a *App) localFileDetailModes(entry fileTreeEntry, fullPath string) []fileDetailMode {
	info := localFileInfoText(entry, a.fileViewerRoot)
	ext := localFileExtension(entry.Path)
	if modes, handled := a.externalFileDetailModes(entry, fullPath, info, ext); handled {
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
			modes = append(modes, fileDetailMode{id: "info", label: "Info", text: info + "\n\nraw preview skipped: file is " + humanBytes(entry.Size) + ", above the " + humanBytes(maxLocalFilePreviewBytes) + " inline raw limit"})
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
					humanBytes(entry.Size), humanBytes(maxLocalFilePreviewBytes))),
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
		rendered := info + "\n\n" + renderMarkdown(raw, a.Theme, maxInt(40, modalBodyContentWidth(a.detailModalWidth())-4))
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

func (a *App) externalFileDetailModes(entry fileTreeEntry, fullPath, info, ext string) ([]fileDetailMode, bool) {
	switch ext {
	case ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg":
		rendered, err := a.renderChafaImagePreview(fullPath)
		return rendererModes(info, "image", "Image", "chafa", rendered, err), true
	case ".pdf":
		rendered, err := renderCommandPreview("pdftotext", 5*time.Second, "-layout", "-f", "1", "-l", "3", fullPath, "-")
		return rendererModes(info, "text", "Text", "pdftotext", rendered, err), true
	case ".html", ".htm":
		rendered, renderer, err := renderHTMLPreview(fullPath)
		return rendererModes(info, "text", "Text", renderer, rendered, err), true
	case ".parquet", ".arrow", ".feather":
		rendered, err := renderPythonPreview(parquetPreviewPython(), fullPath)
		return rendererModes(info, "table", "Table", "pyarrow", rendered, err), true
	case ".h5", ".hdf5":
		if _, err := fileViewerLookPath("h5ls"); err == nil {
			rendered, err := renderCommandPreview("h5ls", 5*time.Second, "-r", fullPath)
			return rendererModes(info, "tree", "Tree", "h5ls", rendered, err), true
		}
		rendered, err := renderPythonPreview(hdf5PreviewPython(), fullPath)
		return rendererModes(info, "tree", "Tree", "h5py", rendered, err), true
	case ".nc", ".nc4", ".cdf", ".netcdf":
		if _, err := fileViewerLookPath("ncdump"); err == nil {
			rendered, err := renderCommandPreview("ncdump", 5*time.Second, "-h", fullPath)
			return rendererModes(info, "header", "Header", "ncdump", rendered, err), true
		}
		return rendererModes(info, "header", "Header", "ncdump", "", errMissingRenderer("ncdump")), true
	case ".npy", ".npz":
		rendered, err := renderPythonPreview(numpyPreviewPython(), fullPath)
		return rendererModes(info, "array", "Array", "numpy", rendered, err), true
	case ".bam", ".cram":
		rendered, err := renderCommandPreview("samtools", 5*time.Second, "view", "-H", fullPath)
		return rendererModes(info, "header", "Header", "samtools", rendered, err), true
	case ".vcf.gz", ".bcf":
		rendered, err := renderCommandPreview("bcftools", 5*time.Second, "view", "-h", fullPath)
		return rendererModes(info, "header", "Header", "bcftools", rendered, err), true
	default:
		_ = entry
		return nil, false
	}
}

func rendererModes(info, id, label, renderer, rendered string, err error) []fileDetailMode {
	if err == nil {
		return []fileDetailMode{
			{id: id, label: label, text: info + "\n\nrenderer: " + renderer + "\n\n" + rendered},
			{id: "info", label: "Info", text: info + "\n\nrenderer: " + renderer},
		}
	}
	return []fileDetailMode{{
		id:    "info",
		label: "Info",
		text:  localFileRendererUnavailableText(info, rendererUnavailableReason(renderer, err)),
	}}
}

func localFileRendererUnavailableText(info, reason string) string {
	return strings.Join([]string{
		info,
		"",
		"preview: unavailable",
		"reason: " + reason,
		"",
		"Open externally with o or the open button.",
	}, "\n")
}

func rendererUnavailableReason(renderer string, err error) string {
	if errors.Is(err, exec.ErrNotFound) || errors.Is(err, errRendererMissing) {
		return "No terminal preview renderer is installed for this file type. Missing renderer: " + renderer + "."
	}
	return "The " + renderer + " preview renderer failed: " + err.Error()
}

var errRendererMissing = errors.New("renderer missing")

func errMissingRenderer(name string) error {
	return fmt.Errorf("%w: %s", errRendererMissing, name)
}

func (a *App) renderChafaImagePreview(path string) (string, error) {
	if _, err := fileViewerLookPath("chafa"); err != nil {
		return "", err
	}
	width := modalBodyContentWidth(a.detailModalWidth()) - 4
	if width <= 0 {
		width = 80
	}
	width = minInt(width, 96)
	height := maxInt(10, minInt(28, maxInt(1, a.height-18)))
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "chafa",
		"--format=symbols",
		"--colors=none",
		"--animate=off",
		"--polite=on",
		"--size", fmt.Sprintf("%dx%d", width, height),
		path,
	)
	out, err := cmd.Output()
	if ctx.Err() != nil {
		return "", ctx.Err()
	}
	if err != nil {
		return "", err
	}
	text := strings.TrimRight(string(out), "\n")
	if strings.TrimSpace(text) == "" {
		return "", fmt.Errorf("chafa returned an empty preview")
	}
	runes := []rune(text)
	if len(runes) > maxExternalRendererRunes {
		text = string(runes[:maxExternalRendererRunes]) + "\n[truncated]"
	}
	return text, nil
}

func renderCommandPreview(name string, timeout time.Duration, args ...string) (string, error) {
	if _, err := fileViewerLookPath(name); err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, name, args...)
	out, err := cmd.CombinedOutput()
	if ctx.Err() != nil {
		return "", ctx.Err()
	}
	text := strings.TrimRight(string(out), "\n")
	if err != nil {
		if strings.TrimSpace(text) != "" {
			return "", fmt.Errorf("%w: %s", err, firstLines(text, 6))
		}
		return "", err
	}
	if strings.TrimSpace(text) == "" {
		return "", fmt.Errorf("%s returned an empty preview", name)
	}
	return truncateExternalRendererText(text), nil
}

func renderHTMLPreview(path string) (string, string, error) {
	candidates := []struct {
		name string
		args []string
	}{
		{"w3m", []string{"-dump", path}},
		{"elinks", []string{"-dump", path}},
		{"lynx", []string{"-dump", path}},
		{"links", []string{"-dump", path}},
	}
	for _, c := range candidates {
		if _, err := fileViewerLookPath(c.name); err != nil {
			continue
		}
		text, err := renderCommandPreview(c.name, 5*time.Second, c.args...)
		return text, c.name, err
	}
	return "", "text browser", errMissingRenderer("w3m/elinks/lynx/links")
}

func renderPythonPreview(script, path string) (string, error) {
	if _, err := fileViewerLookPath("python3"); err != nil {
		return "", err
	}
	return renderCommandPreview("python3", 8*time.Second, "-c", script, path)
}

func truncateExternalRendererText(text string) string {
	runes := []rune(strings.TrimRight(text, "\n"))
	if len(runes) <= maxExternalRendererRunes {
		return string(runes)
	}
	return string(runes[:maxExternalRendererRunes]) + "\n[truncated]"
}

func firstLines(text string, limit int) string {
	lines := strings.Split(strings.TrimSpace(text), "\n")
	if len(lines) > limit {
		lines = lines[:limit]
	}
	return strings.Join(lines, "\n")
}

func localFileInfoText(entry fileTreeEntry, root string) string {
	rows := []string{
		"path: " + entry.Path,
		"root: " + root,
	}
	if entry.Size > 0 {
		rows = append(rows, "size: "+humanBytes(entry.Size))
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
		"If this file type matters to your workflow, please open an issue on the repository and include this extension: "+firstNonEmpty(ext, filepath.Ext(path), "unknown")+".",
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

func localFileRendererGuidance(ext string) string {
	present := func(name string) bool {
		_, err := fileViewerLookPath(name)
		return err == nil
	}
	switch ext {
	case ".png", ".jpg", ".jpeg", ".gif", ".webp":
		if _, err := fileViewerLookPath("chafa"); err == nil {
			return "chafa is installed, but the image could not be decoded."
		}
		return "install chafa for reliable terminal image previews."
	case ".html", ".htm":
		for _, tool := range []string{"w3m", "elinks", "lynx", "links"} {
			if present(tool) {
				return tool + " is installed but could not render this file."
			}
		}
		return "install w3m, elinks, lynx, or links for terminal HTML rendering."
	case ".pdf":
		for _, tool := range []string{"pdftotext", "mutool", "pandoc"} {
			if present(tool) {
				return tool + " is installed but could not extract text from this file."
			}
		}
		return "install pdftotext, mutool, or pandoc for PDF text previews."
	case ".parquet", ".arrow", ".feather":
		return "install Python pyarrow for schema and row previews."
	case ".h5", ".hdf5":
		return "install h5ls or Python h5py for HDF5 tree previews."
	case ".nc", ".nc4", ".cdf", ".netcdf":
		return "install ncdump, Python netCDF4, or xarray for NetCDF previews."
	case ".npy", ".npz":
		return "install Python numpy for array metadata and value previews."
	case ".bam", ".cram":
		return "install samtools for genomics header previews."
	case ".vcf.gz", ".bcf":
		return "install bcftools for genomics summary/header previews."
	case ".svg":
		return "SVG is best opened with the OS viewer until rasterization is wired in."
	default:
		return ""
	}
}

func parquetPreviewPython() string {
	return `
import sys
path = sys.argv[1]
try:
    import pyarrow as pa
    import pyarrow.parquet as pq
except Exception as exc:
    raise SystemExit(f"pyarrow unavailable: {exc}")

if path.lower().endswith(".parquet"):
    pf = pq.ParquetFile(path)
    print(f"parquet rows: {pf.metadata.num_rows}")
    print(f"row groups: {pf.metadata.num_row_groups}")
    print(f"columns: {pf.metadata.num_columns}")
    print()
    print(pf.schema)
    print()
    table = pf.read_row_group(0, columns=pf.schema.names[: min(8, len(pf.schema.names))])
else:
    table = pa.ipc.open_file(path).read_all()
    print(f"arrow rows: {table.num_rows}")
    print(f"columns: {table.num_columns}")
    print()
    print(table.schema)
    print()
print(table.slice(0, 20).to_pandas().to_string(index=False))
`
}

func hdf5PreviewPython() string {
	return `
import sys
path = sys.argv[1]
try:
    import h5py
except Exception as exc:
    raise SystemExit(f"h5py unavailable: {exc}")

with h5py.File(path, "r") as f:
    rows = []
    def visit(name, obj):
        kind = "group" if isinstance(obj, h5py.Group) else "dataset"
        if isinstance(obj, h5py.Dataset):
            rows.append(f"{name}  {kind}  shape={obj.shape} dtype={obj.dtype}")
        else:
            rows.append(f"{name}  {kind}")
    f.visititems(visit)
    print("hdf5 tree:")
    for row in rows[:200]:
        print(row)
    if len(rows) > 200:
        print(f"... {len(rows)-200} more objects")
`
}

func numpyPreviewPython() string {
	return `
import sys
path = sys.argv[1]
try:
    import numpy as np
except Exception as exc:
    raise SystemExit(f"numpy unavailable: {exc}")

obj = np.load(path, allow_pickle=False)
if hasattr(obj, "files"):
    print("npz archive:")
    for name in obj.files:
        arr = obj[name]
        print(f"{name}: shape={arr.shape} dtype={arr.dtype}")
        print(arr.reshape(-1)[:12])
else:
    arr = obj
    print(f"array: shape={arr.shape} dtype={arr.dtype}")
    print(arr.reshape(-1)[:24])
`
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
	fmt.Fprintf(&out, "jsonl: %d records (showing first %d)\n\n", len(lines), minInt(limit, len(lines)))
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

func previewDelimitedBytes(data []byte, ext string, limit int) (string, error) {
	r := csv.NewReader(strings.NewReader(string(data)))
	return previewDelimitedRecords(r, ext, limit)
}

func previewDelimitedFilePath(path string, ext string, limit int) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	r := csv.NewReader(f)
	return previewDelimitedRecords(r, ext, limit)
}

func previewDelimitedRecords(r *csv.Reader, ext string, limit int) (string, error) {
	if ext == ".tsv" {
		r.Comma = '\t'
	}
	r.FieldsPerRecord = -1
	header, err := r.Read()
	if err != nil {
		if err == io.EOF {
			return "(empty file)", nil
		}
		return "", err
	}
	rows := make([][]string, 0, limit)
	totalRows := 0
	for {
		row, err := r.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return "", err
		}
		totalRows++
		if len(rows) < limit {
			rows = append(rows, row)
		}
	}
	widths := make([]int, len(header))
	for i, h := range header {
		widths[i] = minInt(displayCellWidth(h), maxDelimitedPreviewCellWidth)
	}
	for _, row := range rows {
		for i := range header {
			if i < len(row) {
				widths[i] = maxInt(widths[i], minInt(displayCellWidth(row[i]), maxDelimitedPreviewCellWidth))
			}
		}
	}
	var out strings.Builder
	writePreviewRow(&out, header, widths)
	sep := make([]string, len(header))
	for i, w := range widths {
		sep[i] = strings.Repeat("-", w)
	}
	writePreviewRow(&out, sep, widths)
	for _, row := range rows {
		writePreviewRow(&out, row, widths)
	}
	fmt.Fprintf(&out, "\n%d data rows total (showing %d), %d columns", totalRows, len(rows), len(header))
	return out.String(), nil
}

const maxDelimitedPreviewCellWidth = 32

func writePreviewRow(out *strings.Builder, cells []string, widths []int) {
	for i, w := range widths {
		cell := ""
		if i < len(cells) {
			cell = truncateDelimitedCell(cells[i], w)
		}
		fmt.Fprintf(out, "%-*s  ", w, cell)
	}
	out.WriteString("\n")
}

func displayCellWidth(s string) int {
	return len([]rune(strings.ReplaceAll(s, "\n", " ")))
}

func truncateDelimitedCell(s string, width int) string {
	s = strings.ReplaceAll(s, "\n", " ")
	runes := []rune(s)
	if len(runes) <= width {
		return s
	}
	if width <= 3 {
		return strings.Repeat(".", maxInt(1, width))
	}
	return string(runes[:width-3]) + "..."
}

func (a *App) openFileViewerRootDetail() {
	mode := strings.TrimSpace(a.fileTreeRootMode)
	if mode == "" {
		mode = "folder"
	}
	status := "available"
	if strings.TrimSpace(a.fileTreeErr) != "" {
		status = "unavailable"
	}
	rows := []string{
		"root: " + a.fileViewerRoot,
		"mode: " + mode,
		"status: " + status,
	}
	if strings.TrimSpace(a.fileTreeErr) != "" {
		rows = append(rows,
			"",
			"The file browser cannot read this folder right now.",
			"",
			"details: "+a.fileTreeErr,
		)
	}
	a.detailView = &bulkyPartRef{
		messageID: "files",
		partID:    "root",
		title:     "Files · " + fileViewerUnavailableTitle(mode),
		fullText:  strings.Join(rows, "\n"),
		localPath: a.fileViewerRoot,
	}
	a.detailViewOpen = true
	a.detailScroll = 0
}

func (a *App) uploadCurrentFileDetail() tea.Cmd {
	if a.detailView == nil || a.detailView.messageID != "files" || strings.TrimSpace(a.detailView.localPath) == "" {
		a.transientHint = "upload unavailable for this detail"
		return scheduleHintExpire(a.transientHint)
	}
	sid := a.currentSessionID()
	if sid == "" {
		a.transientHint = "no active session to upload into"
		return scheduleHintExpire(a.transientHint)
	}
	if !a.caps.Capabilities.AttachmentsUpload {
		a.transientHint = "attachment upload unsupported by this backend"
		return scheduleHintExpire(a.transientHint)
	}
	path := a.detailView.localPath
	a.transientHint = "uploading " + filepath.Base(path) + "..."
	return tea.Batch(scheduleHintExpire(a.transientHint), uploadAttachmentFileCmd(a.c, sid, path, "read"))
}

func uploadAttachmentFileCmd(c *client.Client, sessionID, path, mode string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
		defer cancel()
		data, err := os.ReadFile(path)
		if err != nil {
			return contextFileUploadedMsg{sessionID: sessionID, localPath: path, err: err}
		}
		mimeType := mime.TypeByExtension(filepath.Ext(path))
		if mimeType == "" && len(data) > 0 {
			mimeType = http.DetectContentType(data[:minInt(len(data), 512)])
		}
		cf, err := c.UploadAttachment(ctx, sessionID, filepath.Base(path), mimeType, mode, data)
		return contextFileUploadedMsg{sessionID: sessionID, localPath: path, file: cf, err: err}
	}
}

func (a *App) fileViewerRootLabel() string {
	base := filepath.Base(a.fileViewerRoot)
	if base == "." || base == string(filepath.Separator) || base == "" {
		return a.fileViewerRoot
	}
	return base
}

func (a *App) renderFileViewerModuleRows(width int, startRow int, rowBudget int) []string {
	t := a.Theme
	title := a.sidebarModuleTitle(sidebarModuleFiles)
	visible := a.visibleFileTreeEntries()
	disclosure := "▾ "
	if a.sidebarFilesCollapsed {
		disclosure = "▸ "
		title += fmt.Sprintf(" (%d)", len(a.fileTreeEntries))
	}
	prefix := ""
	if a.focus == a.sidebarHitFocus && (a.sidebarSessionsCollapsed || a.sidebarSectionCursor) && a.sidebarSectionFocus == sidebarSectionFiles {
		prefix = lipgloss.NewStyle().Foreground(t.Secondary).Render("▌")
	}
	rows := []string{
		prefix + lipgloss.NewStyle().Bold(true).Foreground(t.Primary).Render(disclosure+title),
	}
	a.registerSidebarSectionHeaderHit(startRow, width, sidebarSectionFiles)
	if a.sidebarFilesCollapsed {
		return rows
	}
	rootLabel := a.fileViewerRootLabel()
	if rootLabel != "" {
		label := "root: " + rootLabel
		if a.fileTreeRootMode == "workspace" {
			label = "workspace: " + rootLabel
		}
		rows = append(rows, t.HintLabel.Italic(true).Render(truncate(label, width-6)))
		if !a.fileTreeUpdated.IsZero() && rowBudget > 2 {
			rows = append(rows, t.HintLabel.Render(truncate("updated "+humanAgeShort(time.Since(a.fileTreeUpdated)), width-6)))
		}
	}
	if a.fileTreeErr != "" {
		errorRow := startRow + len(rows)
		rows = append(rows, lipgloss.NewStyle().Foreground(t.Danger).Render(truncate("folder unavailable", width-6)))
		if rowBudget > 2 {
			rows = append(rows, t.HintLabel.Render(truncate("Enter for details", width-6)))
		}
		a.registerSidebarFileViewerErrorHit(errorRow, width)
		return rows
	}
	if len(visible) == 0 {
		rows = append(rows, t.HintLabel.Render("(empty)"))
		return rows
	}
	a.clampFileTreeSelection()
	if rowBudget < 1 {
		rowBudget = 8
	}
	win := selectedItemWindow(len(visible), a.fileTreeSel, rowBudget)
	if win.start > 0 {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.FgMuted).Render(fmt.Sprintf(" … %d above", win.start)))
	}
	for i := win.start; i < win.end; i++ {
		row := startRow + len(rows)
		entry := visible[i]
		rows = append(rows, a.renderFileTreeRow(entry, width, i == a.fileTreeSel))
		a.registerSidebarFileTreeHit(row, width, i)
	}
	if win.end < len(visible) {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.FgMuted).Render(fmt.Sprintf(" … %d below", len(visible)-win.end)))
	}
	return rows
}

func fileViewerUnavailableTitle(mode string) string {
	if strings.TrimSpace(mode) == "workspace" {
		return "workspace folder unavailable"
	}
	return "folder unavailable"
}

func (a *App) sidebarFileViewerRowCount(rowBudget int) int {
	if !a.sidebarHasEnabledModule(sidebarModuleFiles) {
		return 0
	}
	rows := 1
	if a.sidebarFilesCollapsed {
		return rows
	}
	rows++
	if !a.fileTreeUpdated.IsZero() && rowBudget > 2 {
		rows++
	}
	if a.fileTreeErr != "" || len(a.visibleFileTreeEntries()) == 0 {
		return rows + 1
	}
	visible := len(a.visibleFileTreeEntries())
	if visible > rowBudget {
		rows += rowBudget
		if a.fileTreeSel > 0 {
			rows++
		}
		if a.fileTreeSel < visible-1 {
			rows++
		}
		return rows
	}
	return rows + visible
}

func (a *App) renderFileTreeRow(entry fileTreeEntry, width int, selected bool) string {
	t := a.Theme
	marker := " "
	nameStyle := t.HintLabel
	if selected && a.focus == a.sidebarHitFocus && a.sidebarSectionFocus == sidebarSectionFiles && !a.sidebarSectionCursor {
		marker = lipgloss.NewStyle().Foreground(t.Secondary).Render("▌")
		nameStyle = lipgloss.NewStyle().Foreground(t.Secondary).Bold(true)
	}
	indent := strings.Repeat("  ", entry.Depth)
	icon := "• "
	meta := ""
	if entry.Dir {
		if a.fileTreeExpanded[entry.Path] {
			icon = "▾ "
		} else {
			icon = "▸ "
		}
	} else if entry.Size > 0 {
		meta = humanBytes(entry.Size)
	}
	contentW := width - 6
	if contentW < 8 {
		contentW = 8
	}
	metaStyle := lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true)
	metaW := lipgloss.Width(meta)
	nameBudget := contentW - lipgloss.Width(marker+indent+icon) - metaW - 1
	if nameBudget < 4 {
		nameBudget = 4
	}
	name := entry.Name
	if entry.Dir {
		name += "/"
	}
	line := marker + indent + icon + nameStyle.Render(truncate(name, nameBudget))
	if meta != "" {
		line += " " + metaStyle.Render(meta)
	}
	return truncate(line, contentW)
}

func (a *App) registerSidebarFileTreeHit(row int, width int, visibleIndex int) {
	if a.hits == nil {
		return
	}
	zone := a.sidebarHitFocus
	if zone != FocusRightSidebar {
		zone = FocusSidebar
	}
	id := "sidebar:files:item:" + itoa2(visibleIndex)
	if zone == FocusRightSidebar {
		id = "right-sidebar:files:item:" + itoa2(visibleIndex)
	}
	a.registerSidebarContentHit(id, row, width, 1, func(app *App) tea.Cmd {
		app.focus = zone
		app.sidebarSectionFocus = sidebarSectionFiles
		app.sidebarSectionCursor = false
		app.fileTreeSel = visibleIndex
		app.activateFileTreeSelection()
		return nil
	})
}

func (a *App) registerSidebarFileViewerErrorHit(row int, width int) {
	if a.hits == nil {
		return
	}
	zone := a.sidebarHitFocus
	if zone != FocusRightSidebar {
		zone = FocusSidebar
	}
	id := "sidebar:files:error"
	if zone == FocusRightSidebar {
		id = "right-sidebar:files:error"
	}
	a.registerSidebarContentHit(id, row, width, 1, func(app *App) tea.Cmd {
		app.focus = zone
		app.sidebarSectionFocus = sidebarSectionFiles
		app.sidebarSectionCursor = false
		app.openFileViewerRootDetail()
		return nil
	})
}
