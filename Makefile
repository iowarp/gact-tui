# GACT TUI — convenience targets.
#
# Multi-module Go workspace, so the build/test commands have to chdir
# into each module. This Makefile collapses the most common workflows
# into single-word targets so new contributors don't have to memorise
# the layout.

GO        ?= go
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
TUI_LDFLAGS        ?= -X main.buildRevision=$(TUI_BUILD_REVISION) -X main.buildTime=$(TUI_BUILD_TIME) -X main.buildDirty=$(TUI_BUILD_DIRTY)

.PHONY: help build build-emulator build-tui test test-race \
        run-emulator run-tui ping list \
        screenshots clean fmt vet install dev-install verify-dev-install \
        install-for-clio verify-clio-install uninstall

help: ## Print this help message.
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-20s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

build: build-emulator build-tui ## Build the emulator + TUI binaries.

build-emulator: ## Build $(EMULATOR_BIN).
	cd emulator && $(GO) build -o $(notdir $(EMULATOR_BIN)) ./cmd/emulator-server

build-tui: ## Build $(TUI_BIN).
	cd tui && $(GO) build -ldflags '$(TUI_LDFLAGS)' -o $(notdir $(TUI_BIN)) .

test: ## Run unit + integration tests for every module.
	cd emulator && $(GO) test ./...
	cd tui && $(GO) test ./...
	cd contract/conformance && $(GO) test ./...
	cd adapters/opencode && $(GO) test ./...
	cd adapters/crush && $(GO) test ./...
	cd adapters/goose && $(GO) test ./...

test-race: ## Run tests under -race for every module.
	cd emulator && $(GO) test -race ./...
	cd tui && $(GO) test -race ./...
	cd contract/conformance && $(GO) test -race ./...
	cd adapters/opencode && $(GO) test -race ./...
	cd adapters/crush && $(GO) test -race ./...
	cd adapters/claudecode && $(GO) test -race ./...

vet: ## go vet every module.
	cd emulator && $(GO) vet ./...
	cd tui && $(GO) vet ./...
	cd contract/conformance && $(GO) vet ./...
	cd adapters/opencode && $(GO) vet ./...
	cd adapters/crush && $(GO) vet ./...

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

INTRO_SRC ?= logo/logo-vide-basic.gif  ## Source GIF for the intro animation; override with `make intro-logo-anim INTRO_SRC=logo/other.gif`.

intro-logo-anim: ## Regenerate tui/internal/intro/intro-{static,anim}.ansi from $(INTRO_SRC) using chafa.
	@if ! command -v chafa >/dev/null 2>&1 || ! command -v convert >/dev/null 2>&1; then \
		echo "chafa + imagemagick required"; exit 1; \
	fi
	@if [ ! -f $(INTRO_SRC) ]; then \
		echo "source GIF $(INTRO_SRC) not found; set INTRO_SRC=..."; exit 1; \
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

screenshots: build-tui ## Render every VHS tape under tui/ into screenshots/.
	@if ! command -v vhs >/dev/null 2>&1; then \
		echo "vhs not installed; see https://github.com/charmbracelet/vhs"; exit 1; \
	fi
	cd tui && for tape in *.tape; do \
		echo "rendering $$tape"; \
		GACT_BACKEND=http://localhost:$(PORT) vhs $$tape; \
	done

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
