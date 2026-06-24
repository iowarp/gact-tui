package scenario

import "strings"

type multiToolStep struct {
	name   string
	input  string
	result string
}

// SSSSSSSSS1: variants can optionally emit a sibling file_diff
// part after the tool loop so "many tools" demonstrates the real
// edit flow (a/r apply/reject on the diff). When diff fields are
// empty the script skips emitting it — variants 1 + 2 that don't
// centre on an edit keep their old shape.
var multiToolVariants = []struct {
	intro      string
	tools      []multiToolStep
	followup   string
	diffPath   string
	diffLang   string
	diffBefore string
	diffAfter  string
}{
	{
		// SSSSSSSSS1: variant 0 used to return a 2-line main.go and a
		// 1-line grep hit — too shallow to exercise the expand /
		// per-part navigation flows. It now reads TWO realistic Go
		// files back to back (main.go and handlers.go, each ~50
		// lines), runs a grep that hits both, and proposes an edit.
		// Gives the body cursor multiple bulky tool_results to
		// target with `[`/`]`+Ctrl+E.
		intro: "I'll audit the logging hygiene in two steps: read both the entry " +
			"point and the handlers module, then grep for stray `println` " +
			"calls, then propose an edit that swaps them for `log.Println`.",
		tools: []multiToolStep{
			{"read_file", `{"path":"main.go"}`, multiToolVariant0MainGo},
			{"read_file", `{"path":"internal/handlers/handlers.go"}`, multiToolVariant0HandlersGo},
			{"grep", `{"pattern":"println\\(","path":"."}`, multiToolVariant0GrepHits},
			{"edit_file", `{"path":"main.go"}`, "ok"},
		},
		followup: "Done. Two files read (main.go = 52 lines, handlers.go = 48 " +
			"lines), 14 `println` call sites found across three packages, and " +
			"an edit proposal applied to main.go line 38. The diff is staged " +
			"— select the edit_file block and press `a` to apply or `r` to " +
			"reject.",
		diffPath:   "main.go",
		diffLang:   "go",
		diffBefore: multiToolVariant0DiffBefore,
		diffAfter:  multiToolVariant0DiffAfter,
	},
	{
		intro: "Three-step migration check: list the schema, pull a sample row, " +
			"verify the type matches what the new code expects.",
		tools: []multiToolStep{
			{"shell", `{"command":"psql -c '\\d users'"}`,
				"                Table \"public.users\"\n" +
					" Column     | Type           | Nullable | Default\n" +
					"------------+----------------+----------+----------\n" +
					" id         | uuid           | not null |\n" +
					" email      | text           | not null |\n" +
					" created_at | timestamp tz   | not null | now()\n"},
			{"shell", `{"command":"psql -c 'SELECT * FROM users LIMIT 1'"}`,
				"                  id                  |       email       |       created_at\n" +
					"--------------------------------------+-------------------+------------------------\n" +
					" 8a31...d7c2                          | alice@example.com | 2025-12-04 19:42:01+00\n"},
			{"shell", `{"command":"go vet ./internal/users/..."}`, ""},
		},
		followup: "Schema looks healthy: uuid PK, email NOT NULL, created_at default. " +
			"`go vet` passed too — the new code's types line up with the existing " +
			"row shape. Migration should be safe to run.",
	},
	{
		intro: "Quick triage: pull the failing test name, find the file it lives in, " +
			"then run just that test verbose.",
		tools: []multiToolStep{
			{"shell", `{"command":"go test ./... 2>&1 | grep FAIL | head -3"}`,
				"--- FAIL: TestUserAuth_RejectsBadToken (0.02s)\n" +
					"--- FAIL: TestUserAuth_AcceptsValidJWT (0.01s)\n" +
					"FAIL\tinternal/auth\t0.043s"},
			{"grep", `{"pattern":"func TestUserAuth_","path":"./internal/auth"}`,
				"./internal/auth/middleware_test.go:42:func TestUserAuth_RejectsBadToken(t *testing.T) {\n" +
					"./internal/auth/middleware_test.go:71:func TestUserAuth_AcceptsValidJWT(t *testing.T) {"},
			{"shell", `{"command":"go test -v -run 'TestUserAuth_AcceptsValidJWT' ./internal/auth/"}`,
				"=== RUN   TestUserAuth_AcceptsValidJWT\n" +
					"    middleware_test.go:78: token validation: expected 200, got 403\n" +
					"--- FAIL: TestUserAuth_AcceptsValidJWT (0.01s)\n" +
					"FAIL"},
		},
		followup: "Test file is `internal/auth/middleware_test.go`. The valid-JWT case " +
			"is failing at line 78 — got 403 where it expected 200. Likely the " +
			"middleware's `claims.Audience` check changed; want me to diff the " +
			"middleware against last week?",
	},
}

