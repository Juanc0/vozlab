---
title: Especificación de DevOps, CI/CD y Entorno Docker (VozLab)
version: 1.0.0
status: APPROVED
target_component: DevOps & Infrastructure
owner: DevOps & Platform Team (VozLab)
---

# 01. DESPLIEGUE, DEVOPS, CI/CD Y CONTENEDORES DOCKER

## 1. Orquestación Local del Entorno (`docker-compose.yml`)

Para levantar el ecosistema completo de VozLab en desarrollo local (Base de datos PostgreSQL con Apache AGE y pgvector, Redis y motores de IA) con un solo comando, se utiliza la siguiente configuración en la raíz del monorepo:

```yaml
version: '3.8'

services:
  postgres:
    image: ankane/pgvector:v0.7.0-postgres16
    container_name: vozlab_postgres
    environment:
      POSTGRES_DB: vozlab_db
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: secretpassword
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
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

## 2. Pipeline de CI/CD (GitHub Actions)

El flujo de integración continua está optimizado con **Turborepo** para compilar y probar únicamente los paquetes afectados en cada commit:

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

## 3. Estrategia de Migraciones Efímeras

* Las migraciones de base de datos gestionadas por **Drizzle ORM** se ejecutan como un trabajo efímero (`migration job`) antes de actualizar las réplicas del servicio `api-fastify` en el clúster de producción, garantizando que el esquema esté sincronizado de manera atómica antes de recibir tráfico HTTP.
