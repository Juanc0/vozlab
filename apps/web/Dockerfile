# syntax=docker/dockerfile:1
#
# VozLab web (SvelteKit, adapter-node) image.
#
# Build context is the REPOSITORY ROOT:
#   docker build -f apps/web/Dockerfile -t vozlab/web .
#
# Builds the adapter-node server and runs it.

FROM node:22-alpine AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages/shared-types/package.json ./packages/shared-types/package.json
COPY packages/ts-config ./packages/ts-config

RUN pnpm install --frozen-lockfile --filter @vozlab/web...

COPY apps/web ./apps/web
COPY packages ./packages

RUN pnpm --filter @vozlab/web build

FROM node:22-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/apps/web/build ./build
COPY --from=build /app/apps/web/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules

RUN addgroup -g 10001 vozlab && adduser -D -u 10001 -G vozlab vozlab \
 && chown -R vozlab:vozlab /app
USER vozlab

EXPOSE 3000
ENV PORT=3000
CMD ["node", "build/index.js"]