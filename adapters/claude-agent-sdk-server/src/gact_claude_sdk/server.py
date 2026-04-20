"""FastAPI HTTP server exposing GACT v0.1 endpoints over the
claude-agent-sdk.

Endpoints (SPEC §6):
- §3   GET /v1/health
- §3   GET /v1/capabilities
- §6.1 GET /v1/workspaces, GET /v1/workspaces/{id}
- §6.2 POST /v1/sessions, GET /v1/sessions, GET /v1/sessions/{id}
- §6.3 POST /v1/sessions/{id}/messages,
       GET  /v1/sessions/{id}/messages,
       GET  /v1/sessions/{id}/messages/{mid}
- §7   GET /v1/sessions/{id}/events  (SSE)
"""

from __future__ import annotations

import asyncio
import os
import time
import uuid
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from claude_agent_sdk import (
    ClaudeAgentOptions,
    ClaudeSDKClient,
    PermissionResultAllow,
    PermissionResultDeny,
    StreamEvent,
    ToolPermissionContext,
)
from fastapi import FastAPI, HTTPException, Request
from sse_starlette.sse import EventSourceResponse

from .bridge import envelope, now_iso, sdk_message_to_events, stream_event_to_events

# Adapter contract version + backend identity advertised to the TUI.
CONTRACT_VERSION = "0.1"
BACKEND_NAME = "claude-agent-sdk-server"
BACKEND_VERSION = "0.1.0"


@dataclass
class Session:
    """Per-session adapter state.

    Holds the long-lived ClaudeSDKClient (one async context manager
    per session, so SDK conversation state survives across HTTP
    requests), plus a queue of GACT events pending SSE delivery and
    the cached messages list for GET /messages.
    """

    id: str
    workspace_id: str
    title: str
    created_at: str
    status: str = "idle"  # idle|running|waiting_permission|error
    client: ClaudeSDKClient | None = None
    cached_messages: list[dict[str, Any]] = field(default_factory=list)
    # Each subscriber gets its own queue (multiple SSE clients can
    # tail the same session). Producer fan-outs to every queue.
    subscribers: list[asyncio.Queue[dict[str, Any]]] = field(default_factory=list)
    # Lock around client.query() so two POST /messages calls don't
    # race and interleave on the SDK's single-conversation contract.
    turn_lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    # GGGGGGG4: in-flight streaming message id (set on Anthropic
    # message_start, cleared on message_stop). Bridge.stream_event_to_events
    # threads this so deltas/completes can target the right part.
    active_stream_msg_id: str | None = None


@dataclass
class State:
    """Process-wide adapter state."""

    cwd: str
    cli_path: str | None
    start_time: float = field(default_factory=time.time)
    sessions: dict[str, Session] = field(default_factory=dict)
    # Lock around the sessions dict for concurrent create/delete.
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    # Tool catalog discovered from the SDK's first SystemMessage(init).
    # Stays empty until the first session runs a turn — that's the only
    # time the SDK reveals the resolved tool list (which depends on
    # the working directory's CLAUDE.md, MCP config, agent settings).
    tool_names: list[str] = field(default_factory=list)
    # IIIIIII2: MCP server catalog — same lazy-discovery story as
    # tool_names. SystemMessage(init).data.mcp_servers gives a list
    # of {name, status}; we slot in synthetic ids derived from name
    # so the SPEC §6.7 per-id endpoints can address each server.
    mcp_servers: list[dict[str, Any]] = field(default_factory=list)
    # Strong refs to in-flight background turns so the GC doesn't
    # cancel them mid-stream (RUF006). Removed on completion.
    background_tasks: set[asyncio.Task[None]] = field(default_factory=set)
    # HHHHHHH1: pending permission requests. Each maps perm_id to the
    # full PermissionRequest dict (for GET /v1/permissions reads) +
    # the future the SDK's can_use_tool callback is awaiting on.
    permissions: dict[str, dict[str, Any]] = field(default_factory=dict)
    permission_futures: dict[str, asyncio.Future[bool]] = field(default_factory=dict)


def workspace_record(state: State) -> dict[str, Any]:
    """The single synthetic workspace this adapter exposes (Claude
    Code is cwd-scoped — one adapter == one workspace)."""
    return {
        "id": "ws_default",
        "name": Path(state.cwd).name or "default",
        "root_path": state.cwd,
        "created_at": now_iso(),
        "metadata": {"x_claudecode_cwd": state.cwd},
    }