// PPPPP1: cycling cast of long-reply payloads. Each variant has a
// distinct opening "thinking" line + body so multiple "long
// explain" turns produce visibly different writeups, exercising

var multiToolVariant0MainGo = strings.Join([]string{
	"package main",
	"",
	"import (",
	"\t\"context\"",
	"\t\"errors\"",
	"\t\"flag\"",
	"\t\"fmt\"",
	"\t\"log\"",
	"\t\"net/http\"",
	"\t\"os\"",
	"\t\"os/signal\"",
	"\t\"syscall\"",
	"\t\"time\"",
	"",
	"\t\"example.com/svc/internal/handlers\"",
	"\t\"example.com/svc/internal/store\"",
	")",
	"",
	"func main() {",
	"\taddr := flag.String(\"addr\", \":8080\", \"listen address\")",
	"\tdbURL := flag.String(\"db\", os.Getenv(\"DB_URL\"), \"postgres URL\")",
	"\tflag.Parse()",
	"",
	"\tif *dbURL == \"\" {",
	"\t\tprintln(\"fatal: --db or DB_URL required\")",
	"\t\tos.Exit(2)",
	"\t}",
	"",
	"\tctx, cancel := context.WithCancel(context.Background())",
	"\tdefer cancel()",
	"",
	"\tdb, err := store.Open(ctx, *dbURL)",
	"\tif err != nil {",
	"\t\tprintln(\"fatal: db open:\", err.Error())",
	"\t\tos.Exit(1)",
	"\t}",
	"\tdefer db.Close()",
	"",
	"\th := handlers.New(db)",
	"\tsrv := &http.Server{Addr: *addr, Handler: h, ReadHeaderTimeout: 5 * time.Second}",
	"",
	"\tprintln(\"listening on\", *addr)",
	"\tgo func() {",
	"\t\tif err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {",
	"\t\t\tlog.Fatal(\"server:\", err)",
	"\t\t}",
	"\t}()",
	"",
	"\tsig := make(chan os.Signal, 1)",
	"\tsignal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)",
	"\t<-sig",
	"\tprintln(\"shutting down …\")",
	"",
	"\tshutdownCtx, shutdownCancel := context.WithTimeout(ctx, 10*time.Second)",
	"\tdefer shutdownCancel()",
	"\tif err := srv.Shutdown(shutdownCtx); err != nil {",
	"\t\tfmt.Fprintln(os.Stderr, \"shutdown:\", err)",
	"\t}",
	"\tprintln(\"done\")",
	"}",
}, "\n")

var multiToolVariant0HandlersGo = strings.Join([]string{
	"package handlers",
	"",
	"import (",
	"\t\"encoding/json\"",
	"\t\"net/http\"",
	"\t\"time\"",
	"",
	"\t\"example.com/svc/internal/store\"",
	")",
	"",
	"// New returns an http.Handler wired to the given store.",
	"func New(db *store.Store) http.Handler {",
	"\tmux := http.NewServeMux()",
	"\tmux.Handle(\"/health\", withLogging(http.HandlerFunc(healthHandler)))",
	"\tmux.Handle(\"/users\", withLogging(&usersHandler{db: db}))",
	"\tmux.Handle(\"/users/\", withLogging(&userByIDHandler{db: db}))",
	"\treturn mux",
	"}",
	"",
	"func withLogging(next http.Handler) http.Handler {",
	"\treturn http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {",
	"\t\tstart := time.Now()",
	"\t\tnext.ServeHTTP(w, r)",
	"\t\tprintln(\"[req]\", r.Method, r.URL.Path, time.Since(start).String())",
	"\t})",
	"}",
	"",
	"func healthHandler(w http.ResponseWriter, r *http.Request) {",
	"\tw.Header().Set(\"Content-Type\", \"application/json\")",
	"\tjson.NewEncoder(w).Encode(map[string]string{\"status\": \"ok\"})",
	"}",
	"",
	"type usersHandler struct{ db *store.Store }",
	"",
	"func (h *usersHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {",
	"\tswitch r.Method {",
	"\tcase http.MethodGet:",
	"\t\tus, err := h.db.ListUsers(r.Context())",
	"\t\tif err != nil {",
	"\t\t\tprintln(\"users list:\", err.Error())",
	"\t\t\thttp.Error(w, \"internal\", http.StatusInternalServerError)",
	"\t\t\treturn",
	"\t\t}",
	"\t\tjson.NewEncoder(w).Encode(us)",
	"\tcase http.MethodPost:",
	"\t\tvar u store.User",
	"\t\tif err := json.NewDecoder(r.Body).Decode(&u); err != nil {",
	"\t\t\thttp.Error(w, \"bad json\", http.StatusBadRequest)",
	"\t\t\treturn",
	"\t\t}",
	"\t\tif err := h.db.InsertUser(r.Context(), u); err != nil {",
	"\t\t\tprintln(\"users insert:\", err.Error())",
	"\t\t\thttp.Error(w, \"internal\", http.StatusInternalServerError)",
	"\t\t\treturn",
	"\t\t}",
	"\t\tw.WriteHeader(http.StatusCreated)",
	"\tdefault:",
	"\t\thttp.Error(w, \"method not allowed\", http.StatusMethodNotAllowed)",
	"\t}",
	"}",
}, "\n")

