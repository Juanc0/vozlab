FROM node:20-alpine AS base
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api ./apps/api
COPY packages ./packages
RUN corepack enable && pnpm install --frozen-lockfile
RUN pnpm --filter @vozlab/api build
EXPOSE 3000
CMD ["pnpm", "--filter", "@vozlab/api", "start"]