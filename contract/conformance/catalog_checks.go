package conformance

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
)

// BBBBB1 — checkMcp validates GET /v1/mcp/servers shape: status 200,
// JSON object with a `servers` array, and each entry has the required
// fields (id, name, transport, status). The TUI's catalog browser +
// `gact mcp list` (JJJJ1) both depend on this shape, so locking it in
// at the conformance layer prevents drift in adapters.
func checkMcp(t Reporter, c *conformClient) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), c.http.Timeout)
	defer cancel()
	resp, body, err := c.get(ctx, "/v1/mcp/servers")
	if err != nil {
		t.Fatalf("GET /v1/mcp/servers: %v", err)
	}
	if resp.StatusCode == http.StatusNotImplemented {
		t.Fatal("/v1/mcp/servers returned 501 — set SkipMcp or fix capabilities.mcp")
	}
	if resp.StatusCode != 200 {
		t.Fatalf("status %d body %s", resp.StatusCode, body)
	}
	var raw struct {
		Servers []map[string]any `json:"servers"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		t.Fatalf("mcp/servers JSON decode: %v (body=%s)", err, body)
	}
	if raw.Servers == nil {
		// Empty list is fine; nil means the response had no `servers`
		// key at all, which violates the spec.
		t.Errorf("response missing `servers` key: %s", body)
		return
	}
	var firstID string
	for i, srv := range raw.Servers {
		for _, key := range []string{"id", "name", "transport", "status"} {
			if _, ok := srv[key]; !ok {
				t.Errorf("server[%d] missing required key %q: %v", i, key, srv)
			}
		}
		// status must be one of the allowed enum values.
		if status, _ := srv["status"].(string); status != "" {
			switch status {
			case "connecting", "ready", "error", "disconnected":
			default:
				t.Errorf("server[%d] unexpected status %q (want connecting|ready|error|disconnected)", i, status)
			}
		}
		if firstID == "" {
			if id, _ := srv["id"].(string); id != "" {
				firstID = id
			}
		}
	}
	if firstID == "" {
		return
	}
	// JJJJJJ1: per-server drill-down. SPEC §6.7 promises GET
	// /v1/mcp/servers/{id} returns a single McpServer and
	// /v1/mcp/servers/{id}/tools returns {tools: Tool[]}. Catches
	// adapters that wired only the list endpoint.
	dctx, dcancel := context.WithTimeout(context.Background(), c.http.Timeout)
	defer dcancel()
	dResp, dBody, err := c.get(dctx, "/v1/mcp/servers/"+firstID)
	if err != nil {
		t.Errorf("GET /v1/mcp/servers/%s: %v", firstID, err)
	} else if dResp.StatusCode == http.StatusNotImplemented {
		t.Errorf("/v1/mcp/servers/{id} returned 501 — per-id drill-down required by SPEC §6.7")
	} else if dResp.StatusCode != 200 {
		t.Errorf("/v1/mcp/servers/%s status %d body %s", firstID, dResp.StatusCode, dBody)
	} else {
		var detail struct {
			ID string `json:"id"`
		}
		if err := json.Unmarshal(dBody, &detail); err != nil {
			t.Errorf("mcp/server/%s JSON decode: %v (body=%s)", firstID, err, dBody)
		} else if detail.ID != firstID {
			t.Errorf("/v1/mcp/servers/%s returned id=%q (want %q)", firstID, detail.ID, firstID)
		}
	}
	// /v1/mcp/servers/{id}/tools — same pattern.
	tctx, tcancel := context.WithTimeout(context.Background(), c.http.Timeout)
	defer tcancel()
	tResp, tBody, err := c.get(tctx, "/v1/mcp/servers/"+firstID+"/tools")
	if err != nil {
		t.Errorf("GET /v1/mcp/servers/%s/tools: %v", firstID, err)
		return
	}
	if tResp.StatusCode == http.StatusNotImplemented {
		t.Errorf("/v1/mcp/servers/{id}/tools returned 501 — required by SPEC §6.7")
		return
	}
	if tResp.StatusCode != 200 {
		t.Errorf("/v1/mcp/servers/%s/tools status %d body %s", firstID, tResp.StatusCode, tBody)
		return
	}
	var traw struct {
		Tools []map[string]any `json:"tools"`
	}
	if err := json.Unmarshal(tBody, &traw); err != nil {
		t.Errorf("mcp/server/%s/tools JSON decode: %v (body=%s)", firstID, err, tBody)
		return
	}
	if traw.Tools == nil {
		t.Errorf("/v1/mcp/servers/%s/tools missing `tools` key: %s", firstID, tBody)
	}
	for i, tl := range traw.Tools {
		if id, _ := tl["id"].(string); id == "" {
			t.Errorf("mcp tool[%d] missing id: %v", i, tl)
		}
	}
	// LLLLLL1: per-server resources + prompts. SPEC §6.7 lines
	// 436-441. Adapter authors that wired only servers + tools
	// missed both. Read-only.
	rctx, rcancel := context.WithTimeout(context.Background(), c.http.Timeout)
	defer rcancel()
	rResp, rBody, rerr := c.get(rctx, "/v1/mcp/servers/"+firstID+"/resources")
	if rerr != nil {
		t.Errorf("GET /v1/mcp/servers/%s/resources: %v", firstID, rerr)
	} else if rResp.StatusCode == http.StatusNotImplemented {
		t.Errorf("/v1/mcp/servers/{id}/resources returned 501 — required by SPEC §6.7")
	} else if rResp.StatusCode != 200 {
		t.Errorf("/v1/mcp/servers/%s/resources status %d body %s", firstID, rResp.StatusCode, rBody)
	} else {
		var rraw struct {
			Resources []map[string]any `json:"resources"`
		}
		if err := json.Unmarshal(rBody, &rraw); err != nil {
			t.Errorf("mcp/server/%s/resources JSON decode: %v (body=%s)", firstID, err, rBody)
		} else if rraw.Resources == nil {
			t.Errorf("/v1/mcp/servers/%s/resources missing `resources` key: %s", firstID, rBody)
		} else {
			for i, res := range rraw.Resources {
				if uri, _ := res["uri"].(string); uri == "" {
					t.Errorf("mcp resource[%d] missing uri: %v", i, res)
				}
			}
		}
	}
	pctx, pcancel := context.WithTimeout(context.Background(), c.http.Timeout)
	defer pcancel()
	pResp, pBody, perr := c.get(pctx, "/v1/mcp/servers/"+firstID+"/prompts")
	if perr != nil {
		t.Errorf("GET /v1/mcp/servers/%s/prompts: %v", firstID, perr)
	} else if pResp.StatusCode == http.StatusNotImplemented {
		t.Errorf("/v1/mcp/servers/{id}/prompts returned 501 — required by SPEC §6.7")
	} else if pResp.StatusCode != 200 {
		t.Errorf("/v1/mcp/servers/%s/prompts status %d body %s", firstID, pResp.StatusCode, pBody)
	} else {
		var praw struct {
			Prompts []map[string]any `json:"prompts"`
		}
		if err := json.Unmarshal(pBody, &praw); err != nil {
			t.Errorf("mcp/server/%s/prompts JSON decode: %v (body=%s)", firstID, err, pBody)
		} else if praw.Prompts == nil {
			t.Errorf("/v1/mcp/servers/%s/prompts missing `prompts` key: %s", firstID, pBody)
		} else {
			for i, pr := range praw.Prompts {
				if name, _ := pr["name"].(string); name == "" {
					t.Errorf("mcp prompt[%d] missing name: %v", i, pr)
				}
			}
		}
	}
}

// TTTTT1 — checkProviders validates GET /v1/providers + per-provider
// GET /v1/providers/{id}/models. Status 200 + a non-nil `providers`
// key on the list endpoint; for each provider, status 200 + a non-nil
// `models` key on the nested endpoint and each model entry has the
// required {id, name} fields. Locks the wire shape that powers the
// Settings → Model tab and `gact models list` (CLI). Adapters that
// don't proxy /v1/providers can SkipProviders explicitly.
func checkProviders(t Reporter, c *conformClient) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), c.http.Timeout)
	defer cancel()
	resp, body, err := c.get(ctx, "/v1/providers")
	if err != nil {
		t.Fatalf("GET /v1/providers: %v", err)
	}
	if resp.StatusCode == http.StatusNotImplemented {
		t.Fatal("/v1/providers returned 501 — set SkipProviders or fix capabilities.providers")
	}
	if resp.StatusCode != 200 {
		t.Fatalf("status %d body %s", resp.StatusCode, body)
	}
	var raw struct {
		Providers []map[string]any `json:"providers"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		t.Fatalf("providers JSON decode: %v (body=%s)", err, body)
	}
	if raw.Providers == nil {
		t.Errorf("response missing `providers` key: %s", body)
		return
	}
	for i, p := range raw.Providers {
		for _, key := range []string{"id", "name"} {
			if _, ok := p[key]; !ok {
				t.Errorf("provider[%d] missing required key %q: %v", i, key, p)
			}
		}
		pid, _ := p["id"].(string)
		if pid == "" {
			continue
		}
		// KKKKKK1: Per-provider detail endpoint. SPEC §6.12 promises
		// GET /v1/providers/{id} returns a single Provider. Adapter
		// authors that wired only the list got a silent gap before.
		// Per-id response must echo the same id back and have a
		// non-empty name (Provider schema).
		dresp, dbody, derr := c.get(ctx, "/v1/providers/"+pid)
		if derr != nil {
			t.Errorf("GET /v1/providers/%s: %v", pid, derr)
		} else if dresp.StatusCode == http.StatusNotImplemented {
			t.Errorf("/v1/providers/%s returned 501 — per-id drill-down required by SPEC §6.12", pid)
		} else if dresp.StatusCode != 200 {
			t.Errorf("/v1/providers/%s status %d body %s", pid, dresp.StatusCode, dbody)
		} else {
			var pdetail struct {
				ID   string `json:"id"`
				Name string `json:"name"`
			}
			if err := json.Unmarshal(dbody, &pdetail); err != nil {
				t.Errorf("provider/%s JSON decode: %v (body=%s)", pid, err, dbody)
			} else {
				if pdetail.ID != pid {
					t.Errorf("/v1/providers/%s returned id=%q (want %q)", pid, pdetail.ID, pid)
				}
				if pdetail.Name == "" {
					t.Errorf("/v1/providers/%s missing name: %s", pid, dbody)
				}
			}
		}
		// Per-provider models endpoint.
		mresp, mbody, err := c.get(ctx, "/v1/providers/"+pid+"/models")
		if err != nil {
			t.Errorf("GET /v1/providers/%s/models: %v", pid, err)
			continue
		}
		if mresp.StatusCode != 200 {
			t.Errorf("provider[%s] models status %d body %s", pid, mresp.StatusCode, mbody)
			continue
		}
		var mraw struct {
			Models []map[string]any `json:"models"`
		}
		if err := json.Unmarshal(mbody, &mraw); err != nil {
			t.Errorf("provider[%s] models decode: %v (body=%s)", pid, err, mbody)
			continue
		}
		if mraw.Models == nil {
			t.Errorf("provider[%s] response missing `models` key: %s", pid, mbody)
			continue
		}
		for j, m := range mraw.Models {
			for _, key := range []string{"id", "name"} {
				if _, ok := m[key]; !ok {
					t.Errorf("provider[%s] model[%d] missing required key %q: %v", pid, j, key, m)
				}
			}
		}
	}
}

