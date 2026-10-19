from __future__ import annotations

import json

import fakeredis
import httpx
import pytest

from worker_embedder import main as main_module

WORKSPACE_ID = "33333333-3333-4333-8333-333333333333"


class StubApiClient:
    """Stand-in for the shared HTTP client: no network, no API."""

    instances: list[StubApiClient] = []

    def __init__(self, *_args, **_kwargs) -> None:
        self.writes: list[tuple[str, dict]] = []
        StubApiClient.instances.append(self)

    def get(self, path: str, **kwargs) -> httpx.Response:
        return httpx.Response(200, json={"node": {"title": "A title", "description": None}})

    def put(self, path: str, **kwargs) -> httpx.Response:
        self.writes.append((path, kwargs))
        return httpx.Response(204)

    def close(self) -> None:
        pass


class StubEmbedder:
    def __init__(self, *_args, **_kwargs) -> None:
        pass

    def embed(self, _text: str) -> list[float]:
        return [0.125] * 768

    def close(self) -> None:
        pass


@pytest.fixture(autouse=True)
def _stub_clients(monkeypatch: pytest.MonkeyPatch) -> None:
    StubApiClient.instances = []
    monkeypatch.setattr(main_module, "ApiClient", StubApiClient)
    monkeypatch.setattr(main_module, "OllamaEmbedder", StubEmbedder)


def test_check_mode_validates_a_static_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AGENT_TOKEN", "static-test-token")
    monkeypatch.delenv("AGENT_TOKEN_FILE", raising=False)

    assert main_module.main(["--check"]) == 0


def test_missing_credentials_fail_fast(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in ("AGENT_TOKEN", "AGENT_TOKEN_FILE", "JWT_SECRET"):
        monkeypatch.delenv(name, raising=False)

    assert main_module.main(["--check"]) == 2


def test_once_consumes_a_node_created_event(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = fakeredis.FakeRedis(decode_responses=True)
    monkeypatch.setattr(
        main_module.redis.Redis,
        "from_url",
        staticmethod(lambda *_args, **_kwargs: fake),
    )
    monkeypatch.setenv("AGENT_TOKEN", "static-test-token")

    fake.xadd(
        "stream:node_created",
        {
            "reqId": "req-1",
            "nodeId": "node-1",
            "workspaceId": WORKSPACE_ID,
            "typeKey": "Problem",
            "title": "A title",
        },
    )

    assert main_module.main(["--once"]) == 0

    # The event was handled and acknowledged: nothing stays pending.
    assert fake.xpending("stream:node_created", "embedder")["pending"] == 0

    api = StubApiClient.instances[-1]
    assert len(api.writes) == 1
    path, kwargs = api.writes[0]
    assert path == "/api/v1/nodes/node-1/embedding"
    assert kwargs["workspace_id"] == WORKSPACE_ID
    assert kwargs["correlation_id"] == "req-1"
    assert json.loads(json.dumps(kwargs["json"]))["model"] == "nomic-embed-text"
