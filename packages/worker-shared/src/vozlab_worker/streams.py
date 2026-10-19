"""Redis Streams consumer group runtime with PEL recovery and a DLQ."""

from __future__ import annotations

import json
import logging
import threading
from collections.abc import Callable, Mapping
from dataclasses import dataclass

from redis import Redis
from redis.exceptions import ResponseError

from .logging import bind_correlation_id, get_logger


class PermanentError(Exception):
    """A handler failure that must not be retried (e.g. 404 or validation)."""


@dataclass(frozen=True, slots=True)
class StreamMessage:
    id: str
    fields: dict[str, str]


StreamHandler = Callable[[StreamMessage], None]


class RedisStreamConsumer:
    """At-least-once consumer with XAUTOCLAIM recovery and a dead-letter stream."""

    def __init__(
        self,
        redis_client: Redis,
        *,
        stream: str,
        group: str,
        consumer: str,
        block_ms: int = 5000,
        batch_size: int = 10,
        claim_idle_ms: int = 60_000,
        max_attempts: int = 5,
        dead_letter_stream: str | None = None,
        logger: logging.Logger | None = None,
    ) -> None:
        if batch_size < 1:
            raise ValueError("batch_size must be >= 1")
        if max_attempts < 1:
            raise ValueError("max_attempts must be >= 1")

        self._redis = redis_client
        self._stream = stream
        self._group = group
        self._consumer = consumer
        self._block_ms = block_ms
        self._batch_size = batch_size
        self._claim_idle_ms = claim_idle_ms
        self._max_attempts = max_attempts
        self._dead_letter_stream = dead_letter_stream or f"{stream}:dead"
        self._logger = logger or get_logger("vozlab.worker.streams")

    def ensure_group(self) -> None:
        try:
            self._redis.xgroup_create(
                self._stream,
                self._group,
                id="0",
                mkstream=True,
            )
            self._logger.info(
                "created consumer group",
                extra={
                    "stream": self._stream,
                    "consumer_group": self._group,
                },
            )
        except ResponseError as exc:
            if "BUSYGROUP" not in str(exc):
                raise

    def read(self) -> list[StreamMessage]:
        response = self._redis.xreadgroup(
            self._group,
            self._consumer,
            {self._stream: ">"},
            count=self._batch_size,
            block=self._block_ms,
        )
        if not response:
            return []

        messages: list[StreamMessage] = []
        for _stream_name, entries in response:
            for entry in entries:
                message_id, fields = entry
                messages.append(
                    StreamMessage(
                        id=str(message_id),
                        fields={str(k): str(v) for k, v in fields.items()},
                    )
                )
        return messages

    def claim_stale(self) -> list[StreamMessage]:
        result = self._redis.xautoclaim(
            self._stream,
            self._group,
            self._consumer,
            self._claim_idle_ms,
            start_id="0-0",
            count=self._batch_size,
        )

        if isinstance(result, (tuple, list)) and len(result) >= 2 and isinstance(result[0], str):
            # redis-py and fakeredis return (next_start_id, messages, deleted).
            entries = result[1]
        else:  # Compatibility with an older shape that returns messages directly.
            entries = result

        messages: list[StreamMessage] = []
        for entry in entries or []:
            message_id, fields = entry
            messages.append(
                StreamMessage(
                    id=str(message_id),
                    fields={str(k): str(v) for k, v in fields.items()},
                )
            )
        return messages

    def run_once(self, handler: StreamHandler) -> int:
        """Claim stale entries, then read new ones; return handled count."""
        processed = 0
        for message in self.claim_stale():
            self._handle(message, handler)
            processed += 1
        for message in self.read():
            self._handle(message, handler)
            processed += 1
        return processed

    def run_forever(
        self,
        handler: StreamHandler,
        *,
        stop_event: threading.Event | None = None,
    ) -> None:
        self._logger.info(
            "consumer starting",
            extra={
                "stream": self._stream,
                "consumer_group": self._group,
                "consumer": self._consumer,
            },
        )
        while stop_event is None or not stop_event.is_set():
            self.run_once(handler)

    def _handle(self, message: StreamMessage, handler: StreamHandler) -> None:
        correlation_id = message.fields.get("reqId") or message.id
        with bind_correlation_id(correlation_id):
            try:
                handler(message)
            except PermanentError as exc:
                self._logger.error(
                    "permanent handler failure; moving message to dead-letter",
                    extra=self._log_fields(message, exc),
                )
                self._dead_letter(message, exc, self._delivery_count(message.id))
            except Exception as exc:  # noqa: BLE001 - retry policy is below
                attempts = self._delivery_count(message.id)
                if attempts >= self._max_attempts:
                    self._logger.error(
                        "handler failed after max attempts; moving message to dead-letter",
                        extra=self._log_fields(message, exc, attempts=attempts),
                    )
                    self._dead_letter(message, exc, attempts)
                else:
                    self._logger.warning(
                        "handler failed; leaving message pending for XAUTOCLAIM",
                        extra=self._log_fields(message, exc, attempts=attempts),
                    )
            else:
                self._ack(message.id)
                self._logger.info(
                    "message acknowledged",
                    extra={
                        "stream": self._stream,
                        "message_id": message.id,
                        "consumer_group": self._group,
                    },
                )

    def _delivery_count(self, message_id: str) -> int:
        pending = self._redis.xpending_range(
            self._stream,
            self._group,
            message_id,
            message_id,
            1,
        )
        if not pending:
            return 1
        entry = pending[0]
        if isinstance(entry, Mapping):
            for key in ("delivery_count", "times_delivered"):
                if key in entry:
                    return int(entry[key])
            return 1
        # Older redis-py returns (message_id, consumer, idle, delivery_count).
        return int(entry[3])

    def _dead_letter(
        self,
        message: StreamMessage,
        error: BaseException,
        attempts: int,
    ) -> None:
        fields = {
            "source_stream": self._stream,
            "source_id": message.id,
            "consumer_group": self._group,
            "consumer": self._consumer,
            "attempts": str(attempts),
            "error": f"{type(error).__name__}: {error}",
            "payload": json.dumps(message.fields, ensure_ascii=False),
        }
        try:
            self._redis.xadd(self._dead_letter_stream, fields)
        except Exception:  # noqa: BLE001 - keep the original entry pending
            self._logger.exception(
                "failed to write dead-letter entry; message remains pending",
                extra={
                    "stream": self._stream,
                    "message_id": message.id,
                    "dead_letter_stream": self._dead_letter_stream,
                },
            )
            return

        self._ack(message.id)

    def _ack(self, message_id: str) -> None:
        self._redis.xack(self._stream, self._group, message_id)

    def _log_fields(
        self,
        message: StreamMessage,
        error: BaseException,
        *,
        attempts: int | None = None,
    ) -> dict[str, object]:
        fields: dict[str, object] = {
            "stream": self._stream,
            "message_id": message.id,
            "consumer_group": self._group,
            "consumer": self._consumer,
            "error": f"{type(error).__name__}: {error}",
        }
        if attempts is not None:
            fields["attempts"] = attempts
        return fields
