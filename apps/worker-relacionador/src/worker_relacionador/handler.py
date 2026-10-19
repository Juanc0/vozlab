"""`NODE_CREATED` handler for the Relator (Agent 2).

Flow (ADR-0022, ADR-0023):

1. Ask the API for the closest nodes of the workspace
   (`GET /api/v1/nodes/:id/neighbors`). A `409 ERR_NODE_NOT_EMBEDDED` means
   the embedder has not written the vector yet — the entry stays pending and
   is retried.
2. Ask the local LLM for a verdict: `MERGE`, `EDGE` or `INDEPENDENT`.
3. Act:
   - `INDEPENDENT` → nothing to do;
   - `MERGE` → recorded in the log only; there is no merge contract yet;
   - `EDGE` → create a `PENDING` edge through `POST /api/v1/edges`, using a
     relation key taken from the workspace ontology.

The worker never writes to the database and never calls an endpoint outside
the public API.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from vozlab_worker.api import ApiClient, ApiError
from vozlab_worker.logging import get_logger
from vozlab_worker.streams import PermanentError, StreamMessage

from .llm import OllamaChat

#: API statuses that must not be retried.
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
    """Evaluate a new node against its neighbours and propose a relation."""

    def __init__(
        self,
        api: ApiClient,
        chat: OllamaChat,
        *,
        neighbors_limit: int = 5,
        edge_dedup_limit: int = 100,
        logger: logging.Logger | None = None,
    ) -> None:
        self._api = api
        self._chat = chat
        self._neighbors_limit = neighbors_limit
        self._edge_dedup_limit = edge_dedup_limit
        self._logger = logger or get_logger("vozlab.worker.relator.handler")

    def __call__(self, message: StreamMessage) -> None:
        event = NodeCreatedEvent.from_message(message)

        node, neighbors = self._neighbors(event)
        if not neighbors:
            self._logger.info(
                "no candidate neighbours; nothing to evaluate",
                extra={"node_id": event.node_id, "workspace_id": event.workspace_id},
            )
            return

        verdict = self._chat.decide(node, neighbors)
        self._logger.info(
            "llm verdict received",
            extra={
                "node_id": event.node_id,
                "action": verdict.action,
                "target_id": verdict.target_id,
                "reason": verdict.reason,
            },
        )

        if verdict.action == "INDEPENDENT":
            return

        if verdict.action == "MERGE":
            # ADR-0023: a merge has no contract to submit to yet. The verdict
            # is recorded, never applied.
            self._logger.info(
                "merge verdict recorded but not applied (no merge contract yet)",
                extra={
                    "node_id": event.node_id,
                    "target_id": verdict.target_id,
                    "reason": verdict.reason,
                },
            )
            return

        target = next(n for n in neighbors if n["id"] == verdict.target_id)
        relation_key = self._relation_key(event, node, target)
        if not relation_key:
            self._logger.info(
                "no ontology relation matches the node classes; no edge proposed",
                extra={
                    "node_id": event.node_id,
                    "target_id": target["id"],
                    "source_type": node.get("typeKey"),
                    "target_type": target.get("typeKey"),
                },
            )
            return

        if self._edge_exists(event, target["id"], relation_key):
            self._logger.info(
                "edge already exists; nothing to propose",
                extra={
                    "node_id": event.node_id,
                    "target_id": target["id"],
                    "relation_key": relation_key,
                },
            )
            return

        self._create_edge(event, target["id"], relation_key)

    # --- steps ---------------------------------------------------------

    def _neighbors(self, event: NodeCreatedEvent) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        try:
            response = self._api.get(
                f"/api/v1/nodes/{event.node_id}/neighbors",
                params={"limit": self._neighbors_limit},
                workspace_id=event.workspace_id,
                correlation_id=event.req_id or None,
                # A read is safe to retry.
                retry=True,
            )
        except ApiError as exc:
            if exc.status_code == 409:
                # The embedder has not written the vector yet: leave the entry
                # pending so it is retried once the vector exists.
                raise RuntimeError(
                    f"node {event.node_id} has no embedding yet; retrying later"
                ) from exc
            raise self._classify(exc, f"reading neighbours of {event.node_id}") from exc

        payload = response.json()
        node = payload.get("node") or {}
        neighbors = payload.get("neighbors") or []
        return node, neighbors

    def _relation_key(
        self,
        event: NodeCreatedEvent,
        node: dict[str, Any],
        target: dict[str, Any],
    ) -> str | None:
        """Pick the ontology relation that connects the two node classes."""
        try:
            response = self._api.get(
                "/api/v1/ontology",
                workspace_id=event.workspace_id,
                correlation_id=event.req_id or None,
                retry=True,
            )
        except ApiError as exc:
            raise self._classify(exc, "reading the ontology") from exc

        source_type = node.get("typeKey")
        target_type = target.get("typeKey")

        for prop in response.json().get("objectProperties") or []:
            domain = prop.get("domainClassKey")
            range_key = prop.get("rangeClassKey")
            if domain == source_type and range_key == target_type:
                return str(prop.get("systemKey"))
            if prop.get("isSymmetric") and domain == target_type and range_key == source_type:
                return str(prop.get("systemKey"))
        return None

    def _edge_exists(self, event: NodeCreatedEvent, target_id: str, relation_key: str) -> bool:
        """Best-effort duplicate guard (there is no server-side idempotency key)."""
        try:
            response = self._api.get(
                "/api/v1/edges",
                params={"limit": self._edge_dedup_limit},
                workspace_id=event.workspace_id,
                correlation_id=event.req_id or None,
                retry=True,
            )
        except ApiError as exc:
            raise self._classify(exc, "listing edges") from exc

        for edge in response.json().get("edges") or []:
            if (
                edge.get("sourceNodeId") == event.node_id
                and edge.get("targetNodeId") == target_id
                and edge.get("relationKey") == relation_key
            ):
                return True
        return False

    def _create_edge(self, event: NodeCreatedEvent, target_id: str, relation_key: str) -> None:
        try:
            # The edge is created in `PENDING` state: governance applies. The
            # call is NOT retried at the HTTP level (a POST is not idempotent
            # and the API has no idempotency key); a failure leaves the entry
            # pending and the duplicate guard above prevents a second edge.
            self._api.post(
                "/api/v1/edges",
                workspace_id=event.workspace_id,
                correlation_id=event.req_id or None,
                json={
                    "sourceNodeId": event.node_id,
                    "targetNodeId": target_id,
                    "relationKey": relation_key,
                },
            )
        except ApiError as exc:
            raise self._classify(exc, f"creating the edge to {target_id}") from exc

        self._logger.info(
            "edge proposed",
            extra={
                "node_id": event.node_id,
                "target_id": target_id,
                "relation_key": relation_key,
                "workspace_id": event.workspace_id,
            },
        )

    # --- failure classification ----------------------------------------

    @staticmethod
    def _classify(exc: ApiError, what: str) -> Exception:
        """Map an API failure to a permanent or retryable error."""
        if exc.status_code in _PERMANENT_STATUSES:
            return PermanentError(f"{what} failed permanently: {exc}")
        return exc
