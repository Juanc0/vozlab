from __future__ import annotations

import pytest

from vozlab_worker.retry import RetryPolicy, retry_call


def test_retry_succeeds_after_transient_failures() -> None:
    attempts = 0
    sleeps: list[float] = []

    def operation() -> str:
        nonlocal attempts
        attempts += 1
        if attempts < 3:
            raise RuntimeError("transient")
        return "ok"

    result = retry_call(
        operation,
        policy=RetryPolicy(
            attempts=3, base_delay_seconds=0.1, max_delay_seconds=1, jitter_seconds=0
        ),
        retry_on=(RuntimeError,),
        sleep=sleeps.append,
    )

    assert result == "ok"
    assert attempts == 3
    assert sleeps == [0.1, 0.2]


def test_retry_reraises_last_error() -> None:
    def operation() -> None:
        raise RuntimeError("still broken")

    with pytest.raises(RuntimeError, match="still broken"):
        retry_call(
            operation,
            policy=RetryPolicy(
                attempts=2, base_delay_seconds=0, max_delay_seconds=0, jitter_seconds=0
            ),
            retry_on=(RuntimeError,),
            sleep=lambda _delay: None,
        )


def test_invalid_policy_is_rejected() -> None:
    with pytest.raises(ValueError):
        RetryPolicy(attempts=0)
    with pytest.raises(ValueError):
        RetryPolicy(attempts=2, base_delay_seconds=10, max_delay_seconds=1)
