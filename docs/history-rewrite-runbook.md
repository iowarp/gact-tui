# Owner runbook: the git history rewrite (PREPARED, NOT EXECUTED)

This runbook is a **document for the repository owner**. It is intentionally not
executed by any automated slice — a history rewrite is destructive, requires a
coordinated re-clone window, and must be run by a human with push access to the
canonical remote. The Phase 4 cleanup slices (#234 / #235) are all
non-destructive; they cap the working-tree **tip** size but cannot shrink the
downloaded pack, because the large blobs still live in history.

## Why a rewrite is needed

Non-destructive slices cap the TIP at ~60 MiB (post-H1) but a fresh clone still
downloads the full **683.31 MiB** pack. There is no single giant blob to drop:
the bulk is thousands of ~0.8 MiB full-screen PNGs, each versioned five or more
times across the visual-loop and screenshot churn.

History composition (measured with `git filter-repo --analyze`, per-path
disk-usage over all history):

| Path | History size | Tip size |
|---|---|---|
| `visual_loop/` | 377.45 MiB | 0.98 MiB |
| `apps/` | 195.02 MiB | 46.4 MiB (historical web-screenshot churn) |
| `screenshots/` | 88.66 MiB | ~55–60 MiB (curated) |
| `logo/` | 3.55 MiB | (consolidated into `apps/` by H5) |
| `ref/` | 1.63 MiB | 1.63 MiB (small, referenced) |
| `tui/` | 9.94 MiB | 9.94 MiB |

## Pre-conditions

- H1 (screenshot run-dump purge) **and** H5 (LFS-for-new + brand consolidation)
  merged.
- No open PRs; **freeze merges** for the duration of the rewrite window.
- Announce the re-clone window to all contributors.
- Inventory forks and worktrees that will need to be re-based or discarded.

## Steps

Run against a **fresh mirror clone**, never the working checkout:

```sh
git clone --mirror git@github.com:iowarp/gact-tui.git gact-tui-rewrite && cd gact-tui-rewrite
git filter-repo --analyze   # confirm per-path numbers

git filter-repo --invert-paths \
  --path emulator-server \
  --path logo/logo-video.gif.bak --path logo/logo-video.gif \
  --path-glob 'visual_loop/screenshots/*' \
  --path-glob 'visual_loop/tui_audit_*' \
  --path-glob 'visual_loop/*.log' --path-glob 'visual_loop/**/*.jsonl' \
  --path-glob 'visual_loop/sess_*.json' \
  --path-glob 'screenshots/dedup-fix-verify-*' \
  --path-glob 'screenshots/ndp-demo-*' \
  --path-glob 'screenshots/streaming-verify*' --path-glob 'screenshots/unify-verify-*' \
  --path tui/screenshots

# apps historical media churn: identify dead dirs from the analyze report; add as further
# --invert-paths globs. Do NOT use --strip-blobs-bigger-than (would strip live tip blobs,
# e.g. apps/design/fonts/BungeeSpice-Regular.ttf 1.5 MiB).

git lfs migrate import --everything \
  --include="screenshots/**/*.png,apps/**/*.png,apps/design/assets/brand/**,*.gif"

git reflog expire --expire=now --all && git gc --prune=now --aggressive
git count-objects -v -H     # acceptance: ~30–80 MiB
git push --force --mirror origin
```

## Post-rewrite checklist

- Every contributor **re-clones** (old clones cannot fast-forward across a
  rewrite).
- Re-create branch protection rules on the remote.
- **clio-agent's `external/gact-tui` submodule pin no longer exists** — the old
  commit SHAs are gone. Update the submodule pin the same day.
- Run full CI on `develop` and `main`.
- Delete stale `.audit-wt` worktrees.
- Verify the GitHub LFS quota after the `git lfs migrate import` step.
