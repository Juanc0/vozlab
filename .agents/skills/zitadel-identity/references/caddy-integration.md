# Caddy Integration with Zitadel

## Architecture

```
Internet → Caddy (ports 80/443) → Zitadel API (h2c://zitadel:8080)
                                → Login UI (http://zitadel-login:3000)
```

Caddy handles:
- TLS termination
- Routing to Zitadel API (gRPC/REST)
- Routing to Login UI

Zitadel components:
- `zitadel:8080` - API server (HTTP/2 cleartext)
- `zitadel-login:3000` - Login/Console UI

## Caddyfile Configuration

### TLS Mode External (Recommended)

Caddy terminates TLS, forwards unencrypted h2c to Zitadel:

```caddyfile
auth.example.com {
    # Route login UI requests
    handle /ui/v2/login/* {
        reverse_proxy http://zitadel-login:3000
    }

    # Route all other requests to Zitadel API via h2c
    handle {
        reverse_proxy h2c://zitadel:8080
    }
}
```

### Alternative: Path-Based Routing

```caddyfile
auth.example.com {
    # Login UI
    handle /login/* {
        reverse_proxy http://zitadel-login:3000
    }

    # Console UI
    handle /ui/console/* {
        reverse_proxy h2c://zitadel:8080
    }

    # API endpoints
    handle /oauth/* {
        reverse_proxy h2c://zitadel:8080
    }

    handle /oidc/* {
        reverse_proxy h2c://zitadel:8080
    }

    handle /management/* {
        reverse_proxy h2c://zitadel:8080
    }

    handle /admin/* {
        reverse_proxy h2c://zitadel:8080
    }

    # Default to API
    handle {
        reverse_proxy h2c://zitadel:8080
    }
}
```

### With Security Headers

```caddyfile
auth.example.com {
    encode gzip

    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Content-Type-Options nosniff
        X-Frame-Options SAMEORIGIN
        Referrer-Policy strict-origin-when-cross-origin
    }

    handle /ui/v2/login/* {
        reverse_proxy http://zitadel-login:3000
    }

    handle {
        reverse_proxy h2c://zitadel:8080
    }
}
```

## Docker Compose Configuration

```yaml
services:
  caddy:
    image: caddy:2.8-alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
    networks:
      - web
    depends_on:
      zitadel:
        condition: service_healthy

  zitadel:
    image: ghcr.io/zitadel/zitadel:latest
    command: start --config /zitadel-config.yaml --masterkeyFromEnv
    environment:
      - ZITADEL_MASTERKEY=${ZITADEL_MASTERKEY}
      - ZITADEL_EXTERNALDOMAIN=auth.example.com
      - ZITADEL_EXTERNALPORT=443
      - ZITADEL_EXTERNALSECURE=true
      - ZITADEL_TLS_ENABLED=false
    volumes:
      - ./zitadel-config.yaml:/zitadel-config.yaml:ro
    networks:
      - web
      - zitadel-internal
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/healthz"]
      interval: 30s
      timeout: 10s
      retries: 5

  zitadel-login:
    image: ghcr.io/zitadel/zitadel-login:latest
    networks:
      - web
    depends_on:
      - zitadel

networks:
  web:
    driver: bridge
  zitadel-internal:
    driver: bridge
```

## Important Notes

### h2c Protocol

`h2c://` is HTTP/2 over cleartext (no TLS). Required because:
- Zitadel uses gRPC which needs HTTP/2
- TLS is already terminated at Caddy
- Standard HTTP/1.1 proxy won't work for gRPC

### Common Mistakes

1. **Using `http://` instead of `h2c://`** - gRPC calls will fail
2. **Not routing login UI separately** - Login pages won't render
3. **Missing health check dependency** - Caddy may start before Zitadel is ready

### Verify Configuration

```bash
# Check Caddy config
docker exec caddy caddy validate --config /etc/caddy/Caddyfile

# Test OIDC discovery
curl https://auth.example.com/.well-known/openid-configuration

# Test health endpoint
curl https://auth.example.com/healthz
```

## Official Documentation

- Caddy Setup: https://zitadel.com/docs/self-hosting/manage/reverseproxy/caddy
- TLS Options: https://zitadel.com/docs/self-hosting/manage/tls_modes
