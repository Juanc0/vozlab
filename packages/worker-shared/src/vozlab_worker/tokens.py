"""Agent JWT providers used by the Python workers."""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Protocol
from uuid import uuid4

import jwt

from .config import AgentIdentity, WorkerSettings

_MIN_SECRET_LENGTH = 32


def mint_agent_token(
    identity: AgentIdentity,
    secret: str,
    *,
    ttl_seconds: int,
    now: datetime | None = None,
) -> str:
    """Mint the same HS256 agent token shape the API's AuthGuard expects."""
    if len(secret) < _MIN_SECRET_LENGTH:
        raise ValueError(f"JWT_SECRET must be at least {_MIN_SECRET_LENGTH} characters")
    if ttl_seconds <= 0:
        raise ValueError("agent token TTL must be positive")

    issued_at = now or datetime.now(tz=UTC)
    if issued_at.tzinfo is None:
        issued_at = issued_at.replace(tzinfo=UTC)

    claims = {
        "sub": identity.user_id,
        "tid": identity.tenant_key,
        "jti": str(uuid4()),
        "authorHash": identity.author_hash,
        "type": identity.agent_type,
        "iat": int(issued_at.timestamp()),
        "exp": int((issued_at + timedelta(seconds=ttl_seconds)).timestamp()),
    }
    return jwt.encode(claims, secret, algorithm="HS256")


class TokenProvider(Protocol):
    def get_token(self) -> str: ...


class StaticTokenProvider:
    """Use a token injected by the orchestrator."""

    def __init__(self, token: str) -> None:
        value = token.strip()
        if not value:
            raise ValueError("AGENT_TOKEN is empty")
        self._token = value

    def get_token(self) -> str:
        return self._token


class FileTokenProvider:
    """Re-read a mounted token on every call so rotation needs no restart."""

    def __init__(self, path: Path | str) -> None:
        self._path = Path(path)

    def get_token(self) -> str:
        try:
            token = self._path.read_text(encoding="utf-8").strip()
        except OSError as exc:
            raise ValueError(f"cannot read AGENT_TOKEN_FILE {self._path}: {exc}") from exc
        if not token:
            raise ValueError(f"AGENT_TOKEN_FILE {self._path} is empty")
        return token


class DevTokenProvider:
    """Mint and refresh short-lived tokens with the development secret.

    This mirrors `db:mint-token` and is only appropriate for local development
    and tests. Production deployments should mount a token file or inject a
    token through the orchestrator.
    """

    def __init__(
        self,
        identity: AgentIdentity,
        secret: str,
        *,
        ttl_seconds: int = 3600,
        refresh_skew_seconds: int = 60,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        if refresh_skew_seconds < 0 or refresh_skew_seconds >= ttl_seconds:
            raise ValueError("refresh skew must be >= 0 and smaller than the TTL")
        self._identity = identity
        self._secret = secret
        self._ttl_seconds = ttl_seconds
        self._refresh_skew = timedelta(seconds=refresh_skew_seconds)
        self._clock = clock or (lambda: datetime.now(tz=UTC))
        self._token: str | None = None
        self._expires_at: datetime | None = None

    def get_token(self) -> str:
        now = self._clock()
        if (
            self._token is None
            or self._expires_at is None
            or now >= self._expires_at - self._refresh_skew
        ):
            self._token = mint_agent_token(
                self._identity,
                self._secret,
                ttl_seconds=self._ttl_seconds,
                now=now,
            )
            self._expires_at = now + timedelta(seconds=self._ttl_seconds)
        return self._token

    def invalidate(self) -> None:
        self._token = None
        self._expires_at = None


def build_token_provider(settings: WorkerSettings) -> TokenProvider:
    """Select the highest-precedence credential source from settings."""
    settings.validate_credential_source()

    if settings.agent_token is not None:
        return StaticTokenProvider(settings.agent_token.get_secret_value())
    if settings.agent_token_file is not None:
        return FileTokenProvider(settings.agent_token_file)
    if settings.jwt_secret is not None:
        return DevTokenProvider(
            settings.validate_agent_identity(),
            settings.jwt_secret.get_secret_value(),
            ttl_seconds=settings.agent_token_ttl_seconds,
            refresh_skew_seconds=settings.agent_token_refresh_skew_seconds,
        )

    # validate_credential_source() makes this unreachable.
    raise ValueError("no agent credential source configured")
