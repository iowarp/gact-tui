# GACT TUI — convenience targets.
#
# Multi-module Go workspace, so the build/test commands have to chdir
# into each module. This Makefile collapses the most common workflows
# into single-word targets so new contributors don't have to memorise
# the layout.

GO        ?= go
GO_TEST_FLAGS ?= -timeout=20m
# Go modules, derived from go.work so the test/test-race/vet targets can
# never drift out of sync with the workspace (each `./path` becomes a module
# to chdir into). Adding a module to go.work is enough to include it here.
GO_MODULES := $(shell grep -oE '\./[^ ]+' go.work)
EMULATOR_BIN ?= emulator/emulator-server
TUI_BIN      ?= tui/gact
PORT      ?= 7777
THEME     ?= dark
TIMING    ?= realistic
PREFIX    ?= $(HOME)/.local
BINDIR    ?= $(PREFIX)/bin
CLIO_GACT_BIN ?= $(HOME)/.local/share/clio/gact
TUI_BUILD_REVISION := $(shell git rev-parse HEAD 2>/dev/null)
TUI_BUILD_TIME     := $(shell git show -s --format=%cI HEAD 2>/dev/null)
TUI_BUILD_DIRTY    := $(shell test -n "$$(git status --porcelain --untracked-files=no 2>/dev/null)" && echo true || echo false)
# Semantic version from git tags: latest reachable v-tag + commits-since + ghash
# (+ -dirty when the tree has uncommitted changes), e.g. v0.3.0-2098-g31c252e7.
TUI_VERSION        := $(shell git describe --tags --match 'v[0-9]*' --always --dirty 2>/dev/null)
TUI_VERSION_PKG    := github.com/JaimeCernuda/gact-tui/tui/internal/version
TUI_LDFLAGS        ?= -X $(TUI_VERSION_PKG).BuildRevision=$(TUI_BUILD_REVISION) -X $(TUI_VERSION_PKG).BuildTime=$(TUI_BUILD_TIME) -X $(TUI_VERSION_PKG).BuildDirty=$(TUI_BUILD_DIRTY) -X $(TUI_VERSION_PKG).Release=$(TUI_VERSION)

.PHONY: help build build-emulator build-tui test test-race adapter-py-test \
        check-size run-emulator run-tui ping list \
        screenshots clean fmt vet install dev-install verify-dev-install \
        install-for-clio verify-clio-install uninstall \
        file-renderers-check install-file-renderers install-file-renderers-python

help: ## Print this help message.
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-20s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

build: build-emulator build-tui ## Build the emulator + TUI binaries.

build-emulator: ## Build $(EMULATOR_BIN).
	cd emulator && $(GO) build -o $(notdir $(EMULATOR_BIN)) ./cmd/emulator-server

build-tui: ## Build $(TUI_BIN).
	cd tui && $(GO) build -ldflags '$(TUI_LDFLAGS)' -o $(notdir $(TUI_BIN)) .

test: ## Run unit + integration tests for every module.
	@for mod in $(GO_MODULES); do \
		echo "==> test $$mod"; \
		( cd $$mod && $(GO) test $(GO_TEST_FLAGS) ./... ) || exit $$?; \
	done

test-race: ## Run tests under -race for every module.
	@for mod in $(GO_MODULES); do \
		echo "==> test -race $$mod"; \
		( cd $$mod && $(GO) test $(GO_TEST_FLAGS) -race ./... ) || exit $$?; \
	done

vet: ## go vet every module.
	@for mod in $(GO_MODULES); do \
		echo "==> vet $$mod"; \
		( cd $$mod && $(GO) vet ./... ) || exit $$?; \
	done

adapter-py-test: ## Run the Python claude-agent-sdk-server adapter tests.
	cd adapters/claude-agent-sdk-server && uv run pytest tests/test_bridge.py tests/test_endpoints.py

check-size: ## Ratchet guard: Go file sizes + tui/internal/ui package growth (warn-only until 2026-09-01).
	python3 scripts/check_go_file_size.py

fmt: ## gofmt every module's source tree.
	$(GO) fmt ./emulator/... ./tui/... ./contract/... ./adapters/...

run-emulator: build-emulator ## Run the emulator on $(PORT) with $(TIMING) pacing.
	./$(EMULATOR_BIN) --port $(PORT) --timing $(TIMING)

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

install: build ## Install gact + emulator-server to $(BINDIR) (default ~/.local/bin).
	@install -d $(BINDIR)
	install -m 0755 $(TUI_BIN) $(BINDIR)/gact
	install -m 0755 $(EMULATOR_BIN) $(BINDIR)/emulator-server
	@echo
	@echo "Installed:"
	@echo "  $(BINDIR)/gact"
	@echo "  $(BINDIR)/emulator-server"
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
	rm -f $(BINDIR)/gact $(BINDIR)/emulator-server

clean: ## Remove built binaries.
	rm -f $(EMULATOR_BIN) $(TUI_BIN)