def make_app(cwd: str, cli_path: str | None = None) -> FastAPI:
    """Build the FastAPI app bound to the given workspace cwd."""
    state = State(cwd=str(Path(cwd).resolve()), cli_path=cli_path)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        try:
            yield
        finally:
            # Clean shutdown — disconnect every active SDK client.
            for sess in list(state.sessions.values()):
                if sess.client is not None:
                    try:
                        await sess.client.disconnect()
                    except Exception:
                        pass

    app = FastAPI(
        title="gact-claude-agent-sdk-server",
        version=BACKEND_VERSION,
        lifespan=lifespan,
    )

    # --- §3 health + capabilities -----------------------------------

    @app.get("/v1/health")
    async def health() -> dict[str, Any]:
        return {
            "healthy": True,
            "uptime_s": int(time.time() - state.start_time),
        }

    @app.get("/v1/capabilities")
    async def capabilities() -> dict[str, Any]:
        return {
            "contract_version": CONTRACT_VERSION,
            "backend": {"name": BACKEND_NAME, "version": BACKEND_VERSION},
            "capabilities": {
                "workspaces": True,
                "sessions": True,
                "messages": True,
                "sse": True,
                "tools": True,
                "files": False,
                "diffs": False,
                "providers": False,
                "agents": False,
                "commands": False,
                "metrics": False,
                "mcp": True,
                "voice": False,
                "lsp": False,
                "hooks": False,
                "permissions": True,
                "session_tasks": False,
                "search_messages": False,
                "scheduled_sessions": False,
            },
        }

    # --- §6.1 workspaces --------------------------------------------

    @app.get("/v1/workspaces")
    async def list_workspaces() -> dict[str, Any]:
        return {"workspaces": [workspace_record(state)]}

    @app.get("/v1/workspaces/{ws_id}")
    async def get_workspace(ws_id: str) -> dict[str, Any]:
        ws = workspace_record(state)
        if ws["id"] != ws_id:
            raise HTTPException(
                status_code=404,
                detail={
                    "error": {
                        "code": "workspace_not_found",
                        "message": f"no workspace with id {ws_id}",
                    }
                },
            )
        return ws

    # --- §6.2 sessions ----------------------------------------------

    @app.get("/v1/sessions")
    async def list_sessions(workspace_id: str | None = None) -> dict[str, Any]:
        out: list[dict[str, Any]] = []
        async with state.lock:
            for s in state.sessions.values():
                if workspace_id and s.workspace_id != workspace_id:
                    continue
                out.append(_session_record(s))
        return {"sessions": out}

    @app.post("/v1/sessions")
    async def create_session(body: dict[str, Any]) -> dict[str, Any]:
        ws_id = body.get("workspace_id") or "ws_default"
        title = body.get("title") or "claude-session"
        sid = "sess_" + uuid.uuid4().hex[:12]
        sess = Session(
            id=sid,
            workspace_id=ws_id,
            title=title,
            created_at=now_iso(),
        )
        async with state.lock:
            state.sessions[sid] = sess
        return _session_record(sess)

    @app.get("/v1/sessions/{sid}")
    async def get_session(sid: str) -> dict[str, Any]:
        sess = state.sessions.get(sid)
        if sess is None:
            raise HTTPException(
                status_code=404,
                detail={
                    "error": {
                        "code": "session_not_found",
                        "message": f"no session with id {sid}",
                    }
                },
            )
        return _session_record(sess)

    @app.delete("/v1/sessions/{sid}", status_code=204)
    async def delete_session(sid: str) -> None:
        async with state.lock:
            sess = state.sessions.pop(sid, None)
        if sess is None:
            raise HTTPException(status_code=404, detail="session_not_found")
        # Best-effort SDK cleanup; ignore errors so DELETE is idempotent.
        if sess.client is not None:
            try:
                await sess.client.disconnect()
            except Exception:
                pass

    @app.post("/v1/sessions/{sid}/cancel", status_code=204)
    async def cancel_session(sid: str) -> None:
        """IIIIIII1: stop an in-flight SDK turn. Routes to
        ClaudeSDKClient.interrupt() (which signals the underlying
        claude CLI to abort the current generation). The bridge
        then receives a ResultMessage with is_error=true on the
        next iteration of receive_response, which fires
        session.status_changed:error normally — we don't synthesize
        an extra event here.
        """
        sess = state.sessions.get(sid)
        if sess is None:
            raise HTTPException(status_code=404, detail="session_not_found")
        if sess.client is None:
            # Nothing in flight to cancel — idempotent no-op.
            return
        # interrupt() is async on the SDK client. Failures during the
        # signal (e.g. CLI already exited) are not actionable from the
        # TUI side, so swallow them.
        try:
            await sess.client.interrupt()
        except Exception:
            pass
        # Resolve any pending permission futures with deny so the
        # SDK turn doesn't hang on a permission prompt.
        for pid, fut in list(state.permission_futures.items()):
            if fut.done():
                continue
            perm = state.permissions.get(pid)
            if perm is None or perm.get("session_id") != sid:
                continue
            fut.set_result(False)
            perm["resolved"] = True
            perm["action"] = "deny"

    # --- §6.3 messages ----------------------------------------------

    @app.get("/v1/sessions/{sid}/messages")
    async def list_messages(sid: str) -> dict[str, Any]:
        sess = state.sessions.get(sid)
        if sess is None:
            raise HTTPException(status_code=404, detail="session_not_found")
        return {"messages": list(sess.cached_messages)}

    @app.get("/v1/sessions/{sid}/messages/{mid}")
    async def get_message(sid: str, mid: str) -> dict[str, Any]:
        sess = state.sessions.get(sid)
        if sess is None:
            raise HTTPException(status_code=404, detail="session_not_found")
        for m in sess.cached_messages:
            if m["id"] == mid:
                return m
        raise HTTPException(status_code=404, detail="message_not_found")

    @app.post("/v1/sessions/{sid}/messages", status_code=202)
    async def post_message(sid: str, body: dict[str, Any]) -> dict[str, Any]:
        sess = state.sessions.get(sid)
        if sess is None:
            raise HTTPException(status_code=404, detail="session_not_found")
        # Extract the user text from the GACT Part[] body. The TUI
        # sends `parts: [{type: "text", text: "..."}, ...]`.
        text = _extract_text(body.get("parts") or [])
        if not text:
            raise HTTPException(
                status_code=400, detail="empty message — need at least one text part"
            )

        # Cache an echo of the user message immediately so a follow-up
        # GET /messages reflects it before the assistant turn resolves.
        user_msg_id = "msg_" + uuid.uuid4().hex[:12]
        user_record = {
            "id": user_msg_id,
            "session_id": sid,
            "role": "user",
            "parts": [{"id": "part_" + uuid.uuid4().hex[:12], "type": "text", "text": text}],
            "created_at": now_iso(),
        }
        sess.cached_messages.append(user_record)
        # Also broadcast it as a message.created event for any active
        # SSE subscribers. SPEC §7.3 says payload IS the Message itself
        # (not wrapped in {"message": {...}}).
        await _broadcast(sess, envelope("message.created", user_record))

        # Spawn the SDK turn in the background; SSE consumers see it
        # stream out via the per-session subscriber queues. Hold a
        # strong reference in state.background_tasks so the GC can't
        # cancel the task mid-stream (RUF006).
        task = asyncio.create_task(_run_turn(sess, text, state))
        state.background_tasks.add(task)
        task.add_done_callback(state.background_tasks.discard)

        return {"message_id": user_msg_id, "accepted_at": now_iso()}

    # --- §6.6 tools -------------------------------------------------

    @app.get("/v1/tools")
    async def list_tools() -> dict[str, Any]:
        """Returns the SDK-discovered tool catalog. The list comes
        from the first SystemMessage(init) that any session received;
        before any session has run a turn, this is empty (the tool
        list is cwd-dependent so we can't pre-populate it).
        """
        return {
            "tools": [
                {
                    "id": name,
                    "name": name,
                    "source": "builtin",
                    "input_schema": {"type": "object"},
                }
                for name in state.tool_names
            ]
        }

    @app.get("/v1/tools/{tool_id}")
    async def get_tool(tool_id: str) -> dict[str, Any]:
        if tool_id not in state.tool_names:
            raise HTTPException(status_code=404, detail="tool_not_found")
        return {
            "id": tool_id,
            "name": tool_id,
            "source": "builtin",
            "input_schema": {"type": "object"},
        }

    # --- §6.7 MCP ---------------------------------------------------

    @app.get("/v1/mcp/servers")
    async def list_mcp_servers() -> dict[str, Any]:
        """IIIIIII2: returns the SDK-discovered MCP catalog.

        Empty until the first session runs a turn (the SDK reveals
        mcp_servers only on SystemMessage(init)). Per-server tool/
        resource/prompt drill-downs aren't surfaced through the
        claude-agent-sdk control protocol so we don't expose them.
        """
        return {"servers": list(state.mcp_servers)}

    @app.get("/v1/mcp/servers/{server_id}")
    async def get_mcp_server(server_id: str) -> dict[str, Any]:
        for s in state.mcp_servers:
            if s["id"] == server_id:
                return s
        raise HTTPException(status_code=404, detail="server_not_found")

    # --- §6.11 permissions ------------------------------------------

    @app.get("/v1/permissions")
    async def list_permissions(
        session_id: str | None = None, status: str | None = None
    ) -> dict[str, Any]:
        out: list[dict[str, Any]] = []
        for p in state.permissions.values():
            if session_id and p["session_id"] != session_id:
                continue
            if status == "pending" and p.get("resolved"):
                continue
            out.append(p)
        return {"permissions": out}

    @app.get("/v1/permissions/{pid}")
    async def get_permission(pid: str) -> dict[str, Any]:
        p = state.permissions.get(pid)
        if p is None:
            raise HTTPException(status_code=404, detail="permission_not_found")
        return p

    @app.post("/v1/permissions/{pid}")
    async def respond_permission(pid: str, body: dict[str, Any]) -> dict[str, Any]:
        action = body.get("action")
        if action not in ("allow", "deny", "allow_session", "allow_workspace"):
            raise HTTPException(status_code=400, detail=f"invalid action: {action!r}")
        p = state.permissions.get(pid)
        if p is None:
            raise HTTPException(status_code=404, detail="permission_not_found")
        fut = state.permission_futures.get(pid)
        if fut is None or fut.done():
            raise HTTPException(status_code=409, detail="permission already resolved")
        # allow_session/workspace are sticky in the spec but we don't
        # track scope yet — collapse to one-shot allow for now.
        allowed = action in ("allow", "allow_session", "allow_workspace")
        fut.set_result(allowed)
        p["resolved"] = True
        p["action"] = action
        # Broadcast permission.resolved on the right session so the
        # TUI's banner clears.
        sid = p["session_id"]
        sess = state.sessions.get(sid)
        if sess is not None:
            await _broadcast(
                sess,
                envelope(
                    "permission.resolved",
                    {
                        "permission_id": pid,
                        "session_id": sid,
                        "action": action,
                    },
                ),
            )
        return {"id": pid, "action": action}

    # --- §7 SSE events ----------------------------------------------

    @app.get("/v1/sessions/{sid}/events")
    async def session_events(sid: str, request: Request) -> EventSourceResponse:
        sess = state.sessions.get(sid)
        if sess is None:
            raise HTTPException(status_code=404, detail="session_not_found")
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        sess.subscribers.append(queue)

        # Send the SPEC §7.3 server.connected handshake immediately so
        # the client knows the stream is live.
        await queue.put(envelope("server.connected", {"session_id": sid}))

        async def stream():
            try:
                while True:
                    if await request.is_disconnected():
                        return
                    try:
                        ev = await asyncio.wait_for(queue.get(), timeout=10.0)
                    except TimeoutError:
                        # SPEC §7.3 server.heartbeat every ~15s.
                        ev = envelope("server.heartbeat", {})
                    yield {
                        "event": ev["type"],
                        "id": str(uuid.uuid4()),
                        "data": _json_dumps(ev),
                    }
            finally:
                if queue in sess.subscribers:
                    sess.subscribers.remove(queue)

        # sep="\n" forces LF-only line endings. Default sse-starlette
        # uses CRLF, which is RFC-conformant but trips clients whose
        # parsers (e.g. gact's bufio.Scanner-based reader) leave a
        # trailing \r on lines and then fail the "blank line ends an
        # event" check. LF works for every conforming client.
        return EventSourceResponse(stream(), sep="\n")

    return app


