"""Scaffold entrypoint for the dedicated embedding worker."""

from __future__ import annotations

import argparse
import sys
from collections.abc import Sequence

from pydantic import ValidationError

from vozlab_worker.logging import configure_logging, get_logger
from vozlab_worker.tokens import build_token_provider

from .settings import EmbedderSettings


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="vozlab-worker-embedder",
        description=(
            "Dedicated NODE_CREATED embedding worker. "
            "Milestone 2.1 provides configuration/runtime scaffolding; "
            "the Ollama handler is implemented in milestone 2.4."
        ),
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="validate configuration and credentials, then exit 0",
    )
    args = parser.parse_args(argv)

    try:
        settings = EmbedderSettings()
        build_token_provider(settings)
    except (ValidationError, ValueError) as exc:
        print(f"invalid worker configuration: {exc}", file=sys.stderr)
        return 2

    configure_logging(settings.log_level)
    logger = get_logger("vozlab.worker.embedder")
    logger.info(
        "embedder configuration validated",
        extra={
            "api_base_url": settings.api_base_url,
            "stream": settings.stream_name,
            "consumer_group": settings.consumer_group,
            "consumer": settings.effective_consumer_name,
            "agent_type": settings.agent_type,
            "embedding_model": settings.embedding_model,
            "embedding_dimensions": settings.embedding_dimensions,
            "ollama_base_url": settings.ollama_base_url,
        },
    )

    if args.check:
        return 0

    logger.error(
        "embedding handler is not implemented; this scaffold only validates "
        "configuration (milestone 2.4)"
    )
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