// UUUUU1 — checkFiles validates GET /v1/workspaces/{id}/files. Asserts
// 200, top-level `entries` array, and each entry carries the required
// {path, type} with type in the file|dir enum. Locks the wire shape
// that powers the @-file picker (M6), `gact files list`, and
// `gact repo-map`'s tree view. Read-only; doesn't fetch file bodies
// to avoid coupling to fixture content.
func checkFiles(t Reporter, c *conformClient, wsID string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), c.http.Timeout)
	defer cancel()
	resp, body, err := c.get(ctx, "/v1/workspaces/"+wsID+"/files")
	if err != nil {
		t.Fatalf("GET /v1/workspaces/%s/files: %v", wsID, err)
	}
	if resp.StatusCode == http.StatusNotImplemented {
		t.Fatal("/v1/workspaces/{id}/files returned 501 — set SkipFiles or fix capabilities.files")
	}
	if resp.StatusCode != 200 {
		t.Fatalf("status %d body %s", resp.StatusCode, body)
	}
	var raw struct {
		Entries []map[string]any `json:"entries"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		t.Fatalf("files JSON decode: %v (body=%s)", err, body)
	}
	if raw.Entries == nil {
		t.Errorf("response missing `entries` key: %s", body)
		return
	}
	var firstFile string
	for i, e := range raw.Entries {
		for _, key := range []string{"path", "type"} {
			if _, ok := e[key]; !ok {
				t.Errorf("entry[%d] missing required key %q: %v", i, key, e)
			}
		}
		typ, _ := e["type"].(string)
		if typ != "" {
			switch typ {
			case "file", "dir":
			default:
				t.Errorf("entry[%d] unexpected type %q (want file|dir)", i, typ)
			}
		}
		if firstFile == "" && typ == "file" {
			if path, _ := e["path"].(string); path != "" {
				firstFile = path
			}
		}
	}
	if firstFile == "" {
		return
	}
	// VVVVVV1: per-file body endpoint. SPEC §6.9 promises GET
	// /v1/workspaces/{id}/files/read?path=<p> returns the file's
	// content as application/octet-stream. Adapter authors that
	// wired the tree but forgot the body endpoint break the
	// @-file picker preview + `gact files read` at runtime.
	dctx, dcancel := context.WithTimeout(context.Background(), c.http.Timeout)
	defer dcancel()
	dResp, dBody, derr := c.get(dctx, "/v1/workspaces/"+wsID+"/files/read?path="+firstFile)
	if derr != nil {
		t.Errorf("GET /v1/workspaces/%s/files/read?path=%s: %v", wsID, firstFile, derr)
		return
	}
	if dResp.StatusCode == http.StatusNotImplemented {
		t.Errorf("/v1/workspaces/{id}/files/read returned 501 — required by SPEC §6.9 when capabilities.files=true")
		return
	}
	if dResp.StatusCode != 200 {
		t.Errorf("/v1/workspaces/%s/files/read?path=%s status %d body %s", wsID, firstFile, dResp.StatusCode, dBody)
		return
	}
	if len(dBody) == 0 {
		t.Errorf("/v1/workspaces/%s/files/read?path=%s returned empty body", wsID, firstFile)
	}
}

// BBBBBB1 — checkDiffs validates GET /v1/sessions/{id}/diffs. Asserts
// 200, top-level `diffs` array (non-nil — empty list is fine, missing
// key is not), and each entry carries the file_diff shape from SPEC
// §5.4: required {path, applied}; optional {before, after, language}
// (we only assert types when present so adapters that emit nulls
// still pass). Locks the wire shape that powers `gact diff` and the
// conversation pane's a/r apply/reject keys. Read-only — never POSTs
// to /diffs/apply or /diffs/reject so it stays idempotent against
// the live session.
func checkDiffs(t Reporter, c *conformClient, sid string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), c.http.Timeout)
	defer cancel()
	resp, body, err := c.get(ctx, "/v1/sessions/"+sid+"/diffs")
	if err != nil {
		t.Fatalf("GET /v1/sessions/%s/diffs: %v", sid, err)
	}
	if resp.StatusCode == http.StatusNotImplemented {
		t.Fatal("/v1/sessions/{id}/diffs returned 501 — set SkipDiffs or fix capabilities.diffs")
	}
	if resp.StatusCode != 200 {
		t.Fatalf("status %d body %s", resp.StatusCode, body)
	}
	var raw struct {
		Diffs []map[string]any `json:"diffs"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		t.Fatalf("diffs JSON decode: %v (body=%s)", err, body)
	}
	if raw.Diffs == nil {
		t.Errorf("response missing `diffs` key: %s", body)
		return
	}
	for i, d := range raw.Diffs {
		for _, key := range []string{"path", "applied"} {
			if _, ok := d[key]; !ok {
				t.Errorf("diff[%d] missing required key %q: %v", i, key, d)
			}
		}
		if path, ok := d["path"].(string); ok && path == "" {
			t.Errorf("diff[%d] has empty path: %v", i, d)
		}
		if _, isBool := d["applied"].(bool); !isBool {
			if _, present := d["applied"]; present {
				t.Errorf("diff[%d] applied is not bool: %v", i, d["applied"])
			}
		}
		if lang, present := d["language"]; present {
			if _, ok := lang.(string); !ok && lang != nil {
				t.Errorf("diff[%d] language must be string|null: %v", i, lang)
			}
		}
	}
}

