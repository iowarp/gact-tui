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

.PHONY: help build build-emulator build-tui test test-race \
        run-emulator run-tui ping list \
        screenshots clean fmt vet install uninstall

help: ## Print this help message.
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-20s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

build: build-emulator build-tui ## Build the emulator + TUI binaries.

build-emulator: ## Build $(EMULATOR_BIN).
	cd emulator && $(GO) build -o $(notdir $(EMULATOR_BIN)) ./cmd/emulator-server

build-tui: ## Build $(TUI_BIN).
	cd tui && $(GO) build -o $(notdir $(TUI_BIN)) .

test: ## Run unit + integration tests for every module.
	cd emulator && $(GO) test ./...
	cd tui && $(GO) test ./...
	cd contract/conformance && $(GO) test ./...
	cd adapters/opencode && $(GO) test ./...
	cd adapters/crush && $(GO) test ./...

test-race: ## Run tests under -race for every module.
	cd emulator && $(GO) test -race ./...
	cd tui && $(GO) test -race ./...
	cd contract/conformance && $(GO) test -race ./...
	cd adapters/opencode && $(GO) test -race ./...
	cd adapters/crush && $(GO) test -race ./...

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

uninstall: ## Remove the installed binaries.
	rm -f $(BINDIR)/gact $(BINDIR)/emulator-server

clean: ## Remove built binaries.
	rm -f $(EMULATOR_BIN) $(TUI_BIN)
