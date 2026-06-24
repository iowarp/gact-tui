package ui

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
)

func TestFileViewerMarkdownDetailOffersRenderedAndRawModes(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "README.md"), []byte("# Demo\n\n**bold** text\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.fileViewer.setRoot(root)
	a.fileViewer.fileTreeSel = 0

	a.fileViewer.activateSelection()

	if !a.detail.visible || a.detail.ref == nil {
		t.Fatal("markdown file should open detail")
	}
	if len(a.detail.ref.fileModes) != 2 || a.detail.ref.fileMode != "rendered" {
		t.Fatalf("markdown modes = %#v active=%q, want rendered/raw", a.detail.ref.fileModes, a.detail.ref.fileMode)
	}
	if !strings.Contains(stripANSI(a.detail.ref.fullText), "Demo") {
		t.Fatalf("rendered markdown detail missing content:\n%s", a.detail.ref.fullText)
	}
	model, _ := a.detail.handleKey(tea.KeyPressMsg{Code: tea.KeyTab})
	a = model.(*App)
	if a.detail.ref.fileMode != "raw" || !strings.Contains(a.detail.ref.fullText, "**bold**") {
		t.Fatalf("tab should switch to raw markdown, mode=%q text:\n%s", a.detail.ref.fileMode, a.detail.ref.fullText)
	}
}

func TestFileViewerJSONDetailOffersPrettyAndRawModes(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "data.json"), []byte(`{"ok":true,"n":2}`), 0o644); err != nil {
		t.Fatal(err)
	}
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.fileViewer.setRoot(root)
	a.fileViewer.fileTreeSel = 0

	a.fileViewer.activateSelection()

	if !a.detail.visible || a.detail.ref == nil {
		t.Fatal("json file should open detail")
	}
	if len(a.detail.ref.fileModes) != 2 || a.detail.ref.fileMode != "pretty" {
		t.Fatalf("json modes = %#v active=%q, want pretty/raw", a.detail.ref.fileModes, a.detail.ref.fileMode)
	}
	if !strings.Contains(a.detail.ref.fullText, "\"ok\": true") {
		t.Fatalf("pretty json missing formatted body:\n%s", a.detail.ref.fullText)
	}
}

func TestFileViewerCSVDetailOffersTableAndRawModes(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "stations.csv"), []byte("station,value\nMTA1,1.2\nPKRD,0.9\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.fileViewer.setRoot(root)
	a.fileViewer.fileTreeSel = 0

	a.fileViewer.activateSelection()

	if !a.detail.visible || a.detail.ref == nil {
		t.Fatal("csv file should open detail")
	}
	if len(a.detail.ref.fileModes) != 2 || a.detail.ref.fileMode != "table" {
		t.Fatalf("csv modes = %#v active=%q, want table/raw", a.detail.ref.fileModes, a.detail.ref.fileMode)
	}
	if !strings.Contains(a.detail.ref.fullText, "station") || !strings.Contains(a.detail.ref.fullText, "2 data rows total") {
		t.Fatalf("table preview missing expected summary:\n%s", a.detail.ref.fullText)
	}
}