var multiToolVariant0GrepHits = strings.Join([]string{
	"main.go:26:\tprintln(\"fatal: --db or DB_URL required\")",
	"main.go:34:\tprintln(\"fatal: db open:\", err.Error())",
	"main.go:45:\tprintln(\"listening on\", *addr)",
	"main.go:56:\tprintln(\"shutting down …\")",
	"main.go:66:\tprintln(\"done\")",
	"internal/handlers/handlers.go:25:\t\tprintln(\"[req]\", r.Method, r.URL.Path, time.Since(start).String())",
	"internal/handlers/handlers.go:39:\t\t\tprintln(\"users list:\", err.Error())",
	"internal/handlers/handlers.go:51:\t\t\tprintln(\"users insert:\", err.Error())",
	"internal/store/store.go:18:\tprintln(\"store: opening\", url)",
	"internal/store/store.go:27:\tprintln(\"store: ping failed,\", err.Error())",
	"internal/store/store.go:62:\tprintln(\"store: closing\")",
	"internal/middleware/auth.go:14:\tprintln(\"[auth]\", r.Header.Get(\"Authorization\"))",
	"internal/middleware/auth.go:31:\tprintln(\"[auth] bypass for health check\")",
	"internal/middleware/ratelimit.go:22:\tprintln(\"[rate-limit] exceeded\", r.RemoteAddr)",
}, "\n")

// SSSSSSSSS1: diff payload for variant 0 — swaps every `println(...)`
// in main.go for `log.Println(...)` (and `log.Printf` where args are
// formatted). Scoped to main.go so the proposed edit matches the
// `{"path":"main.go"}` claim in the edit_file tool call.
var multiToolVariant0DiffBefore = multiToolVariant0MainGo

var multiToolVariant0DiffAfter = strings.Join([]string{
	"package main",
	"",
	"import (",
	"\t\"context\"",
	"\t\"errors\"",
	"\t\"flag\"",
	"\t\"fmt\"",
	"\t\"log\"",
	"\t\"net/http\"",
	"\t\"os\"",
	"\t\"os/signal\"",
	"\t\"syscall\"",
	"\t\"time\"",
	"",
	"\t\"example.com/svc/internal/handlers\"",
	"\t\"example.com/svc/internal/store\"",
	")",
	"",
	"func main() {",
	"\taddr := flag.String(\"addr\", \":8080\", \"listen address\")",
	"\tdbURL := flag.String(\"db\", os.Getenv(\"DB_URL\"), \"postgres URL\")",
	"\tflag.Parse()",
	"",
	"\tif *dbURL == \"\" {",
	"\t\tlog.Println(\"fatal: --db or DB_URL required\")",
	"\t\tos.Exit(2)",
	"\t}",
	"",
	"\tctx, cancel := context.WithCancel(context.Background())",
	"\tdefer cancel()",
	"",
	"\tdb, err := store.Open(ctx, *dbURL)",
	"\tif err != nil {",
	"\t\tlog.Printf(\"fatal: db open: %v\", err)",
	"\t\tos.Exit(1)",
	"\t}",
	"\tdefer db.Close()",
	"",
	"\th := handlers.New(db)",
	"\tsrv := &http.Server{Addr: *addr, Handler: h, ReadHeaderTimeout: 5 * time.Second}",
	"",
	"\tlog.Printf(\"listening on %s\", *addr)",
	"\tgo func() {",
	"\t\tif err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {",
	"\t\t\tlog.Fatal(\"server:\", err)",
	"\t\t}",
	"\t}()",
	"",
	"\tsig := make(chan os.Signal, 1)",
	"\tsignal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)",
	"\t<-sig",
	"\tlog.Println(\"shutting down …\")",
	"",
	"\tshutdownCtx, shutdownCancel := context.WithTimeout(ctx, 10*time.Second)",
	"\tdefer shutdownCancel()",
	"\tif err := srv.Shutdown(shutdownCtx); err != nil {",
	"\t\tfmt.Fprintln(os.Stderr, \"shutdown:\", err)",
	"\t}",
	"\tlog.Println(\"done\")",
	"}",
}, "\n")
