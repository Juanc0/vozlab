# Zitadel API Reference

## API Types

| API | Purpose | Base Path |
|-----|---------|-----------|
| Auth | Current user operations | `/auth/v1/` |
| Management | IAM objects (orgs, projects, users) | `/management/v1/` |
| Administration | Instance configuration | `/admin/v1/` |
| System | Multi-instance management | `/system/v1/` |
| User | User management (newer) | `/v2/users` |
| Session | Session management (newer) | `/v2/sessions` |

## Authentication

### Personal Access Token (PAT)

```bash
curl -H "Authorization: Bearer <PAT>" \
  https://auth.example.com/management/v1/orgs/me
```

### OAuth2 Token

```bash
# Get token via client credentials
curl -X POST https://auth.example.com/oauth/v2/token \
  -d "grant_type=client_credentials" \
  -d "client_id=<CLIENT_ID>" \
  -d "client_secret=<CLIENT_SECRET>" \
  -d "scope=openid"
```

## Common Endpoints

### Health Check

```bash
curl https://auth.example.com/healthz
curl https://auth.example.com/ready
```

### OIDC Discovery

```bash
curl https://auth.example.com/.well-known/openid-configuration
```

### Organization Info

```bash
curl -H "Authorization: Bearer <PAT>" \
  https://auth.example.com/management/v1/orgs/me
```

### List Users

```bash
curl -H "Authorization: Bearer <PAT>" \
  https://auth.example.com/management/v1/users/_search
```

### Create User

```bash
curl -X POST \
  -H "Authorization: Bearer <PAT>" \
  -H "Content-Type: application/json" \
  https://auth.example.com/management/v1/users/human \
  -d '{
    "userName": "newuser",
    "profile": {
      "firstName": "New",
      "lastName": "User"
    },
    "email": {
      "email": "newuser@example.com",
      "isEmailVerified": true
    },
    "initialPassword": "Password123!"
  }'
```

### List Projects

```bash
curl -H "Authorization: Bearer <PAT>" \
  https://auth.example.com/management/v1/projects/_search
```

### List Applications

```bash
curl -H "Authorization: Bearer <PAT>" \
  "https://auth.example.com/management/v1/projects/<PROJECT_ID>/apps/_search"
```

## gRPC API

Zitadel also exposes gRPC endpoints:

| Service | Path |
|---------|------|
| Auth | `/zitadel.auth.v1.AuthService/` |
| Management | `/zitadel.management.v1.ManagementService/` |
| Admin | `/zitadel.admin.v1.AdminService/` |

### gRPC with grpcurl

```bash
# List services
grpcurl -H "Authorization: Bearer <PAT>" \
  auth.example.com:443 list

# Call method
grpcurl -H "Authorization: Bearer <PAT>" \
  auth.example.com:443 \
  zitadel.management.v1.ManagementService/GetMyOrg
```

## Webhooks (Actions)

Zitadel supports Actions for custom logic triggered by events.

### Event Types

- Pre-creation hooks
- Post-creation hooks
- Complement token hooks

### Create Action via Console

1. Console → Actions
2. **+ New Script**
3. Write JavaScript function
4. Attach to flow triggers

## Metrics

Zitadel exposes Prometheus metrics on port 9090:

```bash
curl http://localhost:9090/metrics
```

Key metrics:
- `zitadel_request_duration_seconds`
- `zitadel_active_sessions`
- `zitadel_login_success_total`
- `zitadel_login_failure_total`

## Rate Limiting

Default limits (configurable):
- 100 requests/second per IP
- 1000 requests/second per organization

## Official Documentation

- API Introduction: https://zitadel.com/docs/apis/introduction
- REST API Reference: https://zitadel.com/docs/apis/resources/mgmt
- gRPC Reference: https://zitadel.com/docs/apis/proto/management
- Actions: https://zitadel.com/docs/concepts/features/actions
