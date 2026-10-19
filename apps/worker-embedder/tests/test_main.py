from __future__ import annotations

import pytest

from worker_embedder.main import main


def test_check_mode_validates_a_static_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AGENT_TOKEN", "static-test-token")
    monkeypatch.delenv("AGENT_TOKEN_FILE", raising=False)

    assert main(["--check"]) == 0


def test_scaffold_without_check_exits_nonzero(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AGENT_TOKEN", "static-test-token")
    monkeypatch.delenv("AGENT_TOKEN_FILE", raising=False)

    assert main([]) == 2


def test_missing_credentials_fail_fast(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in ("AGENT_TOKEN", "AGENT_TOKEN_FILE", "JWT_SECRET"):
        monkeypatch.delenv(name, raising=False)

    assert main(["--check"]) == 2
