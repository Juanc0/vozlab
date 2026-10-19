# syntax=docker/dockerfile:1
#
# Relator worker image (milestone 2.7).
#
# The build context is the REPOSITORY ROOT: the worker depends on the shared
# runtime package (`packages/worker-shared`) through the uv workspace, so the
# manifest, the lockfile and both packages have to be in the context.
#
#   docker build -f apps/worker-relacionador/Dockerfile -t vozlab/worker-relacionador .

FROM ghcr.io/astral-sh/uv:0.11.8 AS uv

FROM python:3.12-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    PATH="/app/.venv/bin:$PATH"

COPY --from=uv /uv /usr/local/bin/uv

WORKDIR /app

# The workspace manifest first: the dependency layer is cached until a
# dependency actually changes.
COPY pyproject.toml uv.lock .python-version ./
COPY packages/worker-shared ./packages/worker-shared
COPY apps/worker-relacionador ./apps/worker-relacionador

# `--frozen` fails the build when the lockfile is out of date, so an
# unpinned dependency can never reach an image by accident.
RUN uv sync --frozen --no-dev --package vozlab-worker-relacionador

# The worker needs no write access and no privileges.
RUN useradd --create-home --uid 10001 worker \
 && chown -R worker:worker /app
USER worker

ENTRYPOINT ["vozlab-worker-relacionador"]
