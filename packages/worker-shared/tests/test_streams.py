from __future__ import annotations

import json

import fakeredis
import pytest

from vozlab_worker.streams import PermanentError, RedisStreamConsumer, StreamMessage


def make_consumer(
    redis_client,
    *,
    max_attempts: int = 2,
    dead_letter_stream: str = "stream:test:dead",
) -> RedisStreamConsumer:
    return RedisStreamConsumer(
        redis_client,
        stream="stream:test",
        group="embedder",
        consumer="consumer-1",
        block_ms=1,
        batch_size=10,
        claim_idle_ms=0,
        max_attempts=max_attempts,
        dead_letter_stream=dead_letter_stream,
    )


def test_ensure_group_is_idempotent() -> None:
    redis_client = fakeredis.FakeRedis(decode_responses=True)
    consumer = make_consumer(redis_client)

    consumer.ensure_group()
    consumer.ensure_group()

    groups = redis_client.xinfo_groups("stream:test")
    assert len(groups) == 1
    assert groups[0]["name"] == "embedder"


def test_success_is_acknowledged() -> None:
    redis_client = fakeredis.FakeRedis(decode_responses=True)
    consumer = make_consumer(redis_client)
    consumer.ensure_group()
    redis_client.xadd("stream:test", {"reqId": "cid-1", "nodeId": "node-1"})

    seen: list[StreamMessage] = []
    processed = consumer.run_once(seen.append)

    assert processed == 1
    assert seen[0].fields["nodeId"] == "node-1"
    assert redis_client.xpending("stream:test", "embedder")["pending"] == 0


def test_failure_stays_pending_until_max_attempts_then_dead_letters() -> None:
    redis_client = fakeredis.FakeRedis(decode_responses=True)
    consumer = make_consumer(redis_client, max_attempts=2)
    consumer.ensure_group()
    redis_client.xadd("stream:test", {"reqId": "cid-2", "nodeId": "node-2"})

    calls = 0

    def handler(_message: StreamMessage) -> None:
        nonlocal calls
        calls += 1
        raise RuntimeError("ollama down")

    consumer.run_once(handler)
    assert calls == 1
    assert redis_client.xpending("stream:test", "embedder")["pending"] == 1
    assert redis_client.xlen("stream:test:dead") == 0

    consumer.run_once(handler)
    assert calls == 2
    assert redis_client.xpending("stream:test", "embedder")["pending"] == 0
    assert redis_client.xlen("stream:test:dead") == 1

    dead = redis_client.xrange("stream:test:dead")[0][1]
    assert dead["source_id"]
    assert dead["attempts"] == "2"
    assert "ollama down" in dead["error"]
    payload = json.loads(dead["payload"])
    assert payload["nodeId"] == "node-2"


def test_permanent_error_goes_to_dead_letter_immediately() -> None:
    redis_client = fakeredis.FakeRedis(decode_responses=True)
    consumer = make_consumer(redis_client, max_attempts=5)
    consumer.ensure_group()
    redis_client.xadd("stream:test", {"nodeId": "deleted-node"})

    def handler(_message: StreamMessage) -> None:
        raise PermanentError("node not found")

    consumer.run_once(handler)

    assert redis_client.xpending("stream:test", "embedder")["pending"] == 0
    assert redis_client.xlen("stream:test:dead") == 1


def test_blocking_read_returns_empty_when_no_messages() -> None:
    redis_client = fakeredis.FakeRedis(decode_responses=True)
    consumer = make_consumer(redis_client)
    consumer.ensure_group()

    assert consumer.read() == []


def test_invalid_batch_size_is_rejected() -> None:
    redis_client = fakeredis.FakeRedis(decode_responses=True)

    with pytest.raises(ValueError, match="batch_size"):
        RedisStreamConsumer(
            redis_client,
            stream="stream:test",
            group="embedder",
            consumer="consumer-1",
            batch_size=0,
        )
