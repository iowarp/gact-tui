# GACT TUI — convenience targets.
#
# Multi-module Go workspace, so the build/test commands have to chdir
# into each module. This Makefile collapses the most common workflows
# into single-word targets so new contributors don't have to memorise
# the layout.

GO        ?= go
PNPM      ?= pnpm
GO_TEST_FLAGS ?= -timeout=20m
TUI_BIN      ?= tui/gact
PORT      ?= 8787
THEME     ?= dark
PREFIX    ?= $(HOME)/.local
BINDIR    ?= $(PREFIX)/bin
CLIO_GACT_BIN ?= $(HOME)/.local/share/clio/gact
# The build stamp is the COMMIT, never a tag description: cli_version.go
# truncates BuildRevision to 12 chars and verify-dev-install matches it against
# `git rev-parse --short=12 HEAD`, so a `git describe` string here renders as
# "revision: v0.9.9-176-g" and can never match on a clone that has tags.
TUI_BUILD_REVISION ?= $(shell git rev-parse HEAD 2>/dev/null || echo unknown)
TUI_BUILD_TIME     ?= $(shell git show -s --format=%cI HEAD 2>/dev/null || echo unknown)
TUI_BUILD_DIRTY    ?= $(shell test -n "$$(git status --porcelain --untracked-files=no 2>/dev/null)" && echo true || echo false)
# `--match 'v[0-9]*'` pins the semantic version to the TUI's own tag namespace:
# the repo also cuts `clio-desktop-v*` tags, which must never become the TUI's
# reported version (tui/internal/version/version.go documents this same form).
TUI_VERSION        ?= $(shell git describe --tags --match 'v[0-9]*' --always --dirty 2>/dev/null || echo dev)
TUI_VERSION_PKG    := github.com/JaimeCernuda/gact-tui/tui/internal/version
TUI_LDFLAGS        ?= -X $(TUI_VERSION_PKG).BuildRevision=$(TUI_BUILD_REVISION) -X $(TUI_VERSION_PKG).BuildTime=$(TUI_BUILD_TIME) -X $(TUI_VERSION_PKG).BuildDirty=$(TUI_BUILD_DIRTY) -X $(TUI_VERSION_PKG).Release=$(TUI_VERSION)

.PHONY: help build build-web build-tui test test-web test-go test-tui test-race adapter-py-test \
        check-size run-tui ping list \
        screenshots clean fmt vet install dev-install verify-dev-install \
        install-for-clio verify-clio-install uninstall \
        file-renderers-check install-file-renderers install-file-renderers-python

help: ## Print this help message.
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-20s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

build: build-web ## Build the primary web workspace.

build-web: ## Typecheck and build the React workspace.
	$(PNPM) build

build-tui: ## Build $(TUI_BIN).
	cd tui && GOWORK=off $(GO) build -ldflags '$(TUI_LDFLAGS)' -o $(notdir $(TUI_BIN)) .

test: test-web ## Run the primary web/core/desktop test gate.

test-web: ## Run JavaScript workspace tests without opt-in live suites.
	$(PNPM) test

test-go: ## Run the remaining contract and adapter Go suites.
	node scripts/go-workspace.mjs test

test-tui: ## Run the deprecated TUI compatibility suite explicitly.
	node scripts/check_tui_emulator_boundary.mjs
	cd tui && GOWORK=off $(GO) test $(GO_TEST_FLAGS) ./...

test-race: ## Run tests under -race for every module.
	node scripts/go-workspace.mjs race

vet: ## go vet every module.
	node scripts/go-workspace.mjs vet

adapter-py-test: ## Run the Python claude-agent-sdk-server adapter tests.
	cd adapters/claude-agent-sdk-server && uv run pytest tests/test_bridge.py tests/test_endpoints.py

check-size: ## Ratchet guard: Go file sizes + tui/internal/ui package growth (enforcing).
	python3 scripts/check_go_file_size.py --enforce

fmt: ## gofmt every remaining Go workspace module.
	node scripts/go-workspace.mjs fmt

run-tui: build-tui ## Run the TUI against http://localhost:$(PORT) with $(THEME) theme.
	GACT_BACKEND=http://localhost:$(PORT) ./$(TUI_BIN) --theme $(THEME)

ping: build-tui ## Probe the running backend (set $(PORT) to override).
	GACT_BACKEND=http://localhost:$(PORT) ./$(TUI_BIN) ping

list: build-tui ## List sessions on the running backend.
	GACT_BACKEND=http://localhost:$(PORT) ./$(TUI_BIN) list

# No intro source GIF is tracked in this repo (the historical
# logo/logo-video.gif is gone); callers must supply one:
# `make intro-logo-anim INTRO_SRC=path/to/logo.gif`.
INTRO_SRC ?=

