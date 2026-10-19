from __future__ import annotations

from uuid import UUID

import httpx
import pytest

from vozlab_worker.api import ApiClient, ApiError
from vozlab_worker.logging import bind_correlation_id
from vozlab_worker.retry import RetryPolicy
from vozlab_worker.tokens import StaticTokenProvider

WORKSPACE_ID = UUID("33333333-3333-4333-8333-333333333333")


def make_client(handler, *, retry: bool = False) -> ApiClient:
    return ApiClient(
        "http://api.test",
        StaticTokenProvider("token-123"),
        workspace_id=WORKSPACE_ID,
        transport=httpx.MockTransport(handler),
        retry_policy=RetryPolicy(
            attempts=2,
            base_delay_seconds=0,
            max_delay_seconds=0,
            jitter_seconds=0,
        ),
    )


def test_injects_auth_workspace_and_correlation_headers() -> None:
    seen: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen.update(dict(request.headers))
        return httpx.Response(200, json={"ok": True})

    client = make_client(handler)
    with bind_correlation_id("cid-42"):
        response = client.get("/api/v1/nodes")

    assert response.status_code == 200
    assert seen["authorization"] == "Bearer token-123"
    assert seen["x-workspace-id"] == str(WORKSPACE_ID)
    assert seen["x-correlation-id"] == "cid-42"
    client.close()


def test_explicit_correlation_id_wins() -> None:
    seen: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen.update(dict(request.headers))
        return httpx.Response(204)

    client = make_client(handler)
    response = client.put(
        "/api/v1/nodes/1/embedding",
        correlation_id="from-event",
        json={"embedding": []},
    )

    assert response.status_code == 204
    assert seen["x-correlation-id"] == "from-event"
    client.close()


def test_api_error_maps_code_and_does_not_retry() -> None:
    calls = 0

    def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(
            422,
            json={"code": "ERR_VALIDATION_FAILED", "message": "bad vector"},
        )

    client = make_client(handler)
    with pytest.raises(ApiError) as raised:
        client.put("/api/v1/nodes/1/embedding", json={})

    assert raised.value.status_code == 422
    assert raised.value.code == "ERR_VALIDATION_FAILED"
    assert raised.value.message == "bad vector"
    assert calls == 1
    client.close()


def test_retry_is_opt_in_and_retries_5xx() -> None:
    calls = 0

    def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            return httpx.Response(503, json={"code": "ERR_DATABASE_CONNECTION_FAILED"})
        return httpx.Response(200, json={"ok": True})

    client = make_client(handler)
    response = client.get("/health/ready", retry=True)
    assert response.status_code == 200
    assert calls == 2

    client.close()


def test_transport_error_is_typed() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused")

    client = make_client(handler)
    with pytest.raises(ApiError) as raised:
        client.get("/api/v1/nodes")

    assert raised.value.code == "ERR_TRANSPORT"
    assert raised.value.status_code == 0
    client.close()
