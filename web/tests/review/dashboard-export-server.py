"""Replay recorded read responses against real GACT capture and export routes.

Requires explicit local input paths; all service state lives in one temporary
directory that is removed on shutdown. No LM, shell runtime or new worktree.
"""

from __future__ import annotations

import asyncio
import base64
import gzip
import json
import os
import re
import tempfile
from pathlib import Path
from typing import Any


def main() -> None:
    """Run the bounded private review service until interrupted."""
    import uvicorn

    with tempfile.TemporaryDirectory(
        prefix="clio-dashboard-review-", dir=os.environ["TEMP"]
    ) as directory:
        root = Path(directory).resolve()
        os.environ["CLIO_AGENT_HOME"] = str(root / "agent")
        os.environ["CLIO_RUNTIME_STATE_DIR"] = str(root / "runtime")
        os.environ["CLIO_GACT_CORS_ORIGINS"] = "http://127.0.0.1:5214"
        os.environ["CLIO_RUNTIME_AUTOSTART"] = "0"
        from fastapi import Request
        from fastapi.responses import JSONResponse, Response

        from clio_agent.arc.live import _MemoryStore
        from clio_agent.arc.memory import ARCMemory
        from clio_agent.gact.app import build_app
        from clio_agent.gact.dashboard_reports import _store

        app = build_app(
            sessions_path=root / "sessions.json",
            arc=ARCMemory(data_dir=str(root / "arc"), store=_MemoryStore()),
        )
        app.state.workspaces.update("ws_default", root_path=str(root))
        session = app.state.sessions.create(
            workspace_id="ws_default", title="Recorded dashboard review"
        )
        report = json.loads(Path(os.environ["CLIO_REVIEW_DASHBOARD"]).read_text(encoding="utf-8"))
        old_sid = report["session_id"]
        report["session_id"] = session.id
        report["surface"]["session_id"] = session.id
        report["definition_path"] = str(root / "definition.dashboard.json")
        content = json.dumps(report, ensure_ascii=False).encode()
        (root / "dashboard.json").write_bytes(content)
        artifact_id = _store(app, session.id, report, payload=content, extension="json")

        transcript = Path(os.environ["CLIO_REVIEW_TRANSCRIPT"]).read_text(encoding="utf-8")
        encoded = re.search(r'window.CLIO_EXPORT_DATA="([^"]+)"', transcript)
        if encoded is None:
            raise ValueError("The supplied transcript has no captured data.")
        archive = json.loads(gzip.decompress(base64.b64decode(encoded[1])))
        responses = {
            key.replace(old_sid, session.id): value
            for key, value in archive["snapshot"]["responses"].items()
        }
        # The transcript captured the earlier three asset views. The dashboard
        # also links its later HTML output, read from the supplied workspace.
        html_uri = next(
            c["uri"] for c in report["definition"]["components"] if c.get("id") == "htmlFile"
        )
        existing = next(
            value["json"] for key, value in responses.items() if "/references/resolve?" in key
        )
        from urllib.parse import quote

        html_ref = dict(existing)
        html_bytes = Path(os.environ["CLIO_REVIEW_SCENE"]).read_bytes()
        html_ref.update(
            uri=html_uri,
            artifact_id=html_uri.removeprefix("artifact://"),
            name="raccoon-threejs.html",
            media_type="text/html",
            size_bytes=len(html_bytes),
        )
        html_ref["fetch_path"] = f"/v1/artifacts/{html_ref['artifact_id']}/bytes"
        responses[
            f"GET /v1/sessions/{session.id}/references/resolve?uri={quote(html_uri, safe='')}"
        ] = {"json": html_ref}
        responses[f"GET {html_ref['fetch_path']}"] = {
            "bytes": base64.b64encode(html_bytes).decode()
        }

        @app.middleware("http")
        async def recorded_reads(request: Request, call_next: Any) -> Response:
            """Replay only recorded GETs; capture and export use the real server."""
            key = f"{request.method} {request.url.path}"
            if request.url.query:
                key += "?" + request.url.query
            value = responses.get(key) if request.method == "GET" else None
            if value is not None:
                headers = {"Access-Control-Allow-Origin": "http://127.0.0.1:5214"}
                if "bytes" in value:
                    return Response(
                        base64.b64decode(value["bytes"]),
                        media_type="application/octet-stream",
                        headers=headers,
                    )
                if "json" in value:
                    return JSONResponse(value["json"], headers=headers)
                return JSONResponse(value.get("error", {}), status_code=404, headers=headers)
            return await call_next(request)

        @app.get("/__test/dashboard")
        async def dashboard() -> dict[str, Any]:
            """Return the recorded report registered in this private workspace."""
            return {"report": report, "artifact_id": artifact_id}

        @app.get("/__test/viewers")
        async def viewers() -> list[dict[str, Any]]:
            """Read real viewer readiness and epochs."""
            return app.state.a2ui_visual.viewers(session.id, report["surface"]["id"])

        @app.post("/__test/capture")
        async def capture() -> dict[str, Any]:
            """Request fresh pixels through the production bounded capture loop."""
            pixels, metadata = await asyncio.to_thread(
                app.state.a2ui_visual.capture,
                session.id,
                report["surface"]["id"],
                report["surface"]["revision"],
                artifact_id=artifact_id,
            )
            target = Path(os.environ["CLIO_REVIEW_EVIDENCE"]) / "agent-dashboard-capture.png"
            target.write_bytes(pixels)
            return metadata

        server = uvicorn.Server(
            uvicorn.Config(app, host="127.0.0.1", port=18817, log_level="warning")
        )

        @app.post("/__test/shutdown")
        async def shutdown() -> dict[str, bool]:
            """Exit cooperatively so the temporary directory is cleaned."""
            server.should_exit = True
            return {"ok": True}

        print(json.dumps({"temporary_state": str(root), "port": 18817}), flush=True)
        server.run()


if __name__ == "__main__":
    main()
