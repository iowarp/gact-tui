"""The CLI serves the adapter behind a Host check and a bearer token."""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from gact_claude_sdk.access import AccessMiddleware, adapter_token


@pytest.fixture
def client() -> TestClient:
    inner = FastAPI()

    @inner.get("/v1/health")
    def health() -> dict[str, str]:
        return {"ok": "yes"}

    @inner.post("/v1/permissions/{pid}")
    def answer(pid: str) -> dict[str, str]:
        return {"answered": pid}

    app = AccessMiddleware(inner, token="s3cret", allowed_hosts=frozenset({"clio.lab.example"}))
    return TestClient(app, base_url="http://127.0.0.1:7780")


def test_the_token_is_required_except_for_health(client: TestClient) -> None:
    assert client.get("/v1/health").status_code == 200
    assert client.post("/v1/permissions/p1").status_code == 401
    bad = client.post("/v1/permissions/p1", headers={"Authorization": "Bearer nope"})
    assert bad.status_code == 401
    good = client.post("/v1/permissions/p1", headers={"Authorization": "Bearer s3cret"})
    assert good.json() == {"answered": "p1"}


@pytest.mark.parametrize(
    "host, status",
    [
        ("localhost:7780", 200),
        ("[::1]:7780", 200),
        ("clio.lab.example:7780", 200),
        ("evil.example:7780", 403),
    ],
)
def test_host_names(client: TestClient, host: str, status: int) -> None:
    response = client.get("/v1/health", headers={"Host": host})
    assert response.status_code == status


def test_adapter_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GACT_ADAPTER_TOKEN", raising=False)
    assert adapter_token(" given ") == ("given", False)
    monkeypatch.setenv("GACT_ADAPTER_TOKEN", "from-env")
    assert adapter_token(None) == ("from-env", False)
    monkeypatch.delenv("GACT_ADAPTER_TOKEN")
    first, generated = adapter_token(None)
    assert generated and len(first) == 48 and first != adapter_token(None)[0]
