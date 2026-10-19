# VozLab Worker Shared Runtime

The Python package `vozlab_worker` provides the common worker runtime described
in ADR-0021:

- environment settings (`pydantic-settings`);
- JSON logging with an ambient `x-correlation-id`;
- agent JWT minting/static/file providers;
- a `httpx` API client with typed errors and opt-in retries;
- a Redis Streams consumer with consumer groups, `XAUTOCLAIM`, bounded attempts
  and a dead-letter stream.

It is consumed by the worker apps through the uv workspace. It does not replace
the API's authorization rules: workers must use an agent token and the API
remains the only writer to tenant PostgreSQL.

```bash
uv sync
uv run pytest
uv run ruff check .
```
