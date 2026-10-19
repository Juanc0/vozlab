from __future__ import annotations

from datetime import UTC, datetime, timedelta

import jwt
import pytest

from vozlab_worker.config import AgentIdentity, WorkerSettings
from vozlab_worker.tokens import (
    DevTokenProvider,
    FileTokenProvider,
    StaticTokenProvider,
    build_token_provider,
    mint_agent_token,
)

SECRET = "x" * 32
IDENTITY = AgentIdentity(
    agent_type="AGENT_EMBEDDER",
    tenant_key="sabana",
    user_id="44444444-4444-4444-8444-444444444447",
    author_hash="a" * 64,
)


def test_mint_agent_token_has_api_claims() -> None:
    now = datetime(2026, 1, 1, tzinfo=UTC)
    token = mint_agent_token(IDENTITY, SECRET, ttl_seconds=60, now=now)

    claims = jwt.decode(
        token,
        SECRET,
        algorithms=["HS256"],
        options={"verify_exp": False},
    )

    assert claims["sub"] == IDENTITY.user_id
    assert claims["tid"] == "sabana"
    assert claims["type"] == "AGENT_EMBEDDER"
    assert claims["authorHash"] == "a" * 64
    assert claims["jti"]
    assert claims["exp"] - claims["iat"] == 60


def test_mint_rejects_short_secret() -> None:
    with pytest.raises(ValueError, match="JWT_SECRET"):
        mint_agent_token(IDENTITY, "short", ttl_seconds=60)


def test_static_provider() -> None:
    assert StaticTokenProvider(" token ").get_token() == "token"
    with pytest.raises(ValueError):
        StaticTokenProvider("   ")


def test_file_provider_rereads_for_rotation(tmp_path) -> None:
    token_file = tmp_path / "token"
    token_file.write_text("first\n", encoding="utf-8")
    provider = FileTokenProvider(token_file)

    assert provider.get_token() == "first"
    token_file.write_text("second\n", encoding="utf-8")
    assert provider.get_token() == "second"


def test_dev_provider_refreshes_before_expiry() -> None:
    class Clock:
        now = datetime(2026, 1, 1, tzinfo=UTC)

        def __call__(self) -> datetime:
            return self.now

    clock = Clock()
    provider = DevTokenProvider(
        IDENTITY,
        SECRET,
        ttl_seconds=100,
        refresh_skew_seconds=10,
        clock=clock,
    )

    first = provider.get_token()
    assert provider.get_token() == first

    clock.now += timedelta(seconds=95)
    refreshed = provider.get_token()
    assert refreshed != first

    claims = jwt.decode(
        refreshed,
        SECRET,
        algorithms=["HS256"],
        options={"verify_exp": False},
    )
    assert claims["type"] == "AGENT_EMBEDDER"


def test_build_token_provider_precedence(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AGENT_TOKEN", "static")
    monkeypatch.setenv("JWT_SECRET", SECRET)
    settings = WorkerSettings(_env_file=None)
    assert isinstance(build_token_provider(settings), StaticTokenProvider)

    monkeypatch.delenv("AGENT_TOKEN")
    monkeypatch.setenv("AGENT_TOKEN_FILE", "/tmp/token")
    settings = WorkerSettings(_env_file=None)
    assert isinstance(build_token_provider(settings), FileTokenProvider)

    monkeypatch.delenv("AGENT_TOKEN_FILE")
    monkeypatch.setenv("AGENT_TENANT_KEY", "sabana")
    monkeypatch.setenv("AGENT_USER_ID", IDENTITY.user_id)
    monkeypatch.setenv("AGENT_AUTHOR_HASH", IDENTITY.author_hash)
    settings = WorkerSettings(_env_file=None)
    assert isinstance(build_token_provider(settings), DevTokenProvider)


def test_build_token_provider_requires_a_source(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in ("AGENT_TOKEN", "AGENT_TOKEN_FILE", "JWT_SECRET"):
        monkeypatch.delenv(name, raising=False)
    settings = WorkerSettings(_env_file=None)

    with pytest.raises(ValueError, match="no agent credential source"):
        build_token_provider(settings)
