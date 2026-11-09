# Shared helpers for the macOS signing scripts. Source this file; do not run
# it. Written for the bash 3.2 that ships with macOS (no mapfile, no
# associative arrays).

# Print "<kind>\t<path>" for every Mach-O file below "$1". <kind> is "exec"
# for executables and "lib" for dylibs and loadable bundles (Python extension
# modules). Object files and dSYM companions are skipped because codesign
# cannot sign them and notarization does not require them.
#
# Universal binaries print one extra "(for architecture ...)" line per slice
# in `file` output; only the whole-file line is kept.
macho_list() {
  local root="$1"
  find "$root" -type f -print0 \
    | xargs -0 file -N -F $'\t' \
    | awk -F'\t' '
        $1 ~ / \(for architecture [^)]*\):$/ { next }
        {
          type = $2
          sub(/^ +/, "", type)
          if (type !~ /^Mach-O/) next
          if (type ~ / object/ || type ~ /dSYM/) next
          kind = (type ~ /executable/) ? "exec" : "lib"
          print kind "\t" $1
        }'
}

# Nested code bundles (.app/.framework/.xpc/.bundle directories) below "$1",
# deepest first, so each is sealed only after everything inside it.
nested_bundle_list() {
  local root="$1"
  find "$root" -type d \( -name '*.app' -o -name '*.framework' -o -name '*.xpc' -o -name '*.bundle' \) -print \
    | awk -F/ '{ print NF "\t" $0 }' \
    | sort -t$'\t' -k1,1nr \
    | cut -f2-
}

# Signature flags line ("flags=0x10000(runtime)") for one file, or empty.
codesign_flags() {
  codesign -dv --verbose=2 "$1" 2>&1 | sed -n 's/^CodeDirectory .*flags=\(0x[0-9a-f]*([^)]*)\).*/\1/p'
}
