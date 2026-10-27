# Zitadel Configuration Reference

## Environment Variables

### Required Variables

```bash
# 32-character encryption key for AES256
ZITADEL_MASTERKEY=<32-char-random-string>

# Database credentials
ZITADEL_DATABASE_POSTGRES_HOST=postgres
ZITADEL_DATABASE_POSTGRES_PORT=5432
ZITADEL_DATABASE_POSTGRES_DATABASE=zitadel
ZITADEL_DATABASE_POSTGRES_USER_USERNAME=zitadel
ZITADEL_DATABASE_POSTGRES_USER_PASSWORD=<password>

# External access (how users reach Zitadel)
ZITADEL_EXTERNALDOMAIN=auth.example.com
ZITADEL_EXTERNALPORT=443
ZITADEL_EXTERNALSECURE=true

# Disable internal TLS (Caddy handles TLS)
ZITADEL_TLS_ENABLED=false
```

### Initial Admin Setup

```bash
ZITADEL_FIRSTINSTANCE_ORG_NAME=MyOrganization
ZITADEL_FIRSTINSTANCE_ORG_HUMAN_USERNAME=admin@example.com
ZITADEL_FIRSTINSTANCE_ORG_HUMAN_PASSWORD=<admin-password>
ZITADEL_FIRSTINSTANCE_ORG_HUMAN_FIRSTNAME=Admin
ZITADEL_FIRSTINSTANCE_ORG_HUMAN_LASTNAME=User
ZITADEL_FIRSTINSTANCE_ORG_HUMAN_EMAIL=admin@example.com
ZITADEL_FIRSTINSTANCE_ORG_HUMAN_EMAIL_ISVERIFIED=true
```

### Generate Masterkey

```bash
tr -dc A-Za-z0-9 </dev/urandom | head -c 32
```

## Configuration File (zitadel-config.yaml)

```yaml
# Server configuration
server:
  grpc:
    listenAddress: 0.0.0.0:50051
  http:
    listenAddress: 0.0.0.0:8080

# API server settings
zitadel:
  audit:
    logAuditEvents: true
  telemetry:
    metrics:
      enabled: true
      listenAddress: 0.0.0.0:9090

# Authentication settings
auth:
  codeLifetime: "10m"
  idTokenLifetime: "24h"
  refreshTokenIdleExpiration: "2160h"  # 90 days
  refreshTokenExpiration: "8760h"      # 365 days

# OTP settings for 2FA
otp:
  maxAttempts: 5
  issuer: "MyOrganization"

# Secret generation
secretGeneratorLength: 32
derivedSecretGeneratorLength: 32
tokenEncryptionKeyRotationCheck: "1h"
```

## Database Configuration

### Connection Pool

```yaml
Database:
  postgres:
    MaxOpenConns: 10
    MaxIdleConns: 5
    MaxConnLifetime: 30m
    MaxConnIdleTime: 5m
```

### SSL Mode Options

- `disable` - No SSL (for internal networks)
- `require` - SSL required, no verification
- `verify-ca` - Verify CA certificate
- `verify-full` - Verify CA and hostname

## OIDC Configuration

```yaml
OIDC:
  DefaultAccessTokenLifetime: 12h
  DefaultIdTokenLifetime: 12h
  DefaultRefreshTokenIdleExpiration: 720h   # 30 days
  DefaultRefreshTokenExpiration: 2160h      # 90 days
  CodeMethodS256: true                      # PKCE support
  AuthMethodPost: true
  AuthMethodPrivateKeyJWT: true
  GrantTypeRefreshToken: true
```

## Docker Compose Services

### Three-Container Architecture

```yaml
services:
  zitadel-init:
    image: ghcr.io/zitadel/zitadel:latest
    command: init --config /zitadel-config.yaml
    # Runs once to initialize database, then exits

  zitadel:
    image: ghcr.io/zitadel/zitadel:latest
    command: start --config /zitadel-config.yaml --masterkeyFromEnv
    # API server on port 8080

  zitadel-login:
    image: ghcr.io/zitadel/zitadel-login:latest
    # Login UI on port 3000
```

### Resource Limits

| Container | Memory | CPU |
|-----------|--------|-----|
| zitadel | 512m | 0.5 |
| zitadel-login | 256m | 0.25 |
| zitadel-init | default | default |

### Health Checks

```yaml
zitadel:
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:8080/healthz"]
    interval: 30s
    timeout: 10s
    retries: 5
```

## Ports

| Port | Service | Protocol |
|------|---------|----------|
| 8080 | HTTP API | h2c (HTTP/2 cleartext) |
| 50051 | gRPC API | gRPC |
| 3000 | Login UI | HTTP |
| 9090 | Metrics | HTTP |

## Official Documentation

- Configuration Reference: https://zitadel.com/docs/self-hosting/manage/configure
- Environment Variables: https://zitadel.com/docs/self-hosting/manage/configure#environment-variables
- Database Setup: https://zitadel.com/docs/self-hosting/manage/database
