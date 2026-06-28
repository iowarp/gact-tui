package ui

// file_viewer_renderer_messages.go formats unavailable-renderer messages and guidance for the file viewer.

import (
	"errors"
	"os/exec"
	"strings"
)

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
