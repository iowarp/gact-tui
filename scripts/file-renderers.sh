#!/usr/bin/env bash
set -euo pipefail

mode="check"
with_python=0
python_venv="${GACT_RENDERER_PYTHON_VENV:-${HOME}/.local/share/gact/renderers/python}"

usage() {
  cat <<'EOF'
Usage:
  scripts/file-renderers.sh [--check|--install] [--with-python] [--python-venv DIR]

Checks or installs optional local-file renderers used by the GACT TUI file
detail view. Check mode is read-only. Install mode uses the detected package
manager and installs packages one by one so unavailable packages do not block
the rest.

Options:
  --check        Report installed/missing tools. This is the default.
  --install     Install as many native renderer packages as possible.
  --with-python Also install scientific Python libraries into a GACT venv.
  --python-venv  Python venv path for scientific renderer libraries.
  -h, --help    Show this help.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --check) mode="check" ;;
    --install) mode="install" ;;
    --with-python) with_python=1 ;;
    --python-venv)
      shift
      if [ "$#" -eq 0 ]; then
        echo "--python-venv requires a directory" >&2
        exit 2
      fi
      python_venv="$1"
      ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

have() {
  command -v "$1" >/dev/null 2>&1
}

show_tool() {
  local tool="$1"
  local purpose="$2"
  if have "$tool"; then
    printf "ok      %-12s %s\n" "$tool" "$(command -v "$tool")"
  else
    printf "missing %-12s %s\n" "$tool" "$purpose"
  fi
}

show_any_tool() {
  local label="$1"
  local purpose="$2"
  shift 2
  local tool
  for tool in "$@"; do
    if have "$tool"; then
      printf "ok      %-12s %s (%s)\n" "$label" "$(command -v "$tool")" "$tool"
      return
    fi
  done
  printf "missing %-12s %s\n" "$label" "$purpose"
}

python_bin() {
  if [ -n "${GACT_RENDERER_PYTHON:-}" ]; then
    if [ -x "$GACT_RENDERER_PYTHON" ]; then
      printf "%s\n" "$GACT_RENDERER_PYTHON"
      return 0
    fi
    echo "GACT_RENDERER_PYTHON is not executable: ${GACT_RENDERER_PYTHON}" >&2
    return 1
  fi
  if [ -x "${python_venv}/bin/python" ]; then
    printf "%s\n" "${python_venv}/bin/python"
    return 0
  fi
  if have python3; then
    command -v python3
  elif have python; then
    command -v python
  else
    return 1
  fi
}

show_python_import() {
  local module="$1"
  local purpose="$2"
  local py
  if ! py="$(python_bin)"; then
    printf "missing %-12s %s\n" "python" "$purpose"
    return
  fi
  if "$py" -c "import ${module}" >/dev/null 2>&1; then
    printf "ok      %-12s import %s via %s\n" "$module" "$module" "$py"
  else
    printf "missing %-12s %s\n" "$module" "$purpose"
  fi
}

check_renderers() {
  echo "Terminal image renderers"
  show_tool chafa "images: install chafa"
  show_tool timg "images: install timg"
  show_tool imgcat "images: install imgcat when using iTerm2/WezTerm"
  echo

  echo "HTML and document renderers"
  show_tool w3m "HTML text render: install w3m"
  show_tool elinks "HTML text render: install elinks"
  show_tool lynx "HTML text render: install lynx"
  show_tool links "HTML text render: install links"
  show_tool pandoc "HTML/PDF/document fallback: install pandoc"
  show_tool pdftotext "PDF text: install poppler-utils"
  show_tool mutool "PDF text: install mupdf-tools"
  echo

  echo "Scientific and genomics command-line renderers"
  show_tool h5ls "HDF5: install hdf5-tools"
  show_tool ncdump "NetCDF: install netcdf-bin"
  show_any_tool bpls "ADIOS2 BP: install ADIOS2 command-line tools" bpls bpls.serial
  show_tool bcftools "VCF/BCF: install bcftools"
  show_tool samtools "BAM/SAM/CRAM: install samtools"
  echo

  echo "Scientific Python libraries"
  show_python_import pyarrow "Parquet/Arrow/Feather: pip install pyarrow"
  show_python_import h5py "HDF5 fallback: pip install h5py"
  show_python_import netCDF4 "NetCDF fallback: pip install netCDF4"
  show_python_import xarray "NetCDF fallback: pip install xarray"
  show_python_import numpy "NumPy arrays: pip install numpy"
  show_python_import adios2 "ADIOS2 fallback: pip install adios2"
}

