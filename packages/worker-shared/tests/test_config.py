from __future__ import annotations

import pytest
from pydantic import ValidationError

from vozlab_worker.config import WorkerSettings


def test_defaults_and_computed_names() -> None:
    settings = WorkerSettings(_env_file=None)

    assert settings.log_level == "INFO"
    assert settings.stream_name == "stream:node_created"
    assert settings.consumer_group == "worker"
    assert settings.effective_consumer_name.startswith("worker-")
    assert settings.effective_dead_letter_stream == "stream:node_created:dead"


def test_environment_overrides(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LOG_LEVEL", "debug")
    monkeypatch.setenv("API_BASE_URL", "http://api.internal:3000/")
    monkeypatch.setenv("REDIS_URL", "redis://redis:6379/2")
    monkeypatch.setenv("STREAM_NAME", "stream:custom")
    monkeypatch.setenv("CONSUMER_GROUP", "embedder")
    monkeypatch.setenv("STREAM_MAX_ATTEMPTS", "9")

    settings = WorkerSettings(_env_file=None)

    assert settings.log_level == "DEBUG"
    assert settings.api_base_url == "http://api.internal:3000"
    assert settings.redis_url == "redis://redis:6379/2"
    assert settings.stream_name == "stream:custom"
    assert settings.consumer_group == "embedder"
    assert settings.stream_max_attempts == 9
    assert settings.effective_dead_letter_stream == "stream:custom:dead"


def test_invalid_author_hash_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AGENT_AUTHOR_HASH", "not-a-hash")

    with pytest.raises(ValidationError):
        WorkerSettings(_env_file=None)


def test_missing_identity_is_reported(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in (
        "AGENT_TENANT_KEY",
        "AGENT_USER_ID",
        "AGENT_AUTHOR_HASH",
        "AGENT_TOKEN",
        "AGENT_TOKEN_FILE",
        "JWT_SECRET",
    ):
        monkeypatch.delenv(name, raising=False)

    settings = WorkerSettings(_env_file=None)

    with pytest.raises(ValueError, match="AGENT_TENANT_KEY"):
        settings.validate_agent_identity()
    with pytest.raises(ValueError, match="no agent credential source"):
        settings.validate_credential_source()


def test_identity_and_static_credential_are_accepted(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AGENT_TENANT_KEY", "sabana")
    monkeypatch.setenv("AGENT_USER_ID", "44444444-4444-4444-8444-444444444447")
    monkeypatch.setenv("AGENT_AUTHOR_HASH", "a" * 64)
    monkeypatch.setenv("AGENT_TOKEN", "static-token")

    settings = WorkerSettings(_env_file=None)

    identity = settings.validate_agent_identity()
    assert identity.tenant_key == "sabana"
    assert identity.author_hash == "a" * 64
    assert settings.validate_credential_source() is None


def test_invalid_agent_type_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AGENT_TYPE", "AGENT_UNKNOWN")

    with pytest.raises(ValidationError):
        WorkerSettings(_env_file=None)


def test_invalid_stream_sizes_are_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("STREAM_BATCH_SIZE", "0")

    with pytest.raises(ValidationError):
        WorkerSettings(_env_file=None)
