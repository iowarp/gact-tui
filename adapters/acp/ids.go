package acp

import (
	"crypto/rand"
	"encoding/hex"
	"time"
)

// newID returns a random lowercase-hex id of n chars. Used for synthetic
// GACT resource ids (sessions, messages, parts, permissions) the bridge
// allocates on the agent's behalf.
func newID(n int) string {
	b := make([]byte, (n+1)/2)
	if _, err := rand.Read(b); err != nil {
		return hex.EncodeToString([]byte(time.Now().UTC().Format("150405.000000")))[:n]
	}
	return hex.EncodeToString(b)[:n]
}

// nowISO is the RFC3339 timestamp format GACT uses on the wire (§2).
func nowISO() string {
	return time.Now().UTC().Format(time.RFC3339)
}
