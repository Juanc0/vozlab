from __future__ import annotations

import io
import json
import logging

from vozlab_worker.logging import JsonFormatter, bind_correlation_id, get_correlation_id


def test_json_formatter_includes_correlation_and_extra() -> None:
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(JsonFormatter())

    logger = logging.getLogger("vozlab.test.logging")
    logger.handlers = [handler]
    logger.setLevel(logging.INFO)
    logger.propagate = False

    with bind_correlation_id("cid-123"):
        logger.info("message", extra={"attempt": 2, "stream": "stream:test"})

    payload = json.loads(stream.getvalue())
    assert payload["level"] == "INFO"
    assert payload["logger"] == "vozlab.test.logging"
    assert payload["message"] == "message"
    assert payload["correlation_id"] == "cid-123"
    assert payload["attempt"] == 2
    assert payload["stream"] == "stream:test"
    assert payload["ts"].endswith("+00:00")


def test_correlation_context_is_restored() -> None:
    assert get_correlation_id() is None
    with bind_correlation_id("outer"):
        assert get_correlation_id() == "outer"
        with bind_correlation_id("inner"):
            assert get_correlation_id() == "inner"
        assert get_correlation_id() == "outer"
    assert get_correlation_id() is None
