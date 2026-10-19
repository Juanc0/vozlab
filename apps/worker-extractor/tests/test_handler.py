from __future__ import annotations

import json

import httpx
import pytest

from vozlab_worker.api import ApiClient, ApiError
from vozlab_worker.retry import RetryPolicy
from vozlab_worker.streams import PermanentError, StreamMessage
from vozlab_worker.tokens import StaticTokenProvider
from worker_extractor.handler import SourceRawHandler
from worker_extractor.models import ExtractedNodePayload

WORKSPACE_ID = "33333333-3333-4333-8333-333333333333"


def make_message(**overrides: str) -> StreamMessage:
    fields = {
        "sourceId": "dev-minutes-2026",
        "connectorType": "MINUTES",
        "channelName": "meeting-minutes",
        "rawContent": "Ana Torres reported that the shuttle is late.",
    }
    fields.update(overrides)
    return StreamMessage(id="1-0", fields=fields)


class StubExtractor:
    def __init__(self, payload: ExtractedNodePayload | None = None) -> None:
        self.payload = payload or ExtractedNodePayload(
            typeKey="Problem",
            title="The shuttle is late",
            description="The inter-campus shuttle is late.",
            attributes={},
        )
        self.received: list[str] = []

    def extract(self, masked_text: str, _channel_name: str) -> ExtractedNodePayload:
        self.received.append(masked_text)
        return self.payload


def make_handler(
    *,
    extractor: StubExtractor | None = None,
    resolve_status: int = 200,
    classes: list[str] | None = None,
    nodes: list[dict] | None = None,
    create_status: int = 201,
) -> tuple[SourceRawHandler, StubExtractor, list[httpx.Request]]:
    requests: list[httpx.Request] = []

    def api_handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        path = request.url.path
        if path == "/api/v1/ingestion/resolve-source":
            if resolve_status != 200:
                return httpx.Response(resolve_status, json={"code": "ERR_DATA_SOURCE_NOT_FOUND"})
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
            keys = classes if classes is not None else ["Problem", "Idea"]
            return httpx.Response(
                200,
                json={
                    "classes": [{"systemKey": key} for key in keys],
                    "objectProperties": [],
                },
            )
        if path == "/api/v1/nodes" and request.method == "GET":
            return httpx.Response(200, json={"nodes": nodes or [], "nextCursor": None})
        if path == "/api/v1/nodes" and request.method == "POST":
            if create_status != 201:
                return httpx.Response(create_status, json={"code": "ERR_VALIDATION_FAILED"})
            return httpx.Response(201, json={"id": "node-1", "status": "PENDING"})
        raise AssertionError(f"unexpected request: {request.method} {path}")

    api = ApiClient(
        "http://api.test",
        StaticTokenProvider("token-123"),
        transport=httpx.MockTransport(api_handler),
        retry_policy=RetryPolicy(
            attempts=2,
            base_delay_seconds=0,
            max_delay_seconds=0,
            jitter_seconds=0,
        ),
    )
    stub = extractor or StubExtractor()
    handler = SourceRawHandler(api, stub)  # type: ignore[arg-type]
    return handler, stub, requests


def test_a_record_becomes_a_node() -> None:
    handler, _stub, requests = make_handler()

    handler(make_message())

    posts = [r for r in requests if r.method == "POST"]
    assert len(posts) == 1
    body = json.loads(posts[0].content)
    assert body["typeKey"] == "Problem"
    assert body["title"] == "The shuttle is late"
    assert body["description"] == "The inter-campus shuttle is late."
    assert body["attributes"]["source_channel"] == "meeting-minutes"
    assert posts[0].headers["x-workspace-id"] == WORKSPACE_ID


def test_the_pii_is_masked_before_the_model_sees_the_text() -> None:
    handler, stub, _requests = make_handler()

    handler(make_message(rawContent="Ana Torres (ana.torres@example.edu) reported the delay."))

    assert "ana.torres@example.edu" not in stub.received[0]
    assert "[MASKED]" in stub.received[0]


def test_an_unknown_source_is_permanent() -> None:
    handler, _stub, _requests = make_handler(resolve_status=404)

    with pytest.raises(PermanentError):
        handler(make_message())


def test_a_server_error_while_resolving_stays_retryable() -> None:
    handler, _stub, _requests = make_handler(resolve_status=503)

    with pytest.raises(ApiError) as raised:
        handler(make_message())

    assert not isinstance(raised.value, PermanentError)


def test_an_invented_type_key_falls_back_to_the_default() -> None:
    extractor = StubExtractor(
        ExtractedNodePayload(
            typeKey="Invented",
            title="A title",
            description="",
            attributes={},
        )
    )
    handler, _stub, requests = make_handler(extractor=extractor)

    handler(make_message())

    body = json.loads([r for r in requests if r.method == "POST"][0].content)
    assert body["typeKey"] == "Problem"


def test_a_known_type_key_is_kept() -> None:
    extractor = StubExtractor(
        ExtractedNodePayload(
            typeKey="Idea",
            title="A title",
            description="",
            attributes={},
        )
    )
    handler, _stub, requests = make_handler(extractor=extractor)

    handler(make_message())

    body = json.loads([r for r in requests if r.method == "POST"][0].content)
    assert body["typeKey"] == "Idea"


def test_an_existing_title_is_not_duplicated() -> None:
    handler, _stub, requests = make_handler(
        nodes=[{"id": "node-0", "title": "The shuttle is late"}]
    )

    handler(make_message())

    assert [r for r in requests if r.method == "POST"] == []


def test_a_rejected_node_is_permanent() -> None:
    handler, _stub, _requests = make_handler(create_status=422)

    with pytest.raises(PermanentError):
        handler(make_message())


def test_a_record_without_content_is_permanent() -> None:
    handler, _stub, _requests = make_handler()

    with pytest.raises(PermanentError):
        handler(make_message(rawContent="   "))
