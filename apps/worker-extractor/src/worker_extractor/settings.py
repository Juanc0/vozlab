"""Extractor-specific settings layered over the shared worker settings."""

from __future__ import annotations

from pydantic import Field, field_validator

from vozlab_worker.config import AgentType, WorkerSettings


class ExtractorSettings(WorkerSettings):
    """Configuration for the Extractor (Agent 1).

    The Extractor consumes `stream:source_raw` — the raw records published by
    the ingestion gateway — with its own consumer group, so it never competes
    with the other workers for a message.
    """

    stream_name: str = "stream:source_raw"
    consumer_group: str = "extractor"
    agent_type: AgentType = "AGENT_EXTRACTOR"

    ollama_base_url: str = "http://localhost:11434"
    ollama_timeout_seconds: float = Field(default=60.0, gt=0)
    chat_model: str = "llama3.1:8b"
    llm_temperature: float = Field(default=0.0, ge=0, le=2)

    #: The ontology class used when the model suggests one the workspace does
    #: not have.
    default_type_key: str = "Problem"

    #: How many existing nodes are inspected to avoid duplicates. There is no
    #: server-side idempotency key, so this is a best-effort guard.
    dedup_limit: int = Field(default=100, ge=1, le=100)

    @field_validator("ollama_base_url")
    @classmethod
    def _validate_ollama_url(cls, value: str) -> str:
        if not value.startswith(("http://", "https://")):
            raise ValueError("OLLAMA_BASE_URL must start with http:// or https://")
        return value.rstrip("/")

    @field_validator("chat_model")
    @classmethod
    def _validate_model(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("OLLAMA_CHAT_MODEL must not be empty")
        return value.strip()
