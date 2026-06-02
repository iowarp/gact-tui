#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

go_cmd="${GO:-go}"
parallelism="${GACT_VERIFY_P:-1}"
test_timeout="${GACT_TEST_TIMEOUT:-15m}"

modules=()
while IFS= read -r mod; do
  modules+=("${mod#./}")
done < <(grep -oE '\./[^[:space:]]+' go.work)

if [ "${#modules[@]}" -eq 0 ]; then
  echo "no go.work modules found" >&2
  exit 1
fi

echo "== gofmt =="
unformatted="$(gofmt -l $(git ls-files '*.go'))"
if [ -n "$unformatted" ]; then
  echo "gofmt needs to run on:" >&2
  echo "$unformatted" >&2
  exit 1
fi

for mod in "${modules[@]}"; do
  echo "== ${mod}: vet =="
  (cd "$mod" && "$go_cmd" vet ./...)
  echo "== ${mod}: build =="
  (cd "$mod" && "$go_cmd" build ./...)
  echo "== ${mod}: test =="
  (cd "$mod" && "$go_cmd" test -v -timeout "$test_timeout" -p "$parallelism" ./... -count=1)
done

echo "== release binary =="
"$go_cmd" build -p "$parallelism" -o tui/gact ./tui

cat <<'EOF'

Release verification complete.

Real Claude Code adapter smokes are intentionally manual. Run them separately with:

  (cd adapters/claudecode && GACT_REAL_CLAUDE_SMOKE=1 go test -p 1 ./... -count=1 -run 'TestSmoke_RealClaude')

EOF
