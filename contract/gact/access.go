package gact

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"net"
	"net/http"
	"os"
	"strings"
)

// TokenEnv names the environment variable an adapter reads its bearer token from.
const TokenEnv = "GACT_ADAPTER_TOKEN"

// AdapterToken returns the configured token (the flag value, else TokenEnv), or a
// new random one when neither is set. generated reports the last case, so the
// adapter can print it for the person connecting.
func AdapterToken(flagValue string) (token string, generated bool) {
	if t := strings.TrimSpace(flagValue); t != "" {
		return t, false
	}
	if t := strings.TrimSpace(os.Getenv(TokenEnv)); t != "" {
		return t, false
	}
	buf := make([]byte, 24)
	if _, err := rand.Read(buf); err != nil {
		panic("gact: no randomness for the adapter token: " + err.Error())
	}
	return hex.EncodeToString(buf), true
}

// IsLoopbackHost reports whether a bind address or Host name is this computer's loopback.
func IsLoopbackHost(host string) bool {
	host = strings.ToLower(strings.Trim(strings.TrimSpace(host), "[]"))
	if host == "localhost" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

// Guard admits a request only when its Host names loopback or one of allowedHosts,
// and, except for GET /v1/health, it carries "Authorization: Bearer <token>".
//
// An adapter drives a coding agent in the user's workspace. Without these checks,
// anything that can reach its port could prompt the agent and approve its tool
// calls: another account on the computer, a network peer, or a web page that
// rebinds its own domain to 127.0.0.1.
func Guard(next http.Handler, token string, allowedHosts []string) http.Handler {
	allowed := map[string]bool{}
	for _, host := range allowedHosts {
		if h := strings.ToLower(strings.TrimSpace(host)); h != "" {
			allowed[h] = true
		}
	}
	expected := []byte("Bearer " + token)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host := r.Host
		if h, _, err := net.SplitHostPort(host); err == nil {
			host = h
		}
		if !IsLoopbackHost(host) && !allowed[strings.ToLower(host)] {
			http.Error(w, "host not allowed; add it with -allowed-hosts", http.StatusForbidden)
			return
		}
		if r.URL.Path != "/v1/health" &&
			subtle.ConstantTimeCompare([]byte(r.Header.Get("Authorization")), expected) != 1 {
			w.Header().Set("WWW-Authenticate", "Bearer")
			http.Error(w, "a valid bearer token is required", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}
