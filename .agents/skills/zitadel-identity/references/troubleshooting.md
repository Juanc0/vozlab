# Zitadel Troubleshooting

## Common Issues

### Zitadel Container Won't Start

**Symptom**: Container exits immediately or keeps restarting

**Diagnosis**:
```bash
docker compose logs zitadel
docker compose logs zitadel-init
```

**Common causes**:

1. **Database not ready**: Ensure PostgreSQL is healthy first
   ```bash
   docker exec postgres pg_isready -h localhost -U postgres
   ```

2. **Invalid masterkey**: Must be exactly 32 characters
   ```bash
   echo -n "$ZITADEL_MASTERKEY" | wc -c  # Should output 32
   ```

3. **Database not initialized**: Run init container first
   ```bash
   docker compose run zitadel-init
   ```

### Login Page Not Loading

**Symptom**: Redirects to login but page is blank or errors

**Causes**:

1. **Login UI not running**:
   ```bash
   docker compose ps zitadel-login
   ```

2. **Caddy not routing correctly**: Check Caddyfile has login route
   ```caddyfile
   handle /ui/v2/login/* {
       reverse_proxy http://zitadel-login:3000
   }
   ```

3. **Network isolation**: Ensure containers share network
   ```bash
   docker network inspect web
   ```

### gRPC Calls Failing

**Symptom**: API calls return "protocol error" or connection refused

**Cause**: Using `http://` instead of `h2c://` in Caddy

**Solution**: Update Caddyfile:
```caddyfile
reverse_proxy h2c://zitadel:8080
```

### OIDC Discovery Returns 404

**Symptom**: `/.well-known/openid-configuration` not found

**Diagnosis**:
```bash
curl -v https://auth.example.com/.well-known/openid-configuration
```

**Causes**:

1. **Zitadel not healthy**: Check health endpoint
   ```bash
   curl https://auth.example.com/healthz
   ```

2. **External domain mismatch**: Verify environment variables
   ```bash
   docker compose exec zitadel env | grep EXTERNAL
   ```

### OAuth2 Redirect URI Mismatch

**Symptom**: "redirect_uri does not match" error

**Solution**:
1. Check exact redirect URI in application settings
2. Ensure no trailing slashes mismatch
3. Verify protocol (https vs http)

### Database Connection Errors

**Symptom**: "connection refused" or "no pg_hba.conf entry"

**Diagnosis**:
```bash
# Test connection
docker exec -it postgres psql -U zitadel -d zitadel

# Check database exists
docker exec postgres psql -U postgres -c "\l" | grep zitadel

# Check user permissions
docker exec postgres psql -U postgres -c "\du" | grep zitadel
```

**Solution**: Ensure database and user are created:
```sql
CREATE DATABASE zitadel;
CREATE USER zitadel WITH ENCRYPTED PASSWORD 'password';
GRANT ALL PRIVILEGES ON DATABASE zitadel TO zitadel;
```

### Token Validation Fails

**Symptom**: "invalid token" or "token expired"

**Diagnosis**:
```bash
# Decode JWT
echo "<token>" | cut -d'.' -f2 | base64 -d | jq

# Check issuer matches
curl https://auth.example.com/.well-known/openid-configuration | jq '.issuer'
```

**Causes**:
1. Issuer URL mismatch
2. Token expired
3. Wrong audience

## Verification Commands

### Service Health

```bash
# All containers
docker compose ps

# Specific health
docker inspect zitadel | jq '.[0].State.Health'

# Health endpoint
curl https://auth.example.com/healthz
curl https://auth.example.com/ready
```

### Database

```bash
# PostgreSQL ready
docker exec postgres pg_isready -h localhost -U postgres

# Connect to Zitadel DB
docker exec -it postgres psql -U zitadel -d zitadel

# Check database size
docker exec postgres psql -U postgres -c \
  "SELECT datname, pg_size_pretty(pg_database_size(datname)) FROM pg_database WHERE datname='zitadel';"
```

### Network

```bash
# Test internal connectivity
docker exec caddy wget -qO- http://zitadel:8080/healthz

# Check DNS resolution
docker exec caddy nslookup zitadel
```

### OIDC

```bash
# Discovery document
curl https://auth.example.com/.well-known/openid-configuration | jq

# JWKS
curl https://auth.example.com/oauth/v2/keys | jq

# Validate Caddy config
docker exec caddy caddy validate --config /etc/caddy/Caddyfile
```

## Log Analysis

### View Logs

```bash
# All Zitadel logs
docker compose logs -f zitadel zitadel-login

# Last 100 lines
docker compose logs --tail=100 zitadel

# Filter errors
docker compose logs zitadel 2>&1 | grep -i error
```

### Enable Debug Logging

Add to environment:
```yaml
environment:
  - ZITADEL_LOG_LEVEL=debug
```

### Common Log Patterns

| Pattern | Meaning |
|---------|---------|
| `msg="request started"` | Incoming request |
| `level=error` | Error occurred |
| `msg="login failed"` | Authentication failure |
| `msg="token issued"` | Successful token generation |

## Recovery Procedures

### Reset Admin Password

Use the console recovery flow or database:
```bash
docker exec -it postgres psql -U zitadel -d zitadel
# Then use Zitadel's password reset API
```

### Regenerate Masterkey

**Warning**: Changing masterkey requires re-encrypting all data.

Not recommended for production. Instead, restore from backup.

### Database Backup/Restore

```bash
# Backup
docker exec postgres pg_dump -U postgres -d zitadel > zitadel_backup.sql

# Restore
docker exec -i postgres psql -U postgres -d zitadel < zitadel_backup.sql
```

## Official Documentation

- Troubleshooting: https://zitadel.com/docs/self-hosting/manage/troubleshooting
- Logging: https://zitadel.com/docs/self-hosting/manage/configure#logging
- Database: https://zitadel.com/docs/self-hosting/manage/database