// DDDDDD1 — checkAgents validates GET /v1/agents (SPEC §6.5).
// Asserts 200 + non-nil top-level `agents` array (empty list is
// fine; missing key violates spec) + per-entry required {id,
// source, title} with `source` in the documented enum
// (builtin|user|recipe|skill). Locks the wire shape that powers
// the Settings → Agent picker (ListAgents → settingsLoadedMsg)
// and `gact agents list` (CLI). Read-only — never POSTs to create
// an agent so it stays idempotent against the live backend.
//
// FFFFFF1: also drills into GET /v1/agents/{id} for the first
// agent in the list (when present). Per-id response must echo the
// same id back and have non-empty source/title — same shape as a
// list entry, per SPEC §6.5.
func checkAgents(t Reporter, c *conformClient) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), c.http.Timeout)
	defer cancel()
	resp, body, err := c.get(ctx, "/v1/agents")
	if err != nil {
		t.Fatalf("GET /v1/agents: %v", err)
	}
	if resp.StatusCode == http.StatusNotImplemented {
		t.Fatal("/v1/agents returned 501 — set SkipAgents")
	}
	if resp.StatusCode != 200 {
		t.Fatalf("status %d body %s", resp.StatusCode, body)
	}
	var raw struct {
		Agents []map[string]any `json:"agents"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		t.Fatalf("agents JSON decode: %v (body=%s)", err, body)
	}
	if raw.Agents == nil {
		t.Errorf("response missing `agents` key: %s", body)
		return
	}
	var firstID string
	for i, a := range raw.Agents {
		for _, key := range []string{"id", "source", "title"} {
			if _, ok := a[key]; !ok {
				t.Errorf("agent[%d] missing required key %q: %v", i, key, a)
			}
		}
		if id, _ := a["id"].(string); id == "" {
			t.Errorf("agent[%d] has empty id: %v", i, a)
		} else if firstID == "" {
			firstID = id
		}
		if src, _ := a["source"].(string); src != "" {
			switch src {
			case "builtin", "user", "recipe", "skill":
			default:
				t.Errorf("agent[%d] unexpected source %q (want builtin|user|recipe|skill)", i, src)
			}
		}
	}
	if firstID == "" {
		return
	}
	dctx, dcancel := context.WithTimeout(context.Background(), c.http.Timeout)
	defer dcancel()
	dResp, dBody, err := c.get(dctx, "/v1/agents/"+firstID)
	if err != nil {
		t.Errorf("GET /v1/agents/%s: %v", firstID, err)
		return
	}
	if dResp.StatusCode == http.StatusNotImplemented {
		t.Errorf("/v1/agents/{id} returned 501 — per-id drill-down required by SPEC §6.5")
		return
	}
	if dResp.StatusCode != 200 {
		t.Errorf("/v1/agents/%s status %d body %s", firstID, dResp.StatusCode, dBody)
		return
	}
	var detail struct {
		ID     string `json:"id"`
		Source string `json:"source"`
		Title  string `json:"title"`
	}
	if err := json.Unmarshal(dBody, &detail); err != nil {
		t.Errorf("agent/%s JSON decode: %v (body=%s)", firstID, err, dBody)
		return
	}
	if detail.ID != firstID {
		t.Errorf("/v1/agents/%s returned id=%q (want %q)", firstID, detail.ID, firstID)
	}
	if detail.Source == "" {
		t.Errorf("/v1/agents/%s missing source: %s", firstID, dBody)
	}
	if detail.Title == "" {
		t.Errorf("/v1/agents/%s missing title: %s", firstID, dBody)
	}
}

// CCCCCC1 — checkMessageDiffs validates the per-message variant
// `GET /v1/sessions/{id}/messages/{msg_id}/diffs`. Picks the first
// message id from `GET /v1/sessions/{id}/messages` so the suite
// stays portable (no fixture coupling). Asserts 200, top-level
// `diffs` array (non-nil), and the same file_diff entry shape as
// checkDiffs (path required + non-empty, applied bool, language
// string|null when present). Skips quietly when the session has no
// messages yet — listing returns empty so there's nothing to walk.
// Read-only.
func checkMessageDiffs(t Reporter, c *conformClient, sid string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), c.http.Timeout)
	defer cancel()
	listResp, listBody, err := c.get(ctx, "/v1/sessions/"+sid+"/messages")
	if err != nil {
		t.Fatalf("GET /v1/sessions/%s/messages: %v", sid, err)
	}
	if listResp.StatusCode == http.StatusNotImplemented {
		t.Fatal("messages list returned 501 — set SkipMessageDiffs")
	}
	if listResp.StatusCode != 200 {
		t.Fatalf("list messages status %d body %s", listResp.StatusCode, listBody)
	}
	var listRaw struct {
		Messages []struct {
			ID string `json:"id"`
		} `json:"messages"`
	}
	if err := json.Unmarshal(listBody, &listRaw); err != nil {
		t.Fatalf("messages JSON decode: %v (body=%s)", err, listBody)
	}
	if len(listRaw.Messages) == 0 {
		// Empty session — nothing to drill into. Don't fail; the
		// per-message endpoint shape is exercised only when there's
		// at least one message to point at.
		return
	}
	mid := listRaw.Messages[0].ID
	if mid == "" {
		t.Fatalf("first message id empty in list: %s", listBody)
	}
	resp, body, err := c.get(ctx, "/v1/sessions/"+sid+"/messages/"+mid+"/diffs")
	if err != nil {
		t.Fatalf("GET /v1/sessions/%s/messages/%s/diffs: %v", sid, mid, err)
	}
	if resp.StatusCode == http.StatusNotImplemented {
		t.Fatal("/v1/sessions/{id}/messages/{msg_id}/diffs returned 501 — set SkipMessageDiffs or fix capabilities.diffs")
	}
	if resp.StatusCode != 200 {
		t.Fatalf("status %d body %s", resp.StatusCode, body)
	}
	var raw struct {
		Diffs []map[string]any `json:"diffs"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		t.Fatalf("message diffs JSON decode: %v (body=%s)", err, body)
	}
	if raw.Diffs == nil {
		t.Errorf("response missing `diffs` key: %s", body)
		return
	}
	for i, d := range raw.Diffs {
		for _, key := range []string{"path", "applied"} {
			if _, ok := d[key]; !ok {
				t.Errorf("diff[%d] missing required key %q: %v", i, key, d)
			}
		}
		if path, ok := d["path"].(string); ok && path == "" {
			t.Errorf("diff[%d] has empty path: %v", i, d)
		}
		if _, isBool := d["applied"].(bool); !isBool {
			if _, present := d["applied"]; present {
				t.Errorf("diff[%d] applied is not bool: %v", i, d["applied"])
			}
		}
		if lang, present := d["language"]; present {
			if _, ok := lang.(string); !ok && lang != nil {
				t.Errorf("diff[%d] language must be string|null: %v", i, lang)
			}
		}
	}
}

