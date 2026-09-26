package main

import (
	"fmt"
	"net"
	"net/http"
	"time"
)

// readinessProbeTimeout bounds one readiness probe. The backend is local, so a
// probe that has not answered by now is a stalled attempt; the next tick retries.
const readinessProbeTimeout = 800 * time.Millisecond

// readinessURL is the backend endpoint the desktop supervisor also treats as
// "ready": /v1/capabilities answering 200.
func readinessURL(args cliArgs) string {
	return fmt.Sprintf("http://%s/v1/capabilities", net.JoinHostPort(args.host, fmt.Sprintf("%d", args.port)))
}

// backendReady reports whether the spawned backend answers its readiness probe.
// It is how the launcher knows to stop printing "waiting for backend readiness":
// once the backend serves, the line would only claim a wait that is over (a
// backend with no provider selected is still ready; it builds its agent from a
// session's own model on the first message).
func backendReady(client *http.Client, args cliArgs) bool {
	req, err := http.NewRequest(http.MethodGet, readinessURL(args), nil)
	if err != nil {
		return false
	}
	req.Header.Set("Authorization", "Bearer "+args.token)
	resp, err := client.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}