# --- helpers ---------------------------------------------------------


def _json_dumps(obj: Any) -> str:
    import json

    return json.dumps(obj, default=str)


def _slug(name: str) -> str:
    """Stable URL-safe id from a free-form name. Used for synthetic
    MCP server ids since the SDK doesn't provide them. Lowercases,
    keeps [a-z0-9] + replaces everything else with '_'.
    """
    out: list[str] = []
    for ch in name.lower():
        out.append(ch if ch.isalnum() else "_")
    return "mcp_" + "".join(out).strip("_") or "mcp_unnamed"


def _session_record(sess: Session) -> dict[str, Any]:
    """Project a Session into the GACT Session JSON shape."""
    return {
        "id": sess.id,
        "workspace_id": sess.workspace_id,
        "title": sess.title,
        "status": sess.status,
        "created_at": sess.created_at,
    }


def _extract_text(parts: list[dict[str, Any]]) -> str:
    """Concatenate all text parts in a GACT message body."""
    chunks: list[str] = []
    for p in parts:
        if p.get("type") == "text":
            t = p.get("text")
            if isinstance(t, str):
                chunks.append(t)
    return "".join(chunks)


async def _broadcast(sess: Session, event: dict[str, Any]) -> None:
    """Push an event to every SSE subscriber on this session."""
    for q in list(sess.subscribers):
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            pass


