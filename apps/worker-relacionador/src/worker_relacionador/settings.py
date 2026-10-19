"""Relator-specific settings layered over the shared worker settings."""

from __future__ import annotations

from pydantic import Field, field_validator

from vozlab_worker.config import AgentType, WorkerSettings


class RelatorSettings(WorkerSettings):
    """Configuration for the Relator (Agent 2).

    The Relator consumes the same `stream:node_created` as the embedder but
    with its own consumer group, so both workers see every event (ADR-0020,
    ADR-0021).
    """

    stream_name: str = "stream:node_created"
    consumer_group: str = "relator"
    agent_type: AgentType = "AGENT_RELACIONADOR"

    ollama_base_url: str = "http://localhost:11434"
    ollama_timeout_seconds: float = Field(default=60.0, gt=0)
    chat_model: str = "llama3.1:8b"
    llm_temperature: float = Field(default=0.0, ge=0, le=2)

    #: Top-N neighbours requested from the API (ADR-0022).
    neighbors_limit: int = Field(default=5, ge=1, le=10)
    #: How many existing edges are inspected to avoid duplicates. There is no
    #: server-side idempotency key, so this is a best-effort guard.
    edge_dedup_limit: int = Field(default=100, ge=1, le=100)

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
