FROM node:20-alpine AS base
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web ./apps/web
COPY packages ./packages
RUN corepack enable && pnpm install --frozen-lockfile
RUN pnpm --filter @vozlab/web build
EXPOSE 3000
CMD ["node", "apps/web/build/index.js"]