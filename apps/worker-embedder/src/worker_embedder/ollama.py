"""Ollama embedding client used by the embedder worker.

Only the embedding surface of the local Ollama API is used. Two endpoints are
supported because the API changed over time:

* ``POST /api/embed``        -> ``{"embeddings": [[...]]}``  (current)
* ``POST /api/embeddings``   -> ``{"embedding": [...]}``     (legacy)

The worker talks to a local model over plain HTTP; nothing here reaches the
public internet.
"""

from __future__ import annotations

import math
from typing import Any

import httpx


class OllamaError(RuntimeError):
    """A failure that may succeed later (transport, 5xx, malformed vector).

    The consumer treats it as retryable: the stream entry stays pending and is
    recovered with ``XAUTOCLAIM`` (ADR-0020, ADR-0021).
    """


class OllamaRequestError(OllamaError):
    """A rejected request (4xx): retrying with the same input cannot help."""


class OllamaEmbedder:
    """Turn text into a 768-dimensional vector with a local Ollama model."""

    def __init__(
        self,
        base_url: str,
        model: str,
        dimensions: int,
        *,
        timeout_seconds: float = 30.0,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._client = httpx.Client(
            base_url=base_url.rstrip("/"),
            timeout=timeout_seconds,
            transport=transport,
        )
        self._model = model
        self._dimensions = dimensions

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> OllamaEmbedder:
        return self

    def __exit__(self, *args: object) -> None:
        self.close()

    def embed(self, text: str) -> list[float]:
        """Return the embedding of `text` or raise `OllamaError`."""
        vector = self._embed_current(text)
        self._validate(vector)
        return vector

    # --- internals ----------------------------------------------------

    def _embed_current(self, text: str) -> list[float]:
        response = self._post(
            "/api/embed",
            {"model": self._model, "input": text},
        )
        if response.status_code == 404:
            # Older Ollama builds only expose the singular endpoint.
            return self._embed_legacy(text)

        if response.status_code >= 500:
            raise OllamaError(f"ollama returned {response.status_code}: {response.text[:200]}")
        if response.status_code >= 400:
            raise OllamaRequestError(
                f"ollama rejected the request ({response.status_code}): {response.text[:200]}"
            )

        payload = self._json(response)
        embeddings = payload.get("embeddings")
        if not isinstance(embeddings, list) or not embeddings:
            raise OllamaError("ollama response has no embeddings")
        first = embeddings[0]
        if not isinstance(first, list):
            raise OllamaError("ollama response embedding is not a list")
        return [float(value) for value in first]

    def _embed_legacy(self, text: str) -> list[float]:
        response = self._post(
            "/api/embeddings",
            {"model": self._model, "prompt": text},
        )
        if response.status_code >= 500:
            raise OllamaError(f"ollama returned {response.status_code}: {response.text[:200]}")
        if response.status_code >= 400:
            raise OllamaRequestError(
                f"ollama rejected the request ({response.status_code}): {response.text[:200]}"
            )

        payload = self._json(response)
        vector = payload.get("embedding")
        if not isinstance(vector, list):
            raise OllamaError("ollama response has no embedding")
        return [float(value) for value in vector]

    def _post(self, path: str, body: dict[str, Any]) -> httpx.Response:
        try:
            return self._client.post(path, json=body)
        except httpx.TransportError as exc:
            raise OllamaError(f"ollama is unreachable: {exc}") from exc

    @staticmethod
    def _json(response: httpx.Response) -> dict[str, Any]:
        try:
            payload = response.json()
        except ValueError as exc:
            raise OllamaError("ollama returned a non-JSON response") from exc
        if not isinstance(payload, dict):
            raise OllamaError("ollama returned an unexpected payload")
        return payload

    def _validate(self, vector: list[float]) -> None:
        if len(vector) != self._dimensions:
            raise OllamaError(
                f"ollama returned {len(vector)} dimensions, expected {self._dimensions}"
            )
        if not all(math.isfinite(value) for value in vector):
            raise OllamaError("ollama returned non-finite values")
