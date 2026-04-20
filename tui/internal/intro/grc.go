// Package intro serves the baked-in splash art.
//
// Both the static logo and the animated 36-frame version are
// generated OFFLINE from PNG / GIF sources by chafa (see the
// maintainer workflow in the root Makefile's `intro-logo` target).
// The bytes are checked in as ANSI truecolor halfblock text and
// `go:embed`-ed so runtime has no image decoder or chafa dep.
//
// License note: the logo asset is GRC's.
package intro

import (
	_ "embed"
	"strings"
)

//go:embed grc-logo.ansi
var grcLogoANSI string

//go:embed grc-logo-anim.ansi
var grcLogoAnimANSI string

// GRCLogo returns the static baked-in GRC logo as ANSI truecolor
// halfblock art. The width argument is accepted for API symmetry
// and currently ignored (chafa bakes at the 30x15 target).
func GRCLogo(width int) string {
	_ = width
	return strings.TrimRight(grcLogoANSI, "\n")
}

// GRCLogoFrames returns every animation frame as separate strings.
// Baked from the 36-frame grc.iit.edu logo-video.gif; each frame
// is chafa-rendered at 30x15 truecolor halfblock. The caller flips
// through them on a tick to drive the animated splash.
// MMMMMMMMM1: an empty return means the embed file wasn't populated
// (maintainer hasn't run `make intro-logo-anim` yet) — callers
// should fall back to the static GRCLogo.
func GRCLogoFrames() []string {
	if strings.TrimSpace(grcLogoAnimANSI) == "" {
		return nil
	}
	// Frames are separated by a form-feed char (\f) that chafa's
	// halfblock renderer never emits on its own.
	raw := strings.Split(grcLogoAnimANSI, "\f")
	out := make([]string, 0, len(raw))
	for _, f := range raw {
		t := strings.Trim(f, "\n")
		if t == "" {
			continue
		}
		out = append(out, t)
	}
	return out
}
