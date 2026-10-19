"""Entry point of the Extractor worker (Agent 1).

The worker consumes `stream:source_raw` with its own consumer group
(`extractor`), masks the PII locally, asks the local LLM for a draft node and
creates it through the API. The node is born `PENDING`; the API publishes
`NODE_CREATED`, which starts the embedding and relationship pipeline.

Modes:
  * ``--check``  validate configuration and credentials, then exit.
  * ``--once``   process the current batch (and any stale pending entries)
                 once, then exit.
  * default      run until SIGTERM/SIGINT.
"""

from __future__ import annotations

import argparse
import signal
import sys
import threading
from collections.abc import Sequence

import redis
from pydantic import ValidationError

from vozlab_worker.api import ApiClient
from vozlab_worker.logging import configure_logging, get_logger
from vozlab_worker.streams import RedisStreamConsumer
from vozlab_worker.tokens import build_token_provider

from .handler import SourceRawHandler
from .llm import OllamaExtractor
from .settings import ExtractorSettings


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="vozlab-worker-extractor",
        description=(
            "Extractor worker: stream:source_raw -> PII masking -> LLM draft -> POST /api/v1/nodes."
        ),
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="validate configuration and credentials, then exit 0",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="process the current batch once, then exit",
    )
    args = parser.parse_args(argv)

    try:
        settings = ExtractorSettings()
        token_provider = build_token_provider(settings)
    except (ValidationError, ValueError) as exc:
        print(f"invalid worker configuration: {exc}", file=sys.stderr)
        return 2

    configure_logging(settings.log_level)
    logger = get_logger("vozlab.worker.extractor")
    logger.info(
        "extractor configuration validated",
        extra={
            "api_base_url": settings.api_base_url,
            "stream": settings.stream_name,
            "consumer_group": settings.consumer_group,
            "consumer": settings.effective_consumer_name,
            "agent_type": settings.agent_type,
            "chat_model": settings.chat_model,
            "default_type_key": settings.default_type_key,
            "ollama_base_url": settings.ollama_base_url,
        },
    )

    if args.check:
        return 0

    redis_client = redis.Redis.from_url(settings.redis_url, decode_responses=True)
    api = ApiClient(
        settings.api_base_url,
        token_provider,
        workspace_id=settings.workspace_id,
        timeout_seconds=settings.api_timeout_seconds,
    )
    extractor = OllamaExtractor(
        settings.ollama_base_url,
        settings.chat_model,
        temperature=settings.llm_temperature,
        timeout_seconds=settings.ollama_timeout_seconds,
    )
    consumer = RedisStreamConsumer(
        redis_client,
        stream=settings.stream_name,
        group=settings.consumer_group,
        consumer=settings.effective_consumer_name,
        block_ms=settings.stream_block_ms,
        batch_size=settings.stream_batch_size,
        claim_idle_ms=settings.stream_claim_idle_ms,
        max_attempts=settings.stream_max_attempts,
        dead_letter_stream=settings.effective_dead_letter_stream,
    )
    handler = SourceRawHandler(
        api,
        extractor,
        default_type_key=settings.default_type_key,
        dedup_limit=settings.dedup_limit,
    )

    stop = threading.Event()

    def _request_stop(_signum: int, _frame: object) -> None:
        logger.info("shutdown requested")
        stop.set()

    signal.signal(signal.SIGTERM, _request_stop)
    signal.signal(signal.SIGINT, _request_stop)

    try:
        consumer.ensure_group()
        if args.once:
            processed = consumer.run_once(handler)
            logger.info("single pass finished", extra={"processed": processed})
            return 0
        consumer.run_forever(handler, stop_event=stop)
        return 0
    finally:
        api.close()
        extractor.close()
        redis_client.close()


if __name__ == "__main__":
    raise SystemExit(main())
