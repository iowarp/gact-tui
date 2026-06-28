"""Backend/workspace setup helpers for CLIO-backed TUI audit sessions."""

from __future__ import annotations

import argparse
import os
import pathlib
import subprocess

from tui_audit_backend_http import find_port, request_json, wait_http
from tui_audit_pty import terminate_process
from tui_audit_sse import now, write_jsonl


EXPECTED_MCP_TOOLS = {
    "ndp": {"search_datasets", "stage_resource"},
    "geo": {"filter_points_by_radius"},
    "pandas": {"profile_csv"},
    "plot": {"plot_timeseries"},
}


def start_backend(
    args: argparse.Namespace,
    out_dir: pathlib.Path,
    workspace_root: pathlib.Path,
) -> tuple[subprocess.Popen | None, str]:
    if args.backend_url:
        wait_http(args.backend_url)
        return None, args.backend_url.rstrip("/")

    backend_bin = pathlib.Path(args.backend_bin)
    if not backend_bin.exists():
        raise RuntimeError(f"backend binary not found: {backend_bin}")
    clio_root = pathlib.Path(args.clio_root)
    port = find_port(args.port)
    backend_log = (out_dir / "backend.log").open("wb")
    env = os.environ.copy()
    env.setdefault("CLIO_AGENT_SRC", str(clio_root))
    env.setdefault("CLIO_AGENT_MAX_STEPS", "12")
    env.setdefault("CLIO_GACT_TURN_TIMEOUT_S", "900")
    env.setdefault("CLIO_TRANSIENT_PROVIDER_RETRY_DELAYS", "5,15")
    env["CLIO_KIT_PATH"] = str(pathlib.Path(args.local_clio_kit_root).resolve())
    env["XDG_CONFIG_HOME"] = str(out_dir / "config")
    env["CLIO_DATA_DIR"] = str(out_dir / "data")
    env["CLIO_SEMANTIC_TRACE_BACKEND"] = "file"
    env["CLIO_SEMANTIC_TRACE_PATH"] = str(out_dir / "traces")
    env["CLIO_ALLOWED_ROOTS"] = os.pathsep.join(
        [
            str(workspace_root),
            str(clio_root),
            str(pathlib.Path(args.marketplace_source).resolve()),
            str(pathlib.Path(args.local_clio_kit_root).resolve()),
            os.environ.get("CLIO_ALLOWED_ROOTS", ""),
        ]
    ).rstrip(os.pathsep)
    proc = subprocess.Popen(
        [str(backend_bin), "--host", "127.0.0.1", "--port", str(port), "--cwd", str(workspace_root)],
        cwd=workspace_root,
        stdout=backend_log,
        stderr=subprocess.STDOUT,
        env=env,
        start_new_session=True,
    )
    backend_url = f"http://127.0.0.1:{port}"
    try:
        wait_http(backend_url, timeout_s=60)
    except Exception:
        terminate_process(proc)
        raise
    return proc, backend_url


def write_workspace_mcp_override(workspace_root: pathlib.Path, clio_kit_root: pathlib.Path, disabled: bool) -> str:
    if disabled:
        return ""
    mcp_root = clio_kit_root / "clio-kit-mcp-servers"
    required = ["ndp", "geo", "pandas", "plot"]
    if not all((mcp_root / name).is_dir() for name in required):
        return ""
    storage_root = workspace_root / ".clio"
    storage_root.mkdir(parents=True, exist_ok=True)
    path = storage_root / "mcp.yaml"
    path.write_text(
        "\n".join(
            [
                "mcp_servers:",
                f"  ndp: uv run --directory {mcp_root / 'ndp'} ndp-mcp",
                f"  geo: uv run --directory {mcp_root / 'geo'} geo-mcp",
                f"  pandas: uv run --directory {mcp_root / 'pandas'} pandas-mcp",
                f"  plot: uv run --directory {mcp_root / 'plot'} plot-mcp",
                "",
            ]
        ),
        encoding="utf-8",
    )
    return str(path)


def configure_provider(base_url: str, provider: str, model: str) -> dict:
    info = request_json("GET", base_url + "/v1/providers/lm")
    presets = info.get("presets") if isinstance(info.get("presets"), list) else []
    preset = next((p for p in presets if isinstance(p, dict) and p.get("id") == provider), {})
    selected_model = model or str(preset.get("suggested_model") or "gpt-5-codex")
    body: dict[str, object] = {
        "provider": provider,
        "api_base": str(preset.get("api_base") or ""),
        "model": selected_model,
        "temperature": 0.2,
    }
    if provider == "codex":
        body["transport"] = "exec"
    if provider == "argonne":
        body["max_tokens"] = 32000
    configured = request_json("PUT", base_url + "/v1/providers/lm", body, timeout=120)
    try:
        configured = request_json("GET", base_url + "/v1/providers/lm/wait", timeout=120)
    except Exception:
        pass
    return configured


