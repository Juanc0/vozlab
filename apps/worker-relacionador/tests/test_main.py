from __future__ import annotations

import fakeredis
import httpx
import pytest

from worker_relacionador import main as main_module

WORKSPACE_ID = "33333333-3333-4333-8333-333333333333"


class StubApiClient:
    """Stand-in for the shared HTTP client: no network, no API."""

    instances: list[StubApiClient] = []

    def __init__(self, *_args, **_kwargs) -> None:
        self.posts: list[tuple[str, dict]] = []
        StubApiClient.instances.append(self)

    def get(self, path: str, **kwargs) -> httpx.Response:
        if path.endswith("/neighbors"):
            return httpx.Response(
                200,
                json={
                    "node": {
                        "id": "node-1",
                        "typeKey": "Problem",
                        "title": "A title",
                        "description": None,
                        "status": "PENDING",
                    },
                    "neighbors": [],
                },
            )
        if path == "/api/v1/ontology":
            return httpx.Response(200, json={"classes": [], "objectProperties": []})
        if path == "/api/v1/edges":
            return httpx.Response(200, json={"edges": [], "nextCursor": None})
        raise AssertionError(f"unexpected GET {path}")

    def post(self, path: str, **kwargs) -> httpx.Response:
        self.posts.append((path, kwargs))
        return httpx.Response(201, json={"id": "edge-1"})

    def close(self) -> None:
        pass


class StubChat:
    def __init__(self, *_args, **_kwargs) -> None:
        pass

    def decide(self, _node, _neighbors):
        from worker_relacionador.llm import Verdict

        return Verdict(action="INDEPENDENT", target_id=None, reason="stub")

    def close(self) -> None:
        pass


@pytest.fixture(autouse=True)
def _stub_clients(monkeypatch: pytest.MonkeyPatch) -> None:
    StubApiClient.instances = []
    monkeypatch.setattr(main_module, "ApiClient", StubApiClient)
    monkeypatch.setattr(main_module, "OllamaChat", StubChat)


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
    assert fake.xpending("stream:node_created", "relator")["pending"] == 0
