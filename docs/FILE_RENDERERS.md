# Local File Preview Renderers

The TUI file explorer can always open local workspace files in the detail
viewer, but not every format should be dumped as raw bytes. The local viewer
uses three tiers:

1. Built-in previewers for formats we can handle safely in Go.
2. Optional command-line tools for formats that already have reliable native
   renderers.
3. A clear unsupported state with an OS-open action and an issue prompt when
   the format is known but no preview path is wired yet.

The TUI does not silently install dependencies at runtime. Use the commands
below during workstation setup or packaging.

## Check This Machine

```sh
make file-renderers-check
```

This is read-only. It reports which optional tools and Python libraries are
available on the current `PATH`.

## Install Optional Native Renderers

```sh
make install-file-renderers
```

The installer detects `apt-get`, `dnf`, `pacman`, or Homebrew and attempts to
install packages one by one. If a package is not available on the current
platform, the script reports the failure and continues with the rest.
Linux package managers require root or passwordless `sudo`; without that, the
script reports the missing permission and leaves the machine unchanged.

Current native package set:

| Area | Tools |
|---|---|
| Terminal images | `chafa`, `timg`, `imgcat` |
| HTML text previews | `w3m`, `elinks`, `lynx`, `links` |
| Document/PDF text | `pandoc`, `pdftotext`, `mutool` |
| Scientific data | `h5ls`, `ncdump`, `bpls` |
| Genomics | `bcftools`, `samtools` |

### Ubuntu 24.04

On Ubuntu, the remaining native tools can be installed with:

```sh
sudo apt-get update
sudo apt-get install -y \
  chafa timg \
  w3m elinks lynx links \
  hdf5-tools netcdf-bin adios2-serial-bin \
  bcftools samtools
```

That command covers the currently missing native file-preview tools on this
machine: `chafa`, `timg`, `w3m`, `elinks`, `lynx`, `links`, `h5ls`,
`ncdump`, ADIOS2 `bpls`/`bpls.serial`, `bcftools`, and `samtools`.

For a fully idempotent workstation setup, including packages that may already
be present for PDF and document previews:

```sh
sudo apt-get update
sudo apt-get install -y \
  chafa timg \
  w3m elinks lynx links \
  pandoc poppler-utils mupdf-tools \
  hdf5-tools netcdf-bin adios2-serial-bin \
  bcftools samtools
```

`imgcat` is terminal-specific and is not a standard Ubuntu package. On Linux,
`chafa` and `timg` are the reliable terminal image preview dependencies. If a
terminal ships an `imgcat` helper or an equivalent subcommand, installing that
terminal integration is enough for the checker to report it.

Ubuntu's ADIOS2 package installs the BP listing command as `bpls.serial`; the
checker accepts either `bpls` or `bpls.serial`.

### Chafa And The Intro GIF Workflow

The checked-in TUI splash animation is generated offline with `chafa`; the
runtime binary embeds pre-rendered ANSI frames and does not shell out to
`chafa`. Maintainers only need `chafa` when regenerating the intro assets with
`make intro-logo-anim`.

On Ubuntu, the maintainer workflow needs:

```sh
sudo apt-get install -y chafa imagemagick
```

`imagemagick` provides the `convert` command used to split GIF frames before
`chafa` renders them.

## Install Python Scientific Libraries

```sh
make install-file-renderers-python
```

This runs the native install path and then installs Python libraries used for
scientific metadata previews into a dedicated virtual environment at
`~/.local/share/gact/renderers/python`:

```text
pyarrow h5py netCDF4 xarray numpy adios2
```

Set `GACT_RENDERER_PYTHON_VENV=/path/to/venv` or pass
`scripts/file-renderers.sh --install --with-python --python-venv /path/to/venv`
to choose a different environment. Set
`GACT_RENDERER_PYTHON=/path/to/python` if the TUI should use a specific
interpreter at runtime.

## Format Coverage Model

Built in, no external dependency:

| Format | Preview behavior |
|---|---|
| Markdown | Rendered Markdown plus raw mode |
| JSON | Pretty-printed JSON plus raw mode |
| JSONL/NDJSON | Line-by-line JSON preview plus raw mode |
| CSV/TSV | Compact table preview plus raw mode |
| Plain text/source/log files | Raw UTF-8 preview |

Optional renderer path:

| Format family | Planned renderer dependency |
|---|---|
| Images: PNG, JPEG, GIF, WebP | `chafa`, `timg`, or terminal-native `imgcat` |
| HTML | `w3m`, `elinks`, `lynx`, `links`, or `pandoc` for text mode |
| PDF | `pdftotext`, `mutool`, or `pandoc` |
| Parquet, Arrow, Feather | Python `pyarrow` |
| HDF5 | `h5ls` or Python `h5py` |
| NetCDF | `ncdump`, Python `netCDF4`, or `xarray` |
| NumPy arrays | Python `numpy` |
| ADIOS2 BP | `bpls`, `bpls.serial`, or Python `adios2` |
| BAM, SAM, CRAM | `samtools` |
| VCF/BCF | `bcftools` |

Known unsupported formats show a clean info state instead of raw binary bytes.
That state includes the reason, any optional renderer guidance the TUI can
infer from the machine, and the `o`/open action to hand the file to the OS
native application.

## Packaging Notes

`make install` intentionally installs only `gact` and `emulator-server`.
Package maintainers can add optional dependencies to their platform package, or
run `scripts/file-renderers.sh --install` as a separate setup step. Keeping the
renderer install separate avoids surprising system package changes during a
normal TUI install.
