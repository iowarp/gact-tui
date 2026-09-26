package main

import (
	"net"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
)

func argsFor(t *testing.T, server *httptest.Server, token string) cliArgs {
	t.Helper()
	host, portText, err := net.SplitHostPort(server.Listener.Addr().String())
	if err != nil {
		t.Fatal(err)
	}
	port, err := strconv.Atoi(portText)
	if err != nil {
		t.Fatal(err)
	}
	return cliArgs{host: host, port: port, token: token}
}

func capabilitiesServer(status int) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/capabilities" || r.Header.Get("Authorization") != "Bearer tok" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.WriteHeader(status)
	}))
}

func TestBackendReadyWhenCapabilitiesAnswer(t *testing.T) {
	server := capabilitiesServer(http.StatusOK)
	defer server.Close()
	if !backendReady(server.Client(), argsFor(t, server, "tok")) {
		t.Fatal("a backend answering /v1/capabilities 200 must read as ready")
	}
}

func TestBackendNotReadyWhileStarting(t *testing.T) {
	server := capabilitiesServer(http.StatusServiceUnavailable)
	defer server.Close()
	if backendReady(server.Client(), argsFor(t, server, "tok")) {
		t.Fatal("a 503 is not ready")
	}
}

func TestBackendReadinessSendsTheBearerToken(t *testing.T) {
	server := capabilitiesServer(http.StatusOK)
	defer server.Close()
	if backendReady(server.Client(), argsFor(t, server, "wrong")) {
		t.Fatal("the probe must authenticate with the launcher's own token")
	}
}

func TestBackendNotReadyWhenNothingListens(t *testing.T) {
	server := capabilitiesServer(http.StatusOK)
	args := argsFor(t, server, "tok")
	server.Close()
	if backendReady(&http.Client{Timeout: readinessProbeTimeout}, args) {
		t.Fatal("a closed port is not ready")
	}
}
