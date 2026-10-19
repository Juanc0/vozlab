"""Embedder-specific settings layered over the shared worker settings."""

from __future__ import annotations

from pydantic import Field, field_validator

from vozlab_worker.config import AgentType, WorkerSettings


class EmbedderSettings(WorkerSettings):
    """Configuration for the dedicated `NODE_CREATED` embedding consumer."""

    stream_name: str = "stream:node_created"
    consumer_group: str = "embedder"
    agent_type: AgentType = "AGENT_EMBEDDER"

    ollama_base_url: str = "http://localhost:11434"
    ollama_timeout_seconds: float = Field(default=30.0, gt=0)
    embedding_model: str = "nomic-embed-text"
    embedding_dimensions: int = Field(default=768, ge=1)

    @field_validator("ollama_base_url")
    @classmethod
    def _validate_ollama_url(cls, value: str) -> str:
        if not value.startswith(("http://", "https://")):
            raise ValueError("OLLAMA_BASE_URL must start with http:// or https://")
        return value.rstrip("/")

    @field_validator("embedding_model")
    @classmethod
    def _validate_model(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("EMBEDDING_MODEL must not be empty")
        return value.strip()

    @field_validator("embedding_dimensions")
    @classmethod
    def _validate_dimensions(cls, value: int) -> int:
        if value != 768:
            raise ValueError("Phase 2 embeddings must have exactly 768 dimensions")
        return value
