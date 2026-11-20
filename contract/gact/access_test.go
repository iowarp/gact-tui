package gact

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestGuardChecksHostAndToken(t *testing.T) {
	ok := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) })
	h := Guard(ok, "s3cret", []string{"clio.lab.example"})
	cases := []struct {
		name, host, path, auth string
		want                   int
	}{
		{"loopback with token", "127.0.0.1:7779", "/v1/sessions", "Bearer s3cret", 200},
		{"localhost with token", "localhost:7779", "/v1/sessions", "Bearer s3cret", 200},
		{"ipv6 loopback with token", "[::1]:7779", "/v1/sessions", "Bearer s3cret", 200},
		{"allowed name with token", "clio.lab.example:7779", "/v1/sessions", "Bearer s3cret", 200},
		{"no token", "127.0.0.1:7779", "/v1/sessions", "", 401},
		{"wrong token", "127.0.0.1:7779", "/v1/permissions/p1", "Bearer nope", 401},
		{"health needs no token", "127.0.0.1:7779", "/v1/health", "", 200},
		{"rebound host", "evil.example:7779", "/v1/sessions", "Bearer s3cret", 403},
		{"rebound host on health", "evil.example", "/v1/health", "", 403},
	}
	for _, c := range cases {
		req := httptest.NewRequest(http.MethodGet, c.path, nil)
		req.Host = c.host
		if c.auth != "" {
			req.Header.Set("Authorization", c.auth)
		}
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != c.want {
			t.Errorf("%s: got %d, want %d", c.name, rec.Code, c.want)
		}
	}
}

func TestAdapterToken(t *testing.T) {
	t.Setenv(TokenEnv, "")
	if token, generated := AdapterToken(" given "); token != "given" || generated {
		t.Fatalf("flag value: %q %v", token, generated)
	}
	t.Setenv(TokenEnv, "from-env")
	if token, generated := AdapterToken(""); token != "from-env" || generated {
		t.Fatalf("env value: %q %v", token, generated)
	}
	t.Setenv(TokenEnv, "")
	first, generated := AdapterToken("")
	second, _ := AdapterToken("")
	if !generated || len(first) != 48 || first == second {
		t.Fatalf("generated tokens: %q %q %v", first, second, generated)
	}
}