// QQQQQQ1 — checkMessagesSearch validates GET /v1/sessions/{id}/
// messages/search?q=hello (SPEC §6.3, gated by capabilities
// .search_messages). Asserts 200 + non-nil top-level `matches`
// array (empty list is fine — the seed message may not match the
// query; missing key violates spec). When matches are present,
// each must carry the documented {message_id, snippet} pair.
// Locks the wire shape that powers the @-search palette and
// `gact search`. Read-only.
func checkMessagesSearch(t Reporter, c *conformClient, sid string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), c.http.Timeout)
	defer cancel()
	resp, body, err := c.get(ctx, "/v1/sessions/"+sid+"/messages/search?q=hello&limit=5")
	if err != nil {
		t.Fatalf("GET /v1/sessions/%s/messages/search: %v", sid, err)
	}
	if resp.StatusCode == http.StatusNotImplemented {
		t.Fatal("/v1/sessions/{id}/messages/search returned 501 — set SkipMessageSearch or fix capabilities.search_messages")
	}
	if resp.StatusCode != 200 {
		t.Fatalf("status %d body %s", resp.StatusCode, body)
	}
	var raw struct {
		Matches []map[string]any `json:"matches"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		t.Fatalf("messages search JSON decode: %v (body=%s)", err, body)
	}
	if raw.Matches == nil {
		t.Errorf("response missing `matches` key: %s", body)
		return
	}
	for i, m := range raw.Matches {
		for _, key := range []string{"message_id", "snippet"} {
			if _, ok := m[key]; !ok {
				t.Errorf("match[%d] missing required key %q: %v", i, key, m)
			}
		}
		if mid, _ := m["message_id"].(string); mid == "" {
			t.Errorf("match[%d] empty message_id: %v", i, m)
		}
	}
}

// RRRRRR1 — checkSessionExport validates GET /v1/sessions/{id}/export
// (SPEC §6.2). Asserts 200 + Content-Type starts with application/json
// + body parses as JSON. Specific exported shape is per-backend; the
// SPEC says "session blob" without locking the field set, so we only
// assert that the response is valid JSON. Locks just enough that
// `gact export` and `gact import` can round-trip without a 501 hiding
// in the middle. Read-only.
func checkSessionExport(t Reporter, c *conformClient, sid string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), c.http.Timeout)
	defer cancel()
	resp, body, err := c.get(ctx, "/v1/sessions/"+sid+"/export")
	if err != nil {
		t.Fatalf("GET /v1/sessions/%s/export: %v", sid, err)
	}
	if resp.StatusCode == http.StatusNotImplemented {
		t.Fatal("/v1/sessions/{id}/export returned 501 — set SkipSessionExport")
	}
	if resp.StatusCode != 200 {
		t.Fatalf("status %d body %s", resp.StatusCode, body)
	}
	ct := resp.Header.Get("Content-Type")
	if !strings.Contains(ct, "application/json") {
		t.Errorf("Content-Type = %q, want application/json", ct)
	}
	var blob any
	if err := json.Unmarshal(body, &blob); err != nil {
		t.Errorf("export body not valid JSON: %v (body=%s)", err, body)
	}
}

// UUUUUU1 — checkContextFiles validates GET /v1/sessions/{id}/
// context/files (SPEC §6.9). Asserts 200 + non-nil top-level
// `files` array (empty list is fine; missing key violates spec).
// Per-entry shape: {path, mode} required, with mode in
// {edit|read|pin}. Read-only — never POSTs to add a context
// pin so it stays idempotent.
func checkContextFiles(t Reporter, c *conformClient, sid string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), c.http.Timeout)
	defer cancel()
	resp, body, err := c.get(ctx, "/v1/sessions/"+sid+"/context/files")
	if err != nil {
		t.Fatalf("GET /v1/sessions/%s/context/files: %v", sid, err)
	}
	if resp.StatusCode == http.StatusNotImplemented {
		t.Fatal("/v1/sessions/{id}/context/files returned 501 — required by SPEC §6.9 when capabilities.files=true")
	}
	if resp.StatusCode != 200 {
		t.Fatalf("status %d body %s", resp.StatusCode, body)
	}
	var raw struct {
		Files []map[string]any `json:"files"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		t.Fatalf("context/files JSON decode: %v (body=%s)", err, body)
	}
	if raw.Files == nil {
		t.Errorf("response missing `files` key: %s", body)
		return
	}
	for i, f := range raw.Files {
		for _, key := range []string{"path", "mode"} {
			if _, ok := f[key]; !ok {
				t.Errorf("context_file[%d] missing required key %q: %v", i, key, f)
			}
		}
		if mode, _ := f["mode"].(string); mode != "" {
			switch mode {
			case "edit", "read", "pin":
			default:
				t.Errorf("context_file[%d] unexpected mode %q (want edit|read|pin)", i, mode)
			}
		}
	}
}

