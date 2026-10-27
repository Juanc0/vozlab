"""Entry point of the Relator worker (Agent 2).

The worker consumes `stream:node_created` with its own consumer group
(`relator`), reads the closest nodes through the API (ADR-0022), asks the
local LLM for a verdict and proposes a `PENDING` edge (ADR-0023).

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
from vozlab_worker.metrics import MetricsServer
from vozlab_worker.streams import RedisStreamConsumer
from vozlab_worker.tokens import build_token_provider

from .handler import NodeCreatedHandler
from .llm import OllamaChat
from .settings import RelatorSettings


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="vozlab-worker-relacionador",
        description=(
            "Relator worker: NODE_CREATED -> top-5 neighbours -> LLM verdict -> "
            "PENDING edge proposal."
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
        settings = RelatorSettings()
        token_provider = build_token_provider(settings)
    except (ValidationError, ValueError) as exc:
        print(f"invalid worker configuration: {exc}", file=sys.stderr)
        return 2

    configure_logging(settings.log_level)
    logger = get_logger("vozlab.worker.relator")
    logger.info(
        "relator configuration validated",
        extra={
            "api_base_url": settings.api_base_url,
            "stream": settings.stream_name,
            "consumer_group": settings.consumer_group,
            "consumer": settings.effective_consumer_name,
            "agent_type": settings.agent_type,
            "chat_model": settings.chat_model,
            "neighbors_limit": settings.neighbors_limit,
            "ollama_base_url": settings.ollama_base_url,
        },
    )

    if args.check:
        return 0

    metrics_server = MetricsServer(settings.metrics_port)
    metrics_server.start()
    logger.info("metrics server started", extra={"port": settings.metrics_port})

    redis_client = redis.Redis.from_url(settings.redis_url, decode_responses=True)
    api = ApiClient(
        settings.api_base_url,
        token_provider,
        workspace_id=settings.workspace_id,
        timeout_seconds=settings.api_timeout_seconds,
    )
    chat = OllamaChat(
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
    handler = NodeCreatedHandler(
        api,
        chat,
        neighbors_limit=settings.neighbors_limit,
        edge_dedup_limit=settings.edge_dedup_limit,
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
        chat.close()
        redis_client.close()
        metrics_server.stop()


if __name__ == "__main__":
    raise SystemExit(main())