func TestFileViewerLargeCSVStreamsTablePreview(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "stations.csv")
	if err := os.WriteFile(path, []byte("station,value,note\nMTA1,1.2,representative row\nPKRD,0.9,another row\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.fileViewer.setRoot(root)
	entry := fileTreeEntry{Path: "stations.csv", Size: maxLocalFilePreviewBytes + 1}

	modes := a.fileViewer.fileDetailModes(entry, path)

	if len(modes) != 2 || modes[0].id != "table" || modes[1].id != "info" {
		t.Fatalf("large csv modes = %#v, want table/info", modes)
	}
	if !strings.Contains(modes[0].text, "MTA1") || !strings.Contains(modes[0].text, "2 data rows total") {
		t.Fatalf("large csv table missing preview rows:\n%s", modes[0].text)
	}
	if strings.Contains(modes[1].text, "representative row") {
		t.Fatalf("large csv info should not include raw body:\n%s", modes[1].text)
	}
}

func TestFileViewerImageDetailRendersWithChafaWhenAvailable(t *testing.T) {
	root := t.TempDir()
	bin := t.TempDir()
	chafaPath := filepath.Join(bin, "chafa")
	if err := os.WriteFile(chafaPath, []byte("#!/bin/sh\nprintf 'IMAGE PREVIEW\\n@@@\\n'\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))
	path := filepath.Join(root, "plot.png")
	if err := os.WriteFile(path, []byte{0x89, 'P', 'N', 'G', 0x0d, 0x0a}, 0o644); err != nil {
		t.Fatal(err)
	}
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.fileViewer.setRoot(root)
	a.width = 120
	a.height = 40

	modes := a.fileViewer.fileDetailModes(fileTreeEntry{Path: "plot.png", Size: 6}, path)

	if len(modes) != 2 || modes[0].id != "image" {
		t.Fatalf("image modes = %#v, want image/info", modes)
	}
	if !strings.Contains(modes[0].text, "renderer: chafa") || !strings.Contains(modes[0].text, "IMAGE PREVIEW") {
		t.Fatalf("image preview did not use chafa output:\n%s", modes[0].text)
	}
	if strings.Contains(modes[0].text, "follow-up") || strings.Contains(modes[0].text, "unsupported") {
		t.Fatalf("image preview should not advertise future work:\n%s", modes[0].text)
	}
}

func TestFileViewerExternalRendererOutputUsesSharedTruncation(t *testing.T) {
	text := strings.Repeat("x", maxExternalRendererRunes+8) + "\n"

	got := truncateExternalRendererText(text)

	if !strings.HasSuffix(got, "\n[truncated]") {
		t.Fatalf("external renderer output should carry truncation marker, got suffix %q", got[len(got)-20:])
	}
	if strings.Contains(got, strings.Repeat("x", maxExternalRendererRunes+1)) {
		t.Fatal("external renderer output exceeded max rune cap before marker")
	}
}

func TestFileViewerEnterOnRightSidebarImageOpensRenderedPreview(t *testing.T) {
	root := t.TempDir()
	bin := t.TempDir()
	chafaPath := filepath.Join(bin, "chafa")
	if err := os.WriteFile(chafaPath, []byte("#!/bin/sh\nprintf 'IMAGE PREVIEW FROM ENTER\\n'\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))
	if err := os.WriteFile(filepath.Join(root, "plot.png"), []byte{0x89, 'P', 'N', 'G', 0x0d, 0x0a}, 0o644); err != nil {
		t.Fatal(err)
	}
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.fileViewer.setRoot(root)
	a.focus = FocusRightSidebar
	a.sidebar.hitFocus = FocusRightSidebar
	a.sidebar.sectionFocus = sidebarSectionFiles
	a.sidebar.sectionCursor = false
	a.fileViewer.fileTreeSel = 0

	model, _ := a.Update(tea.KeyPressMsg{Code: tea.KeyEnter})
	a = model.(*App)

	if !a.detail.visible || a.detail.ref == nil || a.detail.ref.fileMode != "image" {
		t.Fatalf("enter should open image detail, open=%v detail=%+v", a.detail.visible, a.detail.ref)
	}
	if !strings.Contains(a.detail.ref.fullText, "IMAGE PREVIEW FROM ENTER") {
		t.Fatalf("image detail missing chafa output:\n%s", a.detail.ref.fullText)
	}
}

func TestFileViewerEnterOnRightSidebarLargeCSVOpensTablePreview(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "large.csv"), []byte("station,value,note\nMTA1,1.2,representative row\nPKRD,0.9,another row\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.fileViewer.setRoot(root)
	a.fileViewer.fileTreeEntries = []fileTreeEntry{{Path: "large.csv", Name: "large.csv", Size: maxLocalFilePreviewBytes + 1}}
	a.focus = FocusRightSidebar
	a.sidebar.hitFocus = FocusRightSidebar
	a.sidebar.sectionFocus = sidebarSectionFiles
	a.sidebar.sectionCursor = false
	a.fileViewer.fileTreeSel = 0

	model, _ := a.Update(tea.KeyPressMsg{Code: tea.KeyEnter})
	a = model.(*App)

	if !a.detail.visible || a.detail.ref == nil || a.detail.ref.fileMode != "table" {
		t.Fatalf("enter should open csv table detail, open=%v detail=%+v", a.detail.visible, a.detail.ref)
	}
	if !strings.Contains(a.detail.ref.fullText, "MTA1") || !strings.Contains(a.detail.ref.fullText, "2 data rows total") {
		t.Fatalf("large csv detail missing table preview:\n%s", a.detail.ref.fullText)
	}
	if strings.Contains(a.detail.ref.fullText, "inline preview limit") {
		t.Fatalf("large csv table should not be blocked by raw preview limit:\n%s", a.detail.ref.fullText)
	}
}

func TestFileViewerPDFDetailUsesInstalledTextRenderer(t *testing.T) {
	root := t.TempDir()
	bin := t.TempDir()
	if err := os.WriteFile(filepath.Join(bin, "pdftotext"), []byte("#!/bin/sh\nprintf 'PDF PREVIEW\\npage text\\n'\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", bin)
	path := filepath.Join(root, "report.pdf")
	if err := os.WriteFile(path, []byte("%PDF-1.4\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))

	modes := a.fileViewer.fileDetailModes(fileTreeEntry{Path: "report.pdf", Size: 9}, path)

	if len(modes) != 2 || modes[0].id != "text" {
		t.Fatalf("pdf modes = %#v, want text/info", modes)
	}
	if !strings.Contains(modes[0].text, "renderer: pdftotext") || !strings.Contains(modes[0].text, "PDF PREVIEW") {
		t.Fatalf("pdf preview missing renderer output:\n%s", modes[0].text)
	}
}

func TestFileViewerScientificBinaryDetailUsesAvailableRenderer(t *testing.T) {
	root := t.TempDir()
	bin := t.TempDir()
	if err := os.WriteFile(filepath.Join(bin, "h5ls"), []byte("#!/bin/sh\nprintf '/data Dataset {10, 3}\\n'\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(bin, "python3"), []byte("#!/bin/sh\nprintf 'PYTHON SCIENCE PREVIEW\\nrows: 20\\n'\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", bin)
	h5Path := filepath.Join(root, "sample.h5")
	parquetPath := filepath.Join(root, "sample.parquet")
	for _, path := range []string{h5Path, parquetPath} {
		if err := os.WriteFile(path, []byte{0x00, 0x01, 0x02}, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))

	h5Modes := a.fileViewer.fileDetailModes(fileTreeEntry{Path: "sample.h5", Size: 3}, h5Path)
	if len(h5Modes) != 2 || h5Modes[0].id != "tree" || !strings.Contains(h5Modes[0].text, "/data Dataset") {
		t.Fatalf("hdf5 renderer modes = %#v text:\n%s", h5Modes, h5Modes[0].text)
	}
	parquetModes := a.fileViewer.fileDetailModes(fileTreeEntry{Path: "sample.parquet", Size: 3}, parquetPath)
	if len(parquetModes) != 2 || parquetModes[0].id != "table" || !strings.Contains(parquetModes[0].text, "PYTHON SCIENCE PREVIEW") {
		t.Fatalf("parquet renderer modes = %#v text:\n%s", parquetModes, parquetModes[0].text)
	}
}

func TestFileViewerRendererFallbackDoesNotAdvertiseFutureWork(t *testing.T) {
	root := t.TempDir()
	t.Setenv("PATH", t.TempDir())
	path := filepath.Join(root, "report.html")
	if err := os.WriteFile(path, []byte("<h1>Report</h1>"), 0o644); err != nil {
		t.Fatal(err)
	}
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))

	modes := a.fileViewer.fileDetailModes(fileTreeEntry{Path: "report.html", Size: 15}, path)

	if len(modes) != 1 || modes[0].id != "info" {
		t.Fatalf("html missing renderer modes = %#v, want info", modes)
	}
	for _, bad := range []string{"future work", "follow-up", "not wired", "not rendered"} {
		if strings.Contains(strings.ToLower(modes[0].text), bad) {
			t.Fatalf("fallback should not advertise stale implementation status %q:\n%s", bad, modes[0].text)
		}
	}
	if !strings.Contains(modes[0].text, "Missing renderer") {
		t.Fatalf("fallback should name missing renderer:\n%s", modes[0].text)
	}
}

func TestFileViewerLargeFileShowsInfoWithoutReadingInline(t *testing.T) {
	root := t.TempDir()
	name := filepath.Join(root, "large.log")
	if err := os.WriteFile(name, []byte("too large for preview"), 0o644); err != nil {
		t.Fatal(err)
	}
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	entry := fileTreeEntry{Path: "large.log", Size: maxLocalFilePreviewBytes + 1}

	modes := a.fileViewer.fileDetailModes(entry, name)

	if len(modes) != 1 || modes[0].id != "info" {
		t.Fatalf("large file modes = %#v, want single info mode", modes)
	}
	if !strings.Contains(modes[0].text, "inline preview limit") || strings.Contains(modes[0].text, "too large for preview") {
		t.Fatalf("large file info should explain the limit without reading body:\n%s", modes[0].text)
	}
}

func TestFileViewerBinaryDetailShowsUnsupportedState(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "blob.bin"), []byte{0x00, 0x01, 0xff, 0x02}, 0o644); err != nil {
		t.Fatal(err)
	}
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.fileViewer.setRoot(root)
	a.fileViewer.fileTreeSel = 0

	a.fileViewer.activateSelection()

	if !a.detail.visible || a.detail.ref == nil {
		t.Fatal("binary file should open an info detail")
	}
	if a.detail.ref.fileMode != "info" || !strings.Contains(a.detail.ref.fullText, "preview: unsupported") {
		t.Fatalf("binary detail should show unsupported state, mode=%q text:\n%s", a.detail.ref.fileMode, a.detail.ref.fullText)
	}
	if strings.Contains(a.detail.ref.fullText, "\x00") {
		t.Fatalf("binary detail leaked raw NUL bytes:\n%s", a.detail.ref.fullText)
	}
}

func BenchmarkLocalFileMarkdownDetailModes(b *testing.B) {
	root := b.TempDir()
	var body strings.Builder
	body.WriteString("# Preview\n\n| station | value | note |\n| --- | --- | --- |\n")
	for i := 0; i < 200; i++ {
		body.WriteString("| MTA1 | 1.2 | representative row |\n")
	}
	path := filepath.Join(root, "guide.md")
	if err := os.WriteFile(path, []byte(body.String()), 0o644); err != nil {
		b.Fatal(err)
	}
	entry := fileTreeEntry{Path: "guide.md", Size: int64(len(body.String()))}
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.fileViewer.setRoot(root)
	a.width = 140
	a.height = 40

	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		modes := a.fileViewer.fileDetailModes(entry, path)
		if len(modes) != 2 {
			b.Fatalf("modes = %#v, want rendered/raw", modes)
		}
	}
}

func BenchmarkLocalFileCSVDetailModes(b *testing.B) {
	root := b.TempDir()
	var body strings.Builder
	body.WriteString("station,value,note\n")
	for i := 0; i < 500; i++ {
		body.WriteString("MTA1,1.2,representative row\n")
	}
	path := filepath.Join(root, "stations.csv")
	if err := os.WriteFile(path, []byte(body.String()), 0o644); err != nil {
		b.Fatal(err)
	}
	entry := fileTreeEntry{Path: "stations.csv", Size: int64(len(body.String()))}
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.fileViewer.setRoot(root)

	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		modes := a.fileViewer.fileDetailModes(entry, path)
		if len(modes) != 2 {
			b.Fatalf("modes = %#v, want table/raw", modes)
		}
	}
}

func BenchmarkLocalFileLargeDetailGuard(b *testing.B) {
	root := b.TempDir()
	path := filepath.Join(root, "large.log")
	if err := os.WriteFile(path, []byte("small body should not be read when size metadata exceeds limit"), 0o644); err != nil {
		b.Fatal(err)
	}
	entry := fileTreeEntry{Path: "large.log", Size: maxLocalFilePreviewBytes + 1}
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.fileViewer.setRoot(root)

	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		modes := a.fileViewer.fileDetailModes(entry, path)
		if len(modes) != 1 || modes[0].id != "info" {
			b.Fatalf("modes = %#v, want single info mode", modes)
		}
	}
}
