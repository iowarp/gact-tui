module github.com/JaimeCernuda/gact-tui/adapters/opencode

go 1.25.0

require (
	github.com/JaimeCernuda/gact-tui/contract/conformance v0.0.0-00010101000000-000000000000
	github.com/JaimeCernuda/gact-tui/emulator v0.0.0-00010101000000-000000000000
)

replace (
	github.com/JaimeCernuda/gact-tui/contract/conformance => ../../contract/conformance
	github.com/JaimeCernuda/gact-tui/emulator => ../../emulator
)
