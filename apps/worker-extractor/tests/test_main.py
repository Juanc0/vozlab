from __future__ import annotations

import fakeredis
import httpx
import pytest

from worker_extractor import main as main_module

WORKSPACE_ID = "33333333-3333-4333-8333-333333333333"


class StubApiClient:
    """Stand-in for the shared HTTP client: no network, no API."""

    instances: list[StubApiClient] = []

    def __init__(self, *_args, **_kwargs) -> None:
        self.posts: list[tuple[str, dict]] = []
        StubApiClient.instances.append(self)

    def get(self, path: str, **kwargs) -> httpx.Response:
        if path == "/api/v1/ingestion/resolve-source":
            return httpx.Response(
                200,
                json={
                    "sourceId": "dev-minutes-2026",
                    "workspaceId": WORKSPACE_ID,
                    "connectorType": "MINUTES",
                    "behaviorProfile": "BATCH",
                    "displayName": "Dev meeting minutes",
                },
            )
        if path == "/api/v1/ontology":
            return httpx.Response(
                200, json={"classes": [{"systemKey": "Problem"}], "objectProperties": []}
            )
        if path == "/api/v1/nodes":
            return httpx.Response(200, json={"nodes": [], "nextCursor": None})
        raise AssertionError(f"unexpected GET {path}")

    def post(self, path: str, **kwargs) -> httpx.Response:
        self.posts.append((path, kwargs))
        return httpx.Response(201, json={"id": "node-1", "status": "PENDING"})

    def close(self) -> None:
        pass


class StubExtractor:
    def __init__(self, *_args, **_kwargs) -> None:
        pass

    def extract(self, masked_text: str, _channel_name: str):
        from worker_extractor.models import ExtractedNodePayload

        return ExtractedNodePayload(
            typeKey="Problem",
            title="A draft node",
            description="masked",
            attributes={},
        )

    def close(self) -> None:
        pass


@pytest.fixture(autouse=True)
def _stub_clients(monkeypatch: pytest.MonkeyPatch) -> None:
    StubApiClient.instances = []
    monkeypatch.setattr(main_module, "ApiClient", StubApiClient)
    monkeypatch.setattr(main_module, "OllamaExtractor", StubExtractor)


def test_check_mode_validates_a_static_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AGENT_TOKEN", "static-test-token")
    monkeypatch.delenv("AGENT_TOKEN_FILE", raising=False)

    assert main_module.main(["--check"]) == 0


def test_missing_credentials_fail_fast(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in ("AGENT_TOKEN", "AGENT_TOKEN_FILE", "JWT_SECRET"):
        monkeypatch.delenv(name, raising=False)

    assert main_module.main(["--check"]) == 2


def test_once_consumes_a_source_raw_record(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = fakeredis.FakeRedis(decode_responses=True)
    monkeypatch.setattr(
        main_module.redis.Redis,
        "from_url",
        staticmethod(lambda *_args, **_kwargs: fake),
    )
    monkeypatch.setenv("AGENT_TOKEN", "static-test-token")

    fake.xadd(
        "stream:source_raw",
        {
            "sourceId": "dev-minutes-2026",
            "connectorType": "MINUTES",
            "channelName": "meeting-minutes",
            "rawContent": "The shuttle is late every morning.",
        },
    )

    assert main_module.main(["--once"]) == 0

    # The record was handled and acknowledged: nothing stays pending.
    assert fake.xpending("stream:source_raw", "extractor")["pending"] == 0

    api = StubApiClient.instances[-1]
    assert len(api.posts) == 1
    path, kwargs = api.posts[0]
    assert path == "/api/v1/nodes"
    assert kwargs["workspace_id"] == WORKSPACE_ID
