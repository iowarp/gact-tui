# Skill: Run a live web session (drive + capture + verify)

Drive a real earthscope run through the web UI against a running clio, manage the
session, auto-approve permissions, and capture the full pipeline. Assumes the stack
is up (see `clio-web-deploy.md`).

## Key facts (endpoints, selectors, workspaces)

REST base `http://127.0.0.1:17801/v1`:
- `GET  /health`
- `GET  /workspaces`
- `POST /sessions` `{title, workspace_id}`
- `POST /sessions/{id}/agent-blueprint` `{blueprint_id:"earthscope-gnss-region"}`
- `POST /sessions/{id}/messages` `{parts:[{type:"text",text:"…"}]}`
- `GET  /sessions/{id}` → `status` (running/idle/finished/error/cancelled), `message_count`
- `GET  /sessions/{id}/messages` → assistant `parts` (each `metadata.agent_id`, `metadata.signature_field_name`, `text`)
- `GET  /sessions/{id}/events` → SSE stream (text/event-stream)
- `POST /sessions/{id}/cancel` → 204, stops a stuck turn
- `GET  /permissions?session_id={id}` → pending list
- `POST /permissions/{id}` `{action:"allow_session"}` → approve

Web DOM (`data-testid`): `sessions-new`, `session-semantics-title`,
`session-semantics-start`, `composer-input`, `transcript`.

**Workspace gotcha (important):** the web "New session" picker creates in the
*currently-selected* workspace. For earthscope demos use **`ws_ndp_demo`** (root
`D:\Libraries\Documents\projects\ndp-demo-workspace`) — it already has the downloaded
data staged (`MTA1.CI.LY_.30.csv` 50MB, `earthscope_stations_clean.csv`, plots). Do
NOT spin up a fresh workspace each run. If you must guarantee the workspace, create
via API (`POST /sessions {workspace_id:"ws_ndp_demo"}`) then open it in the web.

## Drive via the web (Playwright)
```js
// 1. connect
navigate('http://localhost:4173/?backend=http://127.0.0.1:17801')
// 2. new session
click('[data-testid="sessions-new"]')
// set title + start (native setter so Solid sees it)
evaluate(() => { const i=document.querySelector('[data-testid="session-semantics-title"]');
  const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
  s.call(i,'MY-RUN'); i.dispatchEvent(new Event('input',{bubbles:true}));
  document.querySelector('[data-testid="session-semantics-start"]').click(); })
// 3. send prompt
type('[data-testid="composer-input"]', PROMPT); press Enter
```

## The 404 fallback (endpoint down → still reach the tail)
The live EarthScope resource endpoint (`ds2.datacollaboratory.org`) 404s often. Without
a fallback the run loops forever on `ndp_resource_resolver` and NEVER reaches synthesis
(the tail). Append to the prompt:
> "IMPORTANT FALLBACK: if any download/network call fails (e.g. HTTP 404), do NOT stop —
> the data is already downloaded in this workspace root: `earthscope_stations_clean.csv`
> and `MTA1.CI.LY_.30.csv`. Fall back to those local copies and proceed through
> profiling, plotting, and the final synthesis summary."

## Auto-approve permissions + watch to the tail (one background loop)
```sh
SID=<session id>
for i in $(seq 1 200); do
  curl -s "$B/v1/permissions?session_id=$SID" | python -c "…POST /permissions/{id} {action:allow_session} for each pending…"
  # tail = a main/answer part >300 chars
  ... GET /sessions/$SID/messages ; detect agent_id=main & signature_field_name=answer
  status=$(GET /sessions/$SID .status)
  [ idle|finished && MAIN_ANSWER ] && break     # reached synthesis tail
  [ error|cancelled ] && break
  sleep 6
done
```
Only ~1 permission (`shell_bash`) is usually needed. The **synthesis tail** (`main`
`answer`) is where render bugs fire ~90% of the time — always run THROUGH to it, never
cancel mid-pipeline and call it clean.

## Four-quadrant audit capture (when debugging the marker/cut pipeline)
Launch clio with `CLIO_STREAM_AUDIT_LOG` set. Stages (each row has `full_text` once the
enrichment is in — see clio `stream_audit` call sites):
- **① deltas** — `provider.raw_event` / `claude_code_sdk` (raw model output; markers straddle delta boundaries)
- **② full message** — concatenate the ① deltas per `call_index` in `event_index` order
- **④ deltas post-cut** — `bridge.contract_field` (each delta assigned to a `field` = DSPy's cut)
- **full-msg post-cut** — `sse.normalized_emit` (+ persisted parts)
- provider thinking — `bridge.provider_aux`

Leak scan: assemble `bridge.contract_field.full_text` per `(agent_id, field)` and check
for a surviving `[[ ## marker ## ]]`. Reusable driver: `apps/web` scratch
`capture-earthscope.mjs` (opens SSE, posts, auto-approves, dumps `sse-received.jsonl` +
`messages.json`).

## Verify the web representation (read by eye, not just green tests)
```js
evaluate(() => {
  const root=document.querySelector('[data-testid="transcript"]')||document.body;
  const text=root.innerText;
  return { broken: document.querySelectorAll('[class*="broken"]').length,
           markers: (text.match(/\[\[\s*##/g)||[]).length };
})
take_screenshot(fullPage:true)  // save to apps/web/screenshots/
```
`broken===0 && markers===0` on a run that reached the tail is the pass condition.
