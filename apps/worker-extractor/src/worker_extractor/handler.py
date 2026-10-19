"""`source_raw` handler: turn one institutional record into one node.

Flow (docs/spec/extractor.md):

1. Resolve the workspace through the API's source registry
   (`GET /api/v1/ingestion/resolve-source`) — the worker never chooses a
   workspace (ADR-0009, ADR-0025).
2. **Mask the PII locally** (NFR-06). Only the masked text is sent to the
   model; the raw content never leaves the worker.
3. Ask the local LLM for a draft node.
4. Check the suggested `typeKey` against the workspace ontology and fall back
   to the default class when the model invented one.
5. Create the node through `POST /api/v1/nodes`. The node is born `PENDING`
   and the API publishes `NODE_CREATED`, which starts the embedding and
   relationship pipeline.

The worker never writes to the database and never calls an endpoint outside
the public API.
"""

from __future__ import annotations

import logging
from typing import Any

from vozlab_worker.api import ApiClient, ApiError
from vozlab_worker.logging import get_logger
from vozlab_worker.streams import PermanentError, StreamMessage

from .llm import ExtractionError, OllamaExtractor
from .models import ExtractedNodePayload, RawSourceRecord
from .pii import mask_pii

#: API statuses that must not be retried.
_PERMANENT_STATUSES = frozenset({401, 403, 404, 422})


class SourceRawHandler:
    """Ingest one raw record as one node."""

    def __init__(
        self,
        api: ApiClient,
        extractor: OllamaExtractor,
        *,
        default_type_key: str = "Problem",
        dedup_limit: int = 100,
        logger: logging.Logger | None = None,
    ) -> None:
        self._api = api
        self._extractor = extractor
        self._default_type_key = default_type_key
        self._dedup_limit = dedup_limit
        self._logger = logger or get_logger("vozlab.worker.extractor.handler")

    def __call__(self, message: StreamMessage) -> None:
        record = RawSourceRecord.from_message(message)

        # The source is resolved first: an unknown source is a permanent
        # failure, and resolving it is cheap compared to an LLM call.
        source = self._resolve(record.source_id)

        # NFR-06: masking happens locally, before the model sees the text.
        masked = mask_pii(record.raw_content)
        if not masked.strip():
            raise PermanentError("the record has no usable text after masking")

        payload = self._extractor.extract(masked, record.channel_name)
        type_key = self._type_key(payload.type_key, source["workspaceId"])

        if self._node_exists(source["workspaceId"], payload.title):
            self._logger.info(
                "a node with the same title already exists; nothing to create",
                extra={
                    "source_id": record.source_id,
                    "title": payload.title,
                },
            )
            return

        self._create(source["workspaceId"], payload, type_key, record)

    # --- steps ---------------------------------------------------------

    def _resolve(self, source_id: str) -> dict[str, Any]:
        """Resolve the workspace that owns the source."""
        try:
            response = self._api.get(
                "/api/v1/ingestion/resolve-source",
                params={"sourceId": source_id},
                # The resolution route takes no workspace header: the workspace
                # is its answer (ADR-0025).
                workspace_id=None,
                correlation_id=None,
                retry=True,
            )
        except ApiError as exc:
            raise self._classify(exc, f"resolving source {source_id}") from exc

        payload = response.json()
        workspace_id = payload.get("workspaceId")
        if not isinstance(workspace_id, str) or not workspace_id:
            raise PermanentError(
                f"the resolution route answered without a workspace for {source_id}"
            )
        return payload

    def _type_key(self, suggested: str, workspace_id: str) -> str:
        """Keep the model's ontology key only when the workspace has it."""
        classes = self._active_classes(workspace_id)
        if not classes:
            raise PermanentError("the workspace has no ACTIVE ontology class; nothing to create")
        if suggested in classes:
            return suggested
        if self._default_type_key in classes:
            return self._default_type_key
        return sorted(classes)[0]

    def _active_classes(self, workspace_id: str) -> set[str]:
        try:
            response = self._api.get(
                "/api/v1/ontology",
                workspace_id=workspace_id,
                correlation_id=None,
                retry=True,
            )
        except ApiError as exc:
            raise self._classify(exc, "reading the ontology") from exc

        classes = response.json().get("classes") or []
        return {
            str(cls["systemKey"])
            for cls in classes
            if isinstance(cls, dict) and cls.get("systemKey")
        }

    def _node_exists(self, workspace_id: str, title: str) -> bool:
        """Best-effort duplicate guard (the API has no idempotency key)."""
        try:
            response = self._api.get(
                "/api/v1/nodes",
                params={"limit": self._dedup_limit},
                workspace_id=workspace_id,
                correlation_id=None,
                retry=True,
            )
        except ApiError as exc:
            raise self._classify(exc, "listing nodes") from exc

        for node in response.json().get("nodes") or []:
            if isinstance(node, dict) and node.get("title") == title:
                return True
        return False

    def _create(
        self,
        workspace_id: str,
        payload: ExtractedNodePayload,
        type_key: str,
        record: RawSourceRecord,
    ) -> None:
        attributes = dict(payload.attributes)
        attributes.setdefault("source_channel", record.channel_name)

        body = {
            "typeKey": type_key,
            "title": payload.title,
            "description": payload.description,
            "attributes": attributes,
        }

        try:
            # Not retried at the HTTP level: a POST is not idempotent and the
            # API has no idempotency key. A failure leaves the entry pending
            # and the duplicate guard above prevents a second node.
            self._api.post(
                "/api/v1/nodes",
                workspace_id=workspace_id,
                correlation_id=None,
                json=body,
            )
        except ApiError as exc:
            raise self._classify(exc, f"creating the node for {record.source_id}") from exc

        self._logger.info(
            "node created from a source record",
            extra={
                "source_id": record.source_id,
                "connector_type": record.connector_type,
                "type_key": type_key,
                "title": payload.title,
            },
        )

    # --- failure classification ----------------------------------------

    @staticmethod
    def _classify(exc: ApiError, what: str) -> Exception:
        """Map an API failure to a permanent or retryable error."""
        if exc.status_code in _PERMANENT_STATUSES:
            return PermanentError(f"{what} failed permanently: {exc}")
        return exc


__all__ = ["SourceRawHandler", "ExtractionError"]
