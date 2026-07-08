package ui

// file_viewer_renderers.go drives external renderers (chafa/HTML/Python) for file-viewer detail modes.

import (
	"context"
	"errors"
	"fmt"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
	"os/exec"
	"strings"
	"time"
)

const maxExternalRendererRunes = 64 * 1024

var fileViewerLookPath = exec.LookPath

func (c *fileViewerComponent) externalDetailModes(fullPath, info, ext string) ([]fileDetailMode, bool) {
	switch ext {
	case ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg":
		rendered, err := c.renderChafaImage(fullPath)
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

var errRendererMissing = errors.New("renderer missing")

func errMissingRenderer(name string) error {
	return fmt.Errorf("%w: %s", errRendererMissing, name)
}

func (c *fileViewerComponent) renderChafaImage(path string) (string, error) {
	if _, err := fileViewerLookPath("chafa"); err != nil {
		return "", err
	}
	width := modalBodyContentWidth(c.app.modals.detailModalWidth()) - 4
	if width <= 0 {
		width = 80
	}
	width = valuefmt.MinInt(width, 96)
	height := maxInt(10, valuefmt.MinInt(28, maxInt(1, c.app.height-18)))
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
	return truncateExternalRendererText(text), nil
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
