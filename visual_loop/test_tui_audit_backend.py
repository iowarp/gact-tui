import socket
import tempfile
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from threading import Thread

from tui_audit_backend import find_port, write_workspace_mcp_override
from tui_audit_backend_http import request_json


class JsonHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"ok": true}')

    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers.get("Content-Length", "0"))
        self.rfile.read(length)
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'["created"]')

    def log_message(self, *_: object) -> None:
        return None


class TuiAuditBackendTest(unittest.TestCase):
    def test_request_json_decodes_dict_and_wraps_non_dict_json(self) -> None:
        server = HTTPServer(("127.0.0.1", 0), JsonHandler)
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        base = f"http://127.0.0.1:{server.server_port}"

        self.assertEqual(request_json("GET", base), {"ok": True})
        self.assertEqual(request_json("POST", base, {"name": "audit"}), {"data": ["created"]})

    def test_find_port_skips_bound_port(self) -> None:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.bind(("127.0.0.1", 0))
            busy_port = int(sock.getsockname()[1])

            self.assertNotEqual(find_port(busy_port), busy_port)

    def test_write_workspace_mcp_override_requires_all_servers(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)

            self.assertEqual(write_workspace_mcp_override(root / "workspace", root / "kit", disabled=False), "")

    def test_write_workspace_mcp_override_writes_workspace_config(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            kit = root / "kit" / "clio-kit-mcp-servers"
            for name in ("ndp", "geo", "pandas", "plot"):
                (kit / name).mkdir(parents=True)
            workspace = root / "workspace"

            path = Path(write_workspace_mcp_override(workspace, root / "kit", disabled=False))

            self.assertEqual(path, workspace / ".clio" / "mcp.yaml")
            text = path.read_text(encoding="utf-8")
            self.assertIn("ndp-mcp", text)
            self.assertIn("plot-mcp", text)


if __name__ == "__main__":
    unittest.main()