def _make_can_use_tool(sess: Session, state: State):
    """Build the SDK's can_use_tool callback closure for a session.

    Returns an async function the SDK invokes before every tool call.
    The callback synthesises a SPEC §6.11 permission.requested event,
    parks an asyncio.Future on State.permission_futures, and awaits
    the TUI's POST /v1/permissions/{pid} response. Returns
    PermissionResultAllow or PermissionResultDeny per the SPEC.

    Important: the returned callback runs in the SDK's event loop,
    which is the same loop the FastAPI handlers run on, so the
    future-based handoff is safe without thread sync.
    """

    async def can_use_tool(
        tool_name: str,
        input_dict: dict[str, Any],
        ctx: ToolPermissionContext,
    ) -> PermissionResultAllow | PermissionResultDeny:
        pid = "perm_" + uuid.uuid4().hex[:12]
        record = {
            "id": pid,
            "session_id": sess.id,
            "tool_call": {
                "call_id": ctx.tool_use_id or "",
                "tool_name": tool_name,
                "input": input_dict,
                "annotations": {},
            },
            "summary": f"Run tool: {tool_name}",
            "created_at": now_iso(),
            "resolved": False,
        }
        state.permissions[pid] = record
        fut: asyncio.Future[bool] = asyncio.get_running_loop().create_future()
        state.permission_futures[pid] = fut

        # Flip session status so the TUI's badge reflects the wait.
        prev = sess.status
        sess.status = "waiting_permission"
        await _broadcast(
            sess,
            envelope(
                "session.status_changed",
                {
                    "session_id": sess.id,
                    "status": "waiting_permission",
                    "prev_status": prev,
                },
            ),
        )
        await _broadcast(sess, envelope("permission.requested", record))

        try:
            allowed = await fut
        finally:
            # Restore status to running; the SDK turn is still mid-flight.
            sess.status = "running"
            await _broadcast(
                sess,
                envelope(
                    "session.status_changed",
                    {
                        "session_id": sess.id,
                        "status": "running",
                        "prev_status": "waiting_permission",
                    },
                ),
            )

        if allowed:
            return PermissionResultAllow(updated_input=None, updated_permissions=None)
        return PermissionResultDeny(
            message="denied via gact TUI permission flow",
            interrupt=False,
        )

    return can_use_tool


