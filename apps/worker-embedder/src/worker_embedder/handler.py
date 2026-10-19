"""`NODE_CREATED` handler: compute the embedding and write it back.

The handler is the only piece of the embedder that knows the protocol. It is
deliberately free of I/O policy: the shared consumer owns acknowledgement,
retries and the dead-letter stream, and this module only classifies failures
as retryable (default) or permanent.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from vozlab_worker.api import ApiClient, ApiError
from vozlab_worker.logging import get_logger
from vozlab_worker.streams import PermanentError, StreamMessage

from .ollama import OllamaEmbedder, OllamaRequestError

#: API statuses that must not be retried: the node is gone, the payload is
#: wrong, or the worker credentials/agent type are wrong.
_PERMANENT_STATUSES = frozenset({401, 403, 404, 422})


@dataclass(frozen=True, slots=True)
class NodeCreatedEvent:
    """The payload published by the API after a node transaction commits."""

    req_id: str
    node_id: str
    workspace_id: str
    type_key: str
    title: str

    @classmethod
    def from_message(cls, message: StreamMessage) -> NodeCreatedEvent:
        fields = message.fields
        node_id = fields.get("nodeId", "").strip()
        workspace_id = fields.get("workspaceId", "").strip()
        if not node_id or not workspace_id:
            raise PermanentError(
                f"NODE_CREATED event is missing nodeId or workspaceId: {sorted(fields)}"
            )
        return cls(
            req_id=fields.get("reqId", "").strip(),
            node_id=node_id,
            workspace_id=workspace_id,
            type_key=fields.get("typeKey", "").strip(),
            title=fields.get("title", "").strip(),
        )


class NodeCreatedHandler:
    """Embed a node's text and store the vector through the API.

    The worker never touches tenant PostgreSQL: the vector is written with
    `PUT /api/v1/nodes/:id/embedding`, which the API scopes to the tenant and
    the workspace (ADR-0020).
    """

    def __init__(
        self,
        api: ApiClient,
        embedder: OllamaEmbedder,
        model: str,
        *,
        logger: logging.Logger | None = None,
    ) -> None:
        self._api = api
        self._embedder = embedder
        self._model = model
        self._logger = logger or get_logger("vozlab.worker.embedder.handler")

    def __call__(self, message: StreamMessage) -> None:
        event = NodeCreatedEvent.from_message(message)

        text = self._load_text(event)
        vector = self._embed(text, event)
        self._write(event, vector)

    # --- steps ---------------------------------------------------------

    def _load_text(self, event: NodeCreatedEvent) -> str:
        """Read the node through the API and build the text to embed.

        The event only carries the title; the description lives in the tenant
        database, which the worker must not read directly.
        """
        try:
            response = self._api.get(
                f"/api/v1/nodes/{event.node_id}",
                workspace_id=event.workspace_id,
                correlation_id=event.req_id or None,
            )
        except ApiError as exc:
            raise self._classify(exc, f"reading node {event.node_id}") from exc

        node = response.json().get("node") or {}
        title = str(node.get("title") or event.title).strip()
        description = str(node.get("description") or "").strip()

        if not title:
            raise PermanentError(f"node {event.node_id} has no title to embed")

        if description:
            return f"{title}\n\n{description}"
        return title

    def _embed(self, text: str, event: NodeCreatedEvent) -> list[float]:
        try:
            return self._embedder.embed(text)
        except OllamaRequestError as exc:
            # The model rejected the request (e.g. it is not pulled): retrying
            # the same text cannot help.
            raise PermanentError(str(exc)) from exc
        except Exception as exc:  # noqa: BLE001 - OllamaError is retryable
            self._logger.warning(
                "embedding computation failed",
                extra={
                    "node_id": event.node_id,
                    "workspace_id": event.workspace_id,
                    "error": str(exc),
                },
            )
            raise

    def _write(self, event: NodeCreatedEvent, vector: list[float]) -> None:
        try:
            self._api.put(
                f"/api/v1/nodes/{event.node_id}/embedding",
                workspace_id=event.workspace_id,
                correlation_id=event.req_id or None,
                json={"embedding": vector, "model": self._model},
                # The endpoint is an idempotent overwrite, so retrying a
                # throttled (429) or temporarily failing (5xx) call is safe.
                retry=True,
            )
        except ApiError as exc:
            raise self._classify(exc, f"writing embedding for {event.node_id}") from exc

        self._logger.info(
            "embedding stored",
            extra={
                "node_id": event.node_id,
                "workspace_id": event.workspace_id,
                "model": self._model,
                "dimensions": len(vector),
            },
        )

    # --- failure classification ----------------------------------------

    @staticmethod
    def _classify(exc: ApiError, what: str) -> Exception:
        """Map an API failure to a permanent or retryable error."""
        if exc.status_code in _PERMANENT_STATUSES:
            return PermanentError(f"{what} failed permanently: {exc}")
        return exc
