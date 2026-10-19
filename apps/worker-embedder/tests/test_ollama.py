from __future__ import annotations

import json

import httpx
import pytest

from worker_embedder.ollama import OllamaEmbedder, OllamaError, OllamaRequestError

VECTOR = [0.125] * 768


def make_embedder(handler) -> OllamaEmbedder:
    return OllamaEmbedder(
        "http://ollama.test",
        "nomic-embed-text",
        768,
        transport=httpx.MockTransport(handler),
    )


def test_embed_uses_the_current_endpoint() -> None:
    seen: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["path"] = request.url.path
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"embeddings": [VECTOR]})

    embedder = make_embedder(handler)

    assert embedder.embed("hello") == VECTOR
    assert seen["path"] == "/api/embed"
    assert seen["body"] == {"model": "nomic-embed-text", "input": "hello"}


def test_embed_falls_back_to_the_legacy_endpoint() -> None:
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.url.path)
        if request.url.path == "/api/embed":
            return httpx.Response(404, json={"error": "not found"})
        return httpx.Response(200, json={"embedding": VECTOR})

    embedder = make_embedder(handler)

    assert embedder.embed("hello") == VECTOR
    assert calls == ["/api/embed", "/api/embeddings"]


def test_wrong_dimension_count_is_retryable() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"embeddings": [[0.1] * 512]})

    embedder = make_embedder(handler)

    with pytest.raises(OllamaError, match="dimensions"):
        embedder.embed("hello")


def test_server_error_is_retryable() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, text="model loading")

    embedder = make_embedder(handler)

    with pytest.raises(OllamaError):
        embedder.embed("hello")


def test_rejected_request_is_permanent() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, text="model not found")

    embedder = make_embedder(handler)

    with pytest.raises(OllamaRequestError):
        embedder.embed("hello")


def test_transport_error_is_retryable() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused")

    embedder = make_embedder(handler)

    with pytest.raises(OllamaError):
        embedder.embed("hello")


def test_non_json_response_is_retryable() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="not json")

    embedder = make_embedder(handler)

    with pytest.raises(OllamaError):
        embedder.embed("hello")
