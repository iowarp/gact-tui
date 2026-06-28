package ui

// intro_update.go defines the intro-stage tick message.

import "time"

// MMMMMMMMM1: introTickMsg advances the animated splash by one
// frame. introTick returns a cmd that re-fires itself on the
// fixed frame cadence so the splash loops smoothly.
type introTickMsg struct{}

// introFrameDelay is the fallback per-frame delay: 36 frames x 90ms
// ~= 3.2s per loop. Slowed from the initial 33ms/frame (30 FPS) per
// user feedback on the basic-crop logo; at that rate the rotation
// blurred past before the viewer could appreciate it. NNNNNNNNN1:
// users can override via config.IntroFrameDelayMs; main.go plumbs
// that into App.IntroFrameDelay, which tickerComponent.tickDelay()
// clamps to [20ms, 1s] before handing to scheduleTick.
const introFrameDelay = 90 * time.Millisecond
