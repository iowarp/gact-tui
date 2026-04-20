// Package intro serves the baked-in splash art.
//
// The GRC logo is generated OFFLINE by chafa (hand-run by a
// maintainer — see `make intro-logo`) and checked in as raw ANSI
// truecolor halfblock text. Runtime just embeds the file, so the
// gact binary has no image-decoding dependency and no runtime
// chafa dependency. The maintainer workflow:
//
//	chafa --size 30x15 --symbols half --colors full --clear \
//	      tui/internal/intro/grc-logo.png \
//	    > tui/internal/intro/grc-logo.ansi
//
// License note: the logo asset is GRC's — used as the default
// splash per feedback_detach_intro_flicker_round2 item 4.
package intro

import (
	_ "embed"
	"strings"
)

//go:embed grc-logo.ansi
var grcLogoANSI string

// GRCLogo returns the baked-in GRC logo as ANSI truecolor halfblock
// art. The argument is accepted for API symmetry with future
// on-the-fly renderers; the current impl returns the ~30-col
// chafa-generated art unchanged regardless of width.
func GRCLogo(width int) string {
	_ = width
	return strings.TrimRight(grcLogoANSI, "\n")
}