detect_pm() {
  if have apt-get; then echo apt; return; fi
  if have dnf; then echo dnf; return; fi
  if have pacman; then echo pacman; return; fi
  if have brew; then echo brew; return; fi
  echo ""
}

run_as_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  elif have sudo && sudo -n true >/dev/null 2>&1; then
    sudo "$@"
  else
    echo "need root privileges for: $*" >&2
    echo "run this command in a terminal with sudo access, or install the packages listed in docs/FILE_RENDERERS.md." >&2
    return 1
  fi
}

can_run_root_commands() {
  if [ "$(id -u)" -eq 0 ]; then
    return 0
  fi
  have sudo && sudo -n true >/dev/null 2>&1
}

install_one() {
  local pm="$1"
  local pkg="$2"
  echo "installing ${pkg}"
  case "$pm" in
    apt) run_as_root apt-get install -y "$pkg" ;;
    dnf) run_as_root dnf install -y "$pkg" ;;
    pacman) run_as_root pacman -S --noconfirm --needed "$pkg" ;;
    brew) brew install "$pkg" ;;
    *) echo "no supported package manager detected" >&2; return 1 ;;
  esac
}

install_native() {
  local pm="$1"
  local packages=()
  if [ "$pm" != "brew" ] && ! can_run_root_commands; then
    echo "Native renderer install needs root privileges." >&2
    echo "Re-run from an interactive terminal with sudo access, or install packages manually from docs/FILE_RENDERERS.md." >&2
    return 1
  fi
  case "$pm" in
    apt)
      run_as_root apt-get update
      packages=(
        chafa timg w3m elinks lynx links pandoc poppler-utils mupdf-tools
        hdf5-tools netcdf-bin bcftools samtools adios2-serial-bin
      )
      ;;
    dnf)
      packages=(
        chafa timg w3m elinks lynx links pandoc poppler-utils mupdf-tools
        hdf5-tools netcdf bcftools samtools adios2
      )
      ;;
    pacman)
      packages=(
        chafa timg w3m elinks lynx links pandoc poppler mupdf-tools
        hdf5 netcdf bcftools samtools adios2
      )
      ;;
    brew)
      packages=(
        chafa timg w3m elinks lynx links pandoc poppler mupdf
        hdf5 netcdf bcftools samtools adios2
      )
      ;;
    *)
      echo "No supported package manager found. See docs/FILE_RENDERERS.md." >&2
      return 1
      ;;
  esac

  local failed=0
  for pkg in "${packages[@]}"; do
    if ! install_one "$pm" "$pkg"; then
      echo "warning: failed to install ${pkg}" >&2
      failed=1
    fi
  done
  return "$failed"
}

install_python() {
  local py
  if ! py="$(python_bin)"; then
    echo "python is not installed; skipping Python renderer libraries" >&2
    return 1
  fi
  local in_venv
  in_venv="$("$py" -c 'import sys; print("1" if sys.prefix != getattr(sys, "base_prefix", sys.prefix) else "0")')"
  if [ "$in_venv" != "1" ]; then
    echo "creating renderer Python environment at ${python_venv}"
    "$py" -m venv "$python_venv"
    py="${python_venv}/bin/python"
  fi
  if ! "$py" -m pip --version >/dev/null 2>&1; then
    echo "pip is not available for ${py}; skipping Python renderer libraries" >&2
    echo "Set GACT_RENDERER_PYTHON to an interpreter with pip, or install pip for ${py}." >&2
    return 1
  fi
  "$py" -m pip install --upgrade pyarrow h5py netCDF4 xarray numpy adios2
  GACT_RENDERER_PYTHON="$py"
  export GACT_RENDERER_PYTHON
  echo "renderer Python: ${py}"
  echo "set GACT_RENDERER_PYTHON=${py} when launching gact if the TUI cannot auto-detect it."
}

if [ "$mode" = "check" ]; then
  check_renderers
  exit 0
fi

pm="$(detect_pm)"
if [ -z "$pm" ]; then
  echo "No supported package manager found. See docs/FILE_RENDERERS.md." >&2
  exit 1
fi

install_native "$pm" || true
if [ "$with_python" -eq 1 ]; then
  install_python || true
fi

echo
echo "Renderer status after install attempt:"
check_renderers
