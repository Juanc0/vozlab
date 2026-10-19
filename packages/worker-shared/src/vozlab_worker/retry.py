"""Small, deterministic retry helper for API and worker calls."""

from __future__ import annotations

import random
import time
from collections.abc import Callable
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class RetryPolicy:
    attempts: int = 3
    base_delay_seconds: float = 0.25
    max_delay_seconds: float = 10.0
    jitter_seconds: float = 0.1

    def __post_init__(self) -> None:
        if self.attempts < 1:
            raise ValueError("attempts must be >= 1")
        if self.base_delay_seconds < 0 or self.max_delay_seconds < 0:
            raise ValueError("delays must be non-negative")
        if self.max_delay_seconds < self.base_delay_seconds:
            raise ValueError("max_delay_seconds must be >= base_delay_seconds")

    def delay_for(self, attempt: int) -> float:
        """Capped exponential backoff plus jitter; attempt is 1-based."""
        if attempt < 1:
            raise ValueError("attempt must be >= 1")
        exponential = self.base_delay_seconds * (2 ** (attempt - 1))
        capped = min(self.max_delay_seconds, exponential)
        return capped + random.uniform(0, self.jitter_seconds)


def retry_call[T](
    operation: Callable[[], T],
    *,
    policy: RetryPolicy,
    retry_on: tuple[type[BaseException], ...],
    sleep: Callable[[float], None] = time.sleep,
) -> T:
    """Call operation until it succeeds or the policy is exhausted.

    The last exception is re-raised unchanged, so callers can inspect it.
    """
    last_error: BaseException | None = None
    for attempt in range(1, policy.attempts + 1):
        try:
            return operation()
        except retry_on as exc:
            last_error = exc
            if attempt == policy.attempts:
                break
            sleep(policy.delay_for(attempt))

    assert last_error is not None
    raise last_error