def install_marketplace_blueprint(
    base_url: str,
    workspace_id: str,
    marketplace_source: pathlib.Path,
    blueprint_id: str,
) -> dict:
    listed = request_json(
        "GET",
        base_url + f"/v1/agent-blueprints?workspace_id={workspace_id}",
        timeout=60,
    )
    rows = listed.get("agent_blueprints") if isinstance(listed.get("agent_blueprints"), list) else []
    existing = next((row for row in rows if isinstance(row, dict) and row.get("id") == blueprint_id), None)
    if existing is None:
        request_json(
            "POST",
            base_url + "/v1/agent-blueprints/install",
            {
                "source": str(marketplace_source),
                "scope": "workspace",
                "workspace_id": workspace_id,
                "blueprint_id": blueprint_id,
            },
            timeout=120,
        )
        listed = request_json(
            "GET",
            base_url + f"/v1/agent-blueprints?workspace_id={workspace_id}",
            timeout=60,
        )
        rows = listed.get("agent_blueprints") if isinstance(listed.get("agent_blueprints"), list) else []
        existing = next((row for row in rows if isinstance(row, dict) and row.get("id") == blueprint_id), None)
    if existing is None:
        raise RuntimeError(f"blueprint {blueprint_id!r} was not installed in workspace {workspace_id}")
    return existing


def assert_workspace_mcp_ready(base_url: str, workspace_id: str, out_path: pathlib.Path) -> dict:
    handshake = request_json(
        "GET",
        base_url + f"/v1/mcp/handshake?workspace_id={workspace_id}",
        timeout=180,
    )
    write_jsonl(
        out_path,
        {
            "observed_at": now(),
            "source": "clio_rest_snapshot",
            "kind": "mcp.handshake.preflight",
            "data": handshake,
        },
    )
    servers = handshake.get("servers") if isinstance(handshake.get("servers"), list) else []
    by_name = {str(row.get("name") or ""): row for row in servers if isinstance(row, dict)}
    failures: list[str] = []
    for name, expected_tools in EXPECTED_MCP_TOOLS.items():
        row = by_name.get(name)
        if not row:
            failures.append(f"{name}: missing")
            continue
        if not row.get("reachable"):
            failures.append(f"{name}: unreachable ({row.get('error') or row.get('state') or 'no error'})")
            continue
        tools = {str(tool) for tool in row.get("tools") or []}
        missing_tools = sorted(expected_tools - tools)
        if missing_tools:
            failures.append(f"{name}: missing tools {', '.join(missing_tools)}")
    if failures:
        raise RuntimeError("workspace MCP preflight failed: " + "; ".join(failures))
    return handshake


def create_workspace_and_session(
    base_url: str,
    workspace_root: pathlib.Path,
    out_dir: pathlib.Path,
    prompt: str,
    marketplace_source: pathlib.Path,
    blueprint_id: str,
    trace_path: pathlib.Path,
) -> tuple[str, str, dict]:
    workspace_root.mkdir(parents=True, exist_ok=True)
    ws = request_json(
        "POST",
        base_url + "/v1/workspaces",
        {
            "name": "tui-audit-san-diego-earthscope",
            "root_path": str(workspace_root),
            "storage_root": str(out_dir / "workspace_storage"),
            "metadata": {
                "audit": "tui_clio_trace_comparison",
                "prompt": prompt,
            },
        },
    )
    ws_id = str(ws.get("id") or ws.get("workspace_id") or "")
    if not ws_id:
        raise RuntimeError(f"workspace response did not include id: {ws}")
    install_audit_permission_policy(base_url, ws_id, workspace_root)
    installed_blueprint = install_marketplace_blueprint(
        base_url,
        ws_id,
        marketplace_source,
        blueprint_id,
    )
    mcp_handshake = assert_workspace_mcp_ready(base_url, ws_id, trace_path)
    sess = request_json(
        "POST",
        base_url + "/v1/sessions",
        {
            "workspace_id": ws_id,
            "title": "TUI audit: San Diego EarthScope station plot",
            "routing_mode": "auto",
            "metadata": {
                "audit": "tui_clio_trace_comparison",
                "prompt": prompt,
            },
        },
    )
    sid = str(sess.get("id") or sess.get("session_id") or "")
    if not sid:
        raise RuntimeError(f"session response did not include id: {sess}")
    blueprint = request_json(
        "POST",
        base_url + f"/v1/sessions/{sid}/agent-blueprint",
        {"blueprint_id": blueprint_id},
    )
    return ws_id, sid, {
        "installed_blueprint": installed_blueprint,
        "mcp_handshake": mcp_handshake,
        "session_activation": blueprint,
    }


def install_audit_permission_policy(base_url: str, workspace_id: str, workspace_root: pathlib.Path) -> None:
    request_json(
        "PUT",
        base_url + "/v1/policies",
        {
            "policies": [
                {
                    "scope": "workspace",
                    "scope_id": workspace_id,
                    "tool_name_pattern": "shell_bash",
                    "path_pattern": str(workspace_root) + "/*",
                    "action": "allow_workspace",
                }
            ]
        },
    )


def append_final_snapshots(base_url: str, session_id: str, out_path: pathlib.Path) -> None:
    for kind, endpoint in [
        ("provider.final", "/v1/providers/lm"),
        ("session.final", f"/v1/sessions/{session_id}"),
        ("messages.final", f"/v1/sessions/{session_id}/messages"),
        ("blueprint.final", f"/v1/sessions/{session_id}/agent-blueprint"),
    ]:
        try:
            data = request_json("GET", base_url + endpoint, timeout=30)
        except Exception as exc:  # noqa: BLE001
            data = {"error": repr(exc)}
        write_jsonl(
            out_path,
            {
                "observed_at": now(),
                "source": "clio_rest_snapshot",
                "kind": kind,
                "data": data,
            },
        )
