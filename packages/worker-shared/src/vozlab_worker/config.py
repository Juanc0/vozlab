"""Environment-backed configuration shared by every VozLab Python worker."""

from __future__ import annotations

import os
import re
import socket
from dataclasses import dataclass
from pathlib import Path
from typing import Literal
from uuid import UUID

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

AgentType = Literal[
    "AGENT_EXTRACTOR",
    "AGENT_RELACIONADOR",
    "AGENT_CONSOLIDADOR",
    "AGENT_EMBEDDER",
]
AGENT_TYPES: tuple[AgentType, ...] = (
    "AGENT_EXTRACTOR",
    "AGENT_RELACIONADOR",
    "AGENT_CONSOLIDADOR",
    "AGENT_EMBEDDER",
)

_AUTHOR_HASH = re.compile(r"^[0-9a-f]{64}$")


@dataclass(frozen=True, slots=True)
class AgentIdentity:
    """Claims a worker needs to mint an agent JWT (development/test path)."""

    agent_type: AgentType
    tenant_key: str
    user_id: str
    author_hash: str


class WorkerSettings(BaseSettings):
    """Settings common to every worker.

    Process environment always wins. The root `.env` is loaded for local
    development only; production is expected to inject real environment
    variables, and a mounted token file replaces development minting.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- Logging -------------------------------------------------------
    log_level: str = "INFO"

    # --- API -----------------------------------------------------------
    api_base_url: str = "http://localhost:3000"
    api_timeout_seconds: float = Field(default=10.0, gt=0)
    workspace_id: UUID | None = None

    # --- Observability -------------------------------------------------
    metrics_port: int = Field(default=9100, ge=0)

    # --- Redis / streams ----------------------------------------------
    redis_url: str = "redis://localhost:6379/0"
    stream_name: str = "stream:node_created"
    consumer_group: str = "worker"
    consumer_name: str | None = None
    stream_block_ms: int = Field(default=5000, ge=0)
    stream_batch_size: int = Field(default=10, ge=1, le=1000)
    stream_claim_idle_ms: int = Field(default=60_000, ge=0)
    stream_max_attempts: int = Field(default=5, ge=1, le=100)
    dead_letter_stream: str | None = None

    # --- Agent identity / credentials ----------------------------------
    agent_type: AgentType = "AGENT_EXTRACTOR"
    agent_tenant_key: str | None = None
    agent_user_id: str | None = None
    agent_author_hash: str | None = None
    agent_token: SecretStr | None = None
    agent_token_file: Path | None = None
    jwt_secret: SecretStr | None = None
    agent_token_ttl_seconds: int = Field(default=3600, ge=60)
    agent_token_refresh_skew_seconds: int = Field(default=60, ge=0)

    @field_validator("log_level")
    @classmethod
    def _normalise_level(cls, value: str) -> str:
        level = value.upper()
        if level not in {"CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG"}:
            raise ValueError("LOG_LEVEL must be one of CRITICAL/ERROR/WARNING/INFO/DEBUG")
        return level

    @field_validator("api_base_url")
    @classmethod
    def _validate_api_url(cls, value: str) -> str:
        if not value.startswith(("http://", "https://")):
            raise ValueError("API_BASE_URL must start with http:// or https://")
        return value.rstrip("/")

    @field_validator("redis_url")
    @classmethod
    def _validate_redis_url(cls, value: str) -> str:
        if not value.startswith(("redis://", "rediss://", "unix://")):
            raise ValueError("REDIS_URL must be a redis://, rediss:// or unix:// URL")
        return value

    @field_validator("agent_author_hash")
    @classmethod
    def _validate_author_hash(cls, value: str | None) -> str | None:
        if value is not None and not _AUTHOR_HASH.fullmatch(value):
            raise ValueError("AGENT_AUTHOR_HASH must be exactly 64 lowercase hex characters")
        return value

    @property
    def effective_consumer_name(self) -> str:
        return self.consumer_name or (f"{self.consumer_group}-{socket.gethostname()}-{os.getpid()}")

    @property
    def effective_dead_letter_stream(self) -> str:
        return self.dead_letter_stream or f"{self.stream_name}:dead"

    def validate_agent_identity(self) -> AgentIdentity:
        """Return the configured agent identity or fail with a useful message."""
        missing = [
            name
            for name in ("agent_tenant_key", "agent_user_id", "agent_author_hash")
            if not getattr(self, name)
        ]
        if missing:
            variables = ", ".join(name.upper() for name in missing)
            raise ValueError(
                "missing agent identity configuration: "
                f"{variables}; set them or provide AGENT_TOKEN/AGENT_TOKEN_FILE"
            )
        return AgentIdentity(
            agent_type=self.agent_type,
            tenant_key=self.agent_tenant_key,  # type: ignore[arg-type]
            user_id=self.agent_user_id,  # type: ignore[arg-type]
            author_hash=self.agent_author_hash,  # type: ignore[arg-type]
        )

    def validate_credential_source(self) -> None:
        """Ensure at least one supported agent credential source is configured."""
        if self.agent_token or self.agent_token_file or self.jwt_secret:
            return
        raise ValueError(
            "no agent credential source configured: set AGENT_TOKEN, AGENT_TOKEN_FILE or JWT_SECRET"
        )
