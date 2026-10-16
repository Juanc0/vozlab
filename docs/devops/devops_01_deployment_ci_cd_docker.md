---
title: DevOps, CI/CD, and Docker Environment Specification (VozLab)
version: 1.0.0
status: APPROVED
target_component: DevOps & Infrastructure
owner: DevOps & Platform Team (VozLab)
---

# 01. DEPLOYMENT, DEVOPS, CI/CD, AND DOCKER CONTAINERS

## 1. Local Environment Orchestration (`docker-compose.yml`)

To bring up the complete VozLab ecosystem in local development (PostgreSQL database with Apache AGE and pgvector, Redis, and AI engines) with a single command, the following configuration is used at the root of the monorepo:

```yaml
version: '3.8'

services:
  postgres:
    # Custom image: PostgreSQL 18 + Apache AGE + pgvector (see docker/postgres/Dockerfile)
    build:
      context: ./docker/postgres
    image: vozlab/postgres:18-age-pgvector
    container_name: vozlab_postgres
    environment:
      POSTGRES_DB: vozlab_db
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: secretpassword
    ports:
      - "5432:5432"
    volumes:
      # PG18 declares VOLUME /var/lib/postgresql
      - pgdata:/var/lib/postgresql
      - ./packages/database/scripts:/docker-entrypoint-initdb.d
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d vozlab_db"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: vozlab_redis
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  ollama:
    image: ollama/ollama:latest
    container_name: vozlab_ollama
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama

volumes:
  pgdata:
  ollama_data:

```

---

## 2. CI/CD Pipeline (GitHub Actions)

The continuous integration flow is optimized with **Turborepo** to build and test only the packages affected in each commit:

```yaml
# .github/workflows/ci.yml
name: CI/CD Pipeline - VozLab

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  validate-and-test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: ankane/pgvector:v0.7.0-postgres16
        env:
          POSTGRES_DB: vozlab_test
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: secretpassword
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Setup Node.js 20
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install pnpm
        uses: pnpm/action-setup@v3
        with:
          version: 9.0.0
          run_install: false

      - name: Get pnpm store directory
        id: pnpm-cache
        run: |
          echo "STORE_PATH=$(pnpm store path --silent)" >> $GITHUB_OUTPUT

      - name: Setup pnpm cache
        uses: actions/cache@v4
        with:
          path: ${{ steps.pnpm-cache.outputs.STORE_PATH }}
          key: ${{ runner.os }}-pnpm-store-${{ hashFiles('**/pnpm-lock.yaml') }}
          restore-keys: |
            ${{ runner.os }}-pnpm-store-

      - name: Install Dependencies
        run: pnpm install --frozen-lockfile

      - name: Run TypeCheck & Lint
        run: pnpm turbo run lint type-check

      - name: Run Unit & Integration Tests
        env:
          DATABASE_URL: postgres://postgres:secretpassword@localhost:5432/vozlab_test
        run: pnpm turbo run test:ci

```

---

## 3. Ephemeral Migration Strategy

* Database migrations managed by **Drizzle ORM** run as an ephemeral job (`migration job`) before updating the replicas of the `api-fastify` service in the production cluster, guaranteeing that the schema is synchronized atomically before receiving HTTP traffic.
