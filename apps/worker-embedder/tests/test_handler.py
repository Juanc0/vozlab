from __future__ import annotations

import json

import httpx
import pytest

from vozlab_worker.api import ApiClient, ApiError
from vozlab_worker.retry import RetryPolicy
from vozlab_worker.streams import PermanentError, StreamMessage
from vozlab_worker.tokens import StaticTokenProvider
from worker_embedder.handler import NodeCreatedHandler
from worker_embedder.ollama import OllamaEmbedder

VECTOR = [0.25] * 768
WORKSPACE_ID = "33333333-3333-4333-8333-333333333333"


def make_message(**overrides: str) -> StreamMessage:
    fields = {
        "reqId": "req-1",
        "nodeId": "node-1",
        "workspaceId": WORKSPACE_ID,
        "typeKey": "Problem",
        "title": "A title",
    }
    fields.update(overrides)
    return StreamMessage(id="1-0", fields=fields)


def make_handler(api_handler, ollama_handler=None) -> NodeCreatedHandler:
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
    embedder = OllamaEmbedder(
        "http://ollama.test",
        "nomic-embed-text",
        768,
        transport=httpx.MockTransport(
            ollama_handler or (lambda _request: httpx.Response(200, json={"embeddings": [VECTOR]}))
        ),
    )
    return NodeCreatedHandler(api, embedder, "nomic-embed-text")


def test_happy_path_reads_the_node_and_writes_the_vector() -> None:
    calls: list[httpx.Request] = []

    def api_handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        if request.method == "GET":
            return httpx.Response(
                200,
                json={"node": {"title": "A title", "description": "A description"}},
            )
        return httpx.Response(204)

    handler = make_handler(api_handler)
    handler(make_message())

    assert [call.method for call in calls] == ["GET", "PUT"]
    put = calls[1]
    assert put.url.path == "/api/v1/nodes/node-1/embedding"
    assert put.headers["x-workspace-id"] == WORKSPACE_ID
    assert put.headers["x-correlation-id"] == "req-1"
    assert put.headers["authorization"] == "Bearer token-123"

    body = json.loads(put.content)
    assert body["model"] == "nomic-embed-text"
    assert len(body["embedding"]) == 768


def test_the_embedded_text_contains_title_and_description() -> None:
    prompts: list[str] = []

    def api_handler(request: httpx.Request) -> httpx.Response:
        if request.method == "GET":
            return httpx.Response(
                200,
                json={"node": {"title": "A title", "description": "A description"}},
            )
        return httpx.Response(204)

    def ollama_handler(request: httpx.Request) -> httpx.Response:
        prompts.append(json.loads(request.content)["input"])
        return httpx.Response(200, json={"embeddings": [VECTOR]})

    handler = make_handler(api_handler, ollama_handler)
    handler(make_message())

    assert prompts == ["A title\n\nA description"]


def test_an_event_without_a_node_id_is_permanent() -> None:
    handler = make_handler(lambda _request: httpx.Response(204))

    with pytest.raises(PermanentError):
        handler(make_message(nodeId=""))


def test_a_deleted_node_is_permanent() -> None:
    def api_handler(request: httpx.Request) -> httpx.Response:
        if request.method == "GET":
            return httpx.Response(404, json={"code": "ERR_NODE_NOT_FOUND"})
        return httpx.Response(204)

    handler = make_handler(api_handler)

    with pytest.raises(PermanentError):
        handler(make_message())


def test_a_rejected_vector_is_permanent() -> None:
    def api_handler(request: httpx.Request) -> httpx.Response:
        if request.method == "GET":
            return httpx.Response(200, json={"node": {"title": "A title"}})
        return httpx.Response(422, json={"code": "ERR_VALIDATION_FAILED"})

    handler = make_handler(api_handler)

    with pytest.raises(PermanentError):
        handler(make_message())


def test_wrong_credentials_are_permanent() -> None:
    def api_handler(request: httpx.Request) -> httpx.Response:
        if request.method == "GET":
            return httpx.Response(200, json={"node": {"title": "A title"}})
        return httpx.Response(403, json={"code": "ERR_AUTHORIZATION_FAILED"})

    handler = make_handler(api_handler)

    with pytest.raises(PermanentError):
        handler(make_message())


def test_a_server_error_stays_retryable() -> None:
    def api_handler(request: httpx.Request) -> httpx.Response:
        if request.method == "GET":
            return httpx.Response(200, json={"node": {"title": "A title"}})
        return httpx.Response(503, json={"code": "ERR_SERVICE_UNAVAILABLE"})

    handler = make_handler(api_handler)

    with pytest.raises(ApiError) as raised:
        handler(make_message())

    assert not isinstance(raised.value, PermanentError)