// UUUUUU1 — checkRepoMap validates GET /v1/workspaces/{id}/repo_map
// (SPEC §6.9). Asserts 200 + non-nil `tree` object + `tokens` field.
// Specific tree shape stays per-backend (recursive structure with
// optional code outline); we only enforce the envelope. Read-only.
func checkRepoMap(t Reporter, c *conformClient, wsID string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), c.http.Timeout)
	defer cancel()
	resp, body, err := c.get(ctx, "/v1/workspaces/"+wsID+"/repo_map")
	if err != nil {
		t.Fatalf("GET /v1/workspaces/%s/repo_map: %v", wsID, err)
	}
	if resp.StatusCode == http.StatusNotImplemented {
		t.Fatal("/v1/workspaces/{id}/repo_map returned 501 — required by SPEC §6.9 when capabilities.files=true")
	}
	if resp.StatusCode != 200 {
		t.Fatalf("status %d body %s", resp.StatusCode, body)
	}
	var raw map[string]any
	if err := json.Unmarshal(body, &raw); err != nil {
		t.Fatalf("repo_map JSON decode: %v (body=%s)", err, body)
	}
	if _, ok := raw["tree"]; !ok {
		t.Errorf("response missing `tree` key: %s", body)
	}
	if _, ok := raw["tokens"]; !ok {
		t.Errorf("response missing `tokens` key: %s", body)
	}
}
