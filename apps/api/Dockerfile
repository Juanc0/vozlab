# syntax=docker/dockerfile:1
#
# VozLab API image.
#
# Build context is the REPOSITORY ROOT:
#   docker build -f apps/api/Dockerfile -t vozlab/api .
#
# The API is TypeScript run through tsx (no JS is emitted by `build`);
# `pnpm turbo run build` only type-checks. The image runs the source
# directly, matching `pnpm --filter @vozlab/api dev` minus the watcher.

FROM node:22-alpine AS deps

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /app

# Workspace manifests first for layer caching.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/database/package.json ./packages/database/package.json
COPY packages/shared-types/package.json ./packages/shared-types/package.json
COPY packages/ts-config ./packages/ts-config

RUN pnpm install --frozen-lockfile --filter @vozlab/api...

FROM node:22-alpine AS runtime

ENV NODE_ENV=production
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages ./packages

COPY apps/api ./apps/api
COPY packages ./packages

# Non-root runtime user.
RUN addgroup -g 10001 vozlab && adduser -D -u 10001 -G vozlab vozlab \
 && chown -R vozlab:vozlab /app
USER vozlab

EXPOSE 3000

WORKDIR /app/apps/api
CMD ["pnpm", "exec", "tsx", "src/index.ts"]