intro-logo-anim: ## Regenerate tui/internal/intro/intro-{static,anim}.ansi from $(INTRO_SRC) using chafa.
	@if ! command -v chafa >/dev/null 2>&1 || ! command -v convert >/dev/null 2>&1; then \
		echo "chafa + imagemagick required"; exit 1; \
	fi
	@if [ -z "$(INTRO_SRC)" ] || [ ! -f "$(INTRO_SRC)" ]; then \
		echo "INTRO_SRC='$(INTRO_SRC)': source gif not in repo -- see apps/branding for the brand mechanism; pass INTRO_SRC=path/to/logo.gif"; exit 1; \
	fi
	@rm -rf /tmp/gact-intro-frames && mkdir -p /tmp/gact-intro-frames
	convert $(INTRO_SRC) -coalesce /tmp/gact-intro-frames/f%02d.png
	@: > tui/internal/intro/intro-anim.ansi
	@for f in /tmp/gact-intro-frames/f*.png; do \
		chafa --size 30x15 --symbols half --colors full --threshold 0.1 --clear "$$f" 2>/dev/null | \
		python3 -c 'import sys,re; d=sys.stdin.buffer.read(); d=re.sub(rb"\x1b\[\?25[lh]",b"",d); d=re.sub(rb"\x1b\[2J\x1b\[0H",b"",d); d=re.sub(rb"\x1b\[0H",b"",d); sys.stdout.buffer.write(d.strip(b"\n")+b"\n\x0c\n")' \
		>> tui/internal/intro/intro-anim.ansi ; \
	done
	@# Static fallback = first frame only.
	@chafa --size 30x15 --symbols half --colors full --threshold 0.1 --clear /tmp/gact-intro-frames/f00.png 2>/dev/null | \
		python3 -c 'import sys,re; d=sys.stdin.buffer.read(); d=re.sub(rb"\x1b\[\?25[lh]",b"",d); d=re.sub(rb"\x1b\[2J\x1b\[0H",b"",d); d=re.sub(rb"\x1b\[0H",b"",d); sys.stdout.buffer.write(d.strip(b"\n")+b"\n")' \
		> tui/internal/intro/intro-static.ansi
	@echo "wrote tui/internal/intro/intro-anim.ansi ($$(grep -c $$'\f' tui/internal/intro/intro-anim.ansi) frames) + intro-static.ansi (fallback)"

screenshots: build-tui ## Render every VHS tape under tui/testdata/tapes/ into screenshots/.
	@if ! command -v vhs >/dev/null 2>&1; then \
		echo "vhs not installed; see https://github.com/charmbracelet/vhs"; exit 1; \
	fi
	# Run VHS from the repo root so tapes with a repo-relative `Output
	# screenshots/<name>.gif` land in the top-level screenshots/ directory.
	for tape in tui/testdata/tapes/*.tape; do \
		echo "rendering $$tape"; \
		GACT_BACKEND=http://localhost:$(PORT) vhs $$tape; \
	done

file-renderers-check: ## Check optional local file preview renderer dependencies.
	scripts/file-renderers.sh --check

install-file-renderers: ## Install as many native local file preview renderers as possible.
	scripts/file-renderers.sh --install

install-file-renderers-python: ## Install native renderers plus Python scientific preview libraries.
	scripts/file-renderers.sh --install --with-python

install: build-tui ## Install the deprecated gact TUI to $(BINDIR).
	@install -d $(BINDIR)
	install -m 0755 $(TUI_BIN) $(BINDIR)/gact
	@echo
	@echo "Installed:"
	@echo "  $(BINDIR)/gact"
	@echo
	@echo "Make sure $(BINDIR) is on PATH. For tab-completion:"
	@echo "  scripts/completion.sh   # prints per-shell install instructions"

dev-install: build-tui ## Rebuild TUI and link both shell gact + CLIO's gact to this checkout.
	@install -d $(BINDIR) $(dir $(CLIO_GACT_BIN))
	ln -sfn $(CURDIR)/$(TUI_BIN) $(BINDIR)/gact
	ln -sfn $(CURDIR)/$(TUI_BIN) $(CLIO_GACT_BIN)
	@echo
	@echo "Linked current checkout:"
	@printf "  shell gact: %s -> %s\n" "$(BINDIR)/gact" "$$(readlink -f $(BINDIR)/gact)"
	@printf "  CLIO gact:  %s -> %s\n" "$(CLIO_GACT_BIN)" "$$(readlink -f $(CLIO_GACT_BIN))"
	@stat -c "  binary mtime: %y %n" $(TUI_BIN)

install-for-clio: dev-install ## Alias: rebuild and point the clio launcher at this checkout's TUI.

verify-dev-install: ## Fail unless shell gact + CLIO gact resolve to this checkout and current HEAD.
	@expected="$(CURDIR)/$(TUI_BIN)"; \
	head="$$(git rev-parse --short=12 HEAD)"; \
	shell_path="$$(command -v gact || true)"; \
	if [ -z "$$shell_path" ]; then \
		echo "verify-dev-install: gact is not on PATH"; exit 1; \
	fi; \
	shell_resolved="$$(readlink -f "$$shell_path" 2>/dev/null || true)"; \
	bindir_resolved="$$(readlink -f "$(BINDIR)/gact" 2>/dev/null || true)"; \
	clio_resolved="$$(readlink -f "$(CLIO_GACT_BIN)" 2>/dev/null || true)"; \
	if [ "$$shell_resolved" != "$$expected" ]; then \
		echo "verify-dev-install: PATH gact resolves to $$shell_resolved, want $$expected"; exit 1; \
	fi; \
	if [ "$$bindir_resolved" != "$$expected" ]; then \
		echo "verify-dev-install: $(BINDIR)/gact resolves to $$bindir_resolved, want $$expected"; exit 1; \
	fi; \
	if [ "$$clio_resolved" != "$$expected" ]; then \
		echo "verify-dev-install: $(CLIO_GACT_BIN) resolves to $$clio_resolved, want $$expected"; exit 1; \
	fi; \
	version="$$(gact version)"; \
	if ! printf '%s\n' "$$version" | grep -q "revision: $$head"; then \
		printf '%s\n' "$$version"; \
		echo "verify-dev-install: gact revision does not match HEAD $$head; run make dev-install"; exit 1; \
	fi; \
	printf '%s\n' "$$version"; \
	printf "Verified shell and CLIO gact both resolve to %s at HEAD %s\n" "$$expected" "$$head"

verify-clio-install: verify-dev-install ## Alias: verify the clio launcher is using this checkout's current TUI.

uninstall: ## Remove the installed binaries.
	rm -f $(BINDIR)/gact

clean: ## Remove built binaries.
	rm -f $(TUI_BIN)
