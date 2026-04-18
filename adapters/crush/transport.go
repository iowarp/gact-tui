package crush

import (
	"context"
	"net"
	"net/http"
	"strings"
	"time"
)

// ResolveUpstream normalizes the user-supplied --upstream value into
// (baseURL, client) where baseURL is what to prefix on s.upstream+path
// and client is an *http.Client whose Transport knows how to dial the
// underlying transport (TCP or Unix socket).
//
// Accepted forms:
//
//	http://host:port            → standard TCP, net.Dialer
//	https://host:port           → standard TCP + TLS, net.Dialer
//	unix:///path/to/socket      → Unix-socket dialer; baseURL becomes
//	                              "http://unix" so Go's http.Client
//	                              has a syntactically valid URL even
//	                              though the Transport intercepts the
//	                              network path before it matters.
//
// `timeout` applies to non-streaming requests (health/capabilities/
// list etc.). Long-lived SSE streams should use their own client with
// Timeout=0 that wraps the returned Transport — see proxySSE.
func ResolveUpstream(raw string, timeout time.Duration) (string, *http.Client) {
	if raw == "" {
		return "", &http.Client{Timeout: timeout}
	}
	if strings.HasPrefix(raw, "unix://") {
		path := strings.TrimPrefix(raw, "unix://")
		tr := &http.Transport{
			DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
				var d net.Dialer
				return d.DialContext(ctx, "unix", path)
			},
			// Disable connection reuse at high concurrency — Crush's
			// Unix-socket server historically doesn't pipeline, and
			// keep-alive with a single socket serializes requests.
			// Standard default (infinite reuse) is still correct; we
			// only force-close when we know the backend hates it.
			MaxIdleConnsPerHost: 10,
		}
		return "http://unix", &http.Client{Timeout: timeout, Transport: tr}
	}
	// HTTP(s): use defaults. Caller can pass its own client to New()
	// if more control is needed (mTLS, proxies, etc.).
	return strings.TrimRight(raw, "/"), &http.Client{Timeout: timeout}
}

// ResolveUpstreamTransport is the Transport-only variant used by the
// long-lived SSE handler — it needs Timeout=0 and the same dialer
// behaviour. Factored so the SSE path can't accidentally pick up a
// 10-second RPC timeout.
func ResolveUpstreamTransport(raw string) http.RoundTripper {
	if strings.HasPrefix(raw, "unix://") {
		path := strings.TrimPrefix(raw, "unix://")
		return &http.Transport{
			DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
				var d net.Dialer
				return d.DialContext(ctx, "unix", path)
			},
			MaxIdleConnsPerHost: 10,
		}
	}
	return http.DefaultTransport
}
