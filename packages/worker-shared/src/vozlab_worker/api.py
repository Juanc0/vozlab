"""Synchronous HTTP client for worker-to-API calls."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any
from uuid import UUID, uuid4

import httpx

from .logging import get_correlation_id
from .retry import RetryPolicy, retry_call
from .tokens import TokenProvider


class ApiError(Exception):
    """A non-2xx API response or a transport failure."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        *,
        payload: Any = None,
        correlation_id: str | None = None,
    ) -> None:
        super().__init__(f"{status_code} {code}: {message}")
        self.status_code = status_code
        self.code = code
        self.message = message
        self.payload = payload
        self.correlation_id = correlation_id


class _RetryableApiError(ApiError):
    pass


_RETRYABLE_STATUS = frozenset({429, 500, 502, 503, 504})


class ApiClient:
    """Inject auth/workspace/correlation headers and map API errors."""

    def __init__(
        self,
        base_url: str,
        token_provider: TokenProvider,
        *,
        workspace_id: UUID | str | None = None,
        timeout_seconds: float = 10.0,
        transport: httpx.BaseTransport | None = None,
        retry_policy: RetryPolicy | None = None,
        user_agent: str = "vozlab-worker/0.1",
    ) -> None:
        self._client = httpx.Client(
            base_url=base_url.rstrip("/"),
            timeout=timeout_seconds,
            transport=transport,
        )
        self._token_provider = token_provider
        self._workspace_id = str(workspace_id) if workspace_id is not None else None
        self._retry_policy = retry_policy or RetryPolicy()
        self._user_agent = user_agent

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> ApiClient:
        return self

    def __exit__(self, *args: object) -> None:
        self.close()

    def get(self, path: str, **kwargs: Any) -> httpx.Response:
        return self.request("GET", path, **kwargs)

    def post(self, path: str, **kwargs: Any) -> httpx.Response:
        return self.request("POST", path, **kwargs)

    def put(self, path: str, **kwargs: Any) -> httpx.Response:
        return self.request("PUT", path, **kwargs)

    def request(
        self,
        method: str,
        path: str,
        *,
        workspace_id: UUID | str | None = None,
        correlation_id: str | None = None,
        json: Any = None,
        params: Mapping[str, Any] | None = None,
        headers: Mapping[str, str] | None = None,
        retry: bool = False,
    ) -> httpx.Response:
        """Perform a request.

        `retry=True` is opt-in and should only be used for idempotent calls or
        endpoints with a server-side idempotency guarantee.
        """

        def send() -> httpx.Response:
            resolved_correlation_id = correlation_id or get_correlation_id() or str(uuid4())
            request_headers: dict[str, str] = {
                "accept": "application/json",
                "user-agent": self._user_agent,
                "x-correlation-id": resolved_correlation_id,
            }
            if headers:
                request_headers.update(headers)
            request_headers["Authorization"] = f"Bearer {self._token_provider.get_token()}"

            resolved_workspace = (
                str(workspace_id) if workspace_id is not None else self._workspace_id
            )
            if resolved_workspace:
                request_headers["X-Workspace-ID"] = resolved_workspace

            try:
                response = self._client.request(
                    method,
                    path,
                    json=json,
                    params=params,
                    headers=request_headers,
                )
            except httpx.TransportError as exc:
                error = ApiError(
                    0,
                    "ERR_TRANSPORT",
                    str(exc),
                    correlation_id=resolved_correlation_id,
                )
                if retry:
                    raise _RetryableApiError(
                        error.status_code,
                        error.code,
                        error.message,
                        correlation_id=error.correlation_id,
                    ) from exc
                raise error from exc

            if response.is_success:
                return response

            error = self._to_api_error(response, resolved_correlation_id)
            if retry and response.status_code in _RETRYABLE_STATUS:
                raise _RetryableApiError(
                    error.status_code,
                    error.code,
                    error.message,
                    payload=error.payload,
                    correlation_id=error.correlation_id,
                )
            raise error

        if retry:
            return retry_call(
                send,
                policy=self._retry_policy,
                retry_on=(_RetryableApiError,),
            )
        return send()

    @staticmethod
    def _to_api_error(response: httpx.Response, correlation_id: str) -> ApiError:
        payload: Any = None
        try:
            payload = response.json()
        except ValueError:
            payload = None

        code = f"HTTP_{response.status_code}"
        message = response.reason_phrase or "API request failed"
        if isinstance(payload, dict):
            if isinstance(payload.get("code"), str):
                code = payload["code"]
            if isinstance(payload.get("message"), str):
                message = payload["message"]
        elif response.text:
            message = response.text[:500]

        return ApiError(
            response.status_code,
            code,
            message,
            payload=payload,
            correlation_id=correlation_id,
        )
