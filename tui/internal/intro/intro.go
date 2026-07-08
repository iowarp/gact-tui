// Package intro serves the baked-in splash art.
//
// The animation + static fallback are generated OFFLINE from a
// source GIF / PNG by chafa (see the maintainer workflow in the
// root Makefile's `intro-logo-anim` target). The bytes are checked
// in as ANSI truecolor halfblock text and `go:embed`-ed so runtime
// has no image decoder or chafa dep.
//
// Current asset: iowarp_logo.gif (80 frames, 762x718). Swap by
// running `make intro-logo-anim INTRO_SRC=<path-to-new-asset>.gif`
// (brand assets live under apps/design/assets/brand/).
package intro

import (
	_ "embed"
	"strings"
)

//go:embed intro-static.ansi
var introStaticANSI string

//go:embed intro-anim.ansi
var introAnimANSI string

// StaticLogo returns the one-frame fallback splash (first frame of
// the source animation). Used when the animation embed is empty
// (maintainer hasn't run `make intro-logo-anim`). The width
// argument is accepted for API symmetry; the bake is at 30x15.
func StaticLogo(width int) string {
	_ = width
	return strings.TrimRight(introStaticANSI, "\n")
}

// AnimFrames returns every animation frame as separate strings.
// Frames are separated in the source file by a form-feed char (\f)
// which chafa's halfblock renderer never emits on its own. Empty
// return = maintainer hasn't baked the animation; callers should
// fall back to StaticLogo.
func AnimFrames() []string {
	if strings.TrimSpace(introAnimANSI) == "" {
		return nil
	}
	raw := strings.Split(introAnimANSI, "\f")
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

// Deprecated shims — keep the GRC names working until the app.go
// callsite is updated in the same change. Both delegate to the
// neutral names above.
func GRCLogo(width int) string { return StaticLogo(width) }
func GRCLogoFrames() []string  { return AnimFrames() }
