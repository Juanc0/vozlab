from __future__ import annotations

import pytest
from pydantic import ValidationError

from worker_embedder.settings import EmbedderSettings


def test_embedder_defaults() -> None:
    settings = EmbedderSettings(_env_file=None)

    assert settings.stream_name == "stream:node_created"
    assert settings.consumer_group == "embedder"
    assert settings.agent_type == "AGENT_EMBEDDER"
    assert settings.ollama_base_url == "http://localhost:11434"
    assert settings.embedding_model == "nomic-embed-text"
    assert settings.embedding_dimensions == 768
    assert settings.effective_dead_letter_stream == "stream:node_created:dead"


def test_embedder_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OLLAMA_BASE_URL", "http://ollama:11434/")
    monkeypatch.setenv("EMBEDDING_MODEL", "nomic-embed-text")
    monkeypatch.setenv("EMBEDDING_DIMENSIONS", "768")
    monkeypatch.setenv("CONSUMER_GROUP", "embedder-test")

    settings = EmbedderSettings(_env_file=None)

    assert settings.ollama_base_url == "http://ollama:11434"
    assert settings.consumer_group == "embedder-test"


def test_embedder_rejects_wrong_dimensions(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EMBEDDING_DIMENSIONS", "512")

    with pytest.raises(ValidationError):
        EmbedderSettings(_env_file=None)


def test_embedder_rejects_unknown_agent_type(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AGENT_TYPE", "AGENT_MAGIC")

    with pytest.raises(ValidationError):
        EmbedderSettings(_env_file=None)