async def _run_turn(sess: Session, prompt: str, state: State) -> None:
    """Drive one assistant turn through claude-agent-sdk and push
    every resulting message to the session's SSE subscribers + cached
    messages list. Holds a per-session lock so concurrent POSTs
    serialize.
    """
    async with sess.turn_lock:
        sess.status = "running"
        await _broadcast(
            sess,
            envelope(
                "session.status_changed",
                {
                    "session_id": sess.id,
                    "status": "running",
                    "prev_status": "idle",
                },
            ),
        )

        # Lazily start the SDK client on first turn. resume= would let
        # us pick up an existing claude session_id; we leave it to the
        # SDK to pick a fresh one on connect.
        if sess.client is None:
            opts = ClaudeAgentOptions(
                cwd=state.cwd,
                cli_path=state.cli_path,
                # GGGGGGG4: ask the SDK to surface incremental
                # StreamEvents alongside the final AssistantMessage.
                # Bridge translates the Anthropic streaming protocol
                # into GACT message.part.delta events so the TUI
                # renders char-by-char.
                include_partial_messages=True,
                # HHHHHHH1: every tool call routes through this
                # callback. We translate it into a SPEC §6.11
                # permission.requested event on the session SSE
                # stream and block on a future the TUI resolves
                # via POST /v1/permissions/{pid}.
                can_use_tool=_make_can_use_tool(sess, state),
            )
            sess.client = ClaudeSDKClient(options=opts)
            await sess.client.connect()

        try:
            await sess.client.query(prompt)
            async for msg in sess.client.receive_response():
                # GGGGGGG1: capture the SDK's tool catalog from the
                # init SystemMessage so /v1/tools can serve it. The
                # tool list is cwd-dependent (CLAUDE.md/MCP/agents
                # affect resolution) so we can only learn it from a
                # live SDK turn — but once we know, it sticks for
                # the adapter's lifetime.
                from claude_agent_sdk import SystemMessage

                if isinstance(msg, SystemMessage) and isinstance(msg.data, dict):
                    if not state.tool_names:
                        tools = msg.data.get("tools")
                        if isinstance(tools, list):
                            state.tool_names = [str(t) for t in tools if isinstance(t, str)]
                    # IIIIIII2: capture MCP servers too. Each entry is
                    # {name, status}; we add a stable id derived from
                    # the name so SPEC §6.7 per-id endpoints work.
                    if not state.mcp_servers:
                        servers = msg.data.get("mcp_servers")
                        if isinstance(servers, list):
                            mapped: list[dict[str, Any]] = []
                            for s in servers:
                                if not isinstance(s, dict):
                                    continue
                                name = s.get("name")
                                if not isinstance(name, str) or not name:
                                    continue
                                # SDK status values: "connected",
                                # "needs-auth", "failed", "pending".
                                # Map onto SPEC §6.7's enum
                                # (connecting|ready|error|disconnected).
                                raw = str(s.get("status") or "")
                                status_map = {
                                    "connected": "ready",
                                    "needs-auth": "error",
                                    "failed": "error",
                                    "pending": "connecting",
                                }
                                mapped_status = status_map.get(raw, "disconnected")
                                mapped.append(
                                    {
                                        "id": _slug(name),
                                        "name": name,
                                        "transport": "stdio",
                                        "status": mapped_status,
                                        "x_claudecode_raw_status": raw,
                                    }
                                )
                            state.mcp_servers = mapped
                # StreamEvents take a separate path because they
                # need session-level state (active streaming msg id).
                if isinstance(msg, StreamEvent):
                    events, sess.active_stream_msg_id = stream_event_to_events(
                        msg, sess.id, sess.active_stream_msg_id
                    )
                    for ev in events:
                        await _broadcast(sess, ev)
                    continue
                for ev in sdk_message_to_events(msg, sess.id, cwd=state.cwd):
                    await _broadcast(sess, ev)
                    # Cache assistant + user messages for GET /messages.
                    # message.created payload IS the Message itself (per
                    # SPEC §7.3 + the gact TUI's applyMessageCreated).
                    if ev["type"] == "message.created":
                        sess.cached_messages.append(ev["payload"])
        except Exception as e:
            sess.status = "error"
            await _broadcast(
                sess,
                envelope(
                    "session.status_changed",
                    {
                        "session_id": sess.id,
                        "status": "error",
                        "prev_status": "running",
                        "error": str(e),
                    },
                ),
            )
            return
        sess.status = "idle"


def main_app() -> FastAPI:
    """Module-level app factory — used by `uvicorn gact_claude_sdk.server:main_app`."""
    cwd = os.environ.get("GACT_CLAUDE_CWD") or os.getcwd()
    cli_path = os.environ.get("GACT_CLAUDE_CLI") or None
    return make_app(cwd=cwd, cli_path=cli_path)
