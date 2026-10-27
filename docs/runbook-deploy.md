# Runbook: Demo deploy (single host + Cloudflare Tunnel)

## Prerequisites

- Docker + Docker Compose
- A Cloudflare account (free) + a domain whose DNS is on Cloudflare
- `cloudflared` CLI installed

## 1. Build images

```bash
docker build -f apps/api/Dockerfile -t vozlab/api:latest .
docker build -f apps/web/Dockerfile -t vozlab/web:latest .
docker build -f apps/worker-embedder/Dockerfile -t vozlab/worker-embedder:latest .
docker build -f apps/worker-relacionador/Dockerfile -t vozlab/worker-relacionador:latest .
docker build -f apps/worker-extractor/Dockerfile -t vozlab/worker-extractor:latest .
```

## 2. Prepare environment

```bash
cp .env.production.example .env
# Edit .env with real secrets (JWT_SECRET, DB passwords, OIDC creds, etc.)
```

## 3. Run migrations

```bash
docker compose -f docker-compose.prod.yml run --rm migrate
```

## 4. Start the stack

```bash
docker compose -f docker-compose.prod.yml up -d
# Optional: observability
docker compose -f docker-compose.prod.yml --profile observability up -d
```

## 5. Cloudflare Tunnel (public access, free, TLS included)

### Install cloudflared

```bash
# Linux
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared

# macOS
brew install cloudflared
```

### Authenticate

```bash
cloudflared tunnel login
# Opens browser; select your domain
```

### Create tunnel

```bash
cloudflared tunnel create vozlab-demo
# Note the tunnel ID
```

### Configure routes (~/.cloudflared/config.yml)

```yaml
tunnel: <TUNNEL_ID>
credentials-file: /root/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: vozlab.yourdomain.com
    service: http://localhost:5173
  - hostname: api.vozlab.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
```

### Start tunnel

```bash
cloudflared tunnel run vozlab-demo
```

### DNS (automatic)

Cloudflare creates CNAME records automatically when you add published applications
via the dashboard. Or manually:

```bash
cloudflared tunnel route dns vozlab-demo vozlab.yourdomain.com
cloudflared tunnel route dns vozlab-demo api.vozlab.yourdomain.com
```

## 6. Pre-warm Ollama

```bash
docker exec vozlab-ollama ollama pull nomic-embed-text
# Run one embedding to warm the model
```

## 7. Reset demo (if needed)

```bash
docker compose -f docker-compose.prod.yml down -v
docker compose -f docker-compose.prod.yml run --rm migrate
docker compose -f docker-compose.prod.yml up -d
```

## 8. Floci (local AWS emulation, optional)

For testing Terraform/IaC without a real AWS account:

```bash
docker compose -f docker/floci/docker-compose.yml up -d
export AWS_ENDPOINT_URL=http://localhost:4566
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=us-east-1
cd infra/terraform
terraform init
terraform plan -var="aws_endpoint=http://localhost:4566"
terraform apply -var="aws_endpoint=http://localhost:4566" -auto-approve
```

To destroy: `terraform destroy -var="aws_endpoint=http://localhost:4566" -auto-approve`

## 9. Notes

- Cloudflare Tunnel is **free** on every plan (1,000 tunnels per account).
- Requires a domain on Cloudflare (free plan works).
- TLS is terminated by Cloudflare; no certificate management needed.
- `cloudflared` connects outbound on port 7844 (UDP/TCP) — no inbound firewall rules.
- The API's `WEB_ORIGIN` must match the public hostname.
EOF
echo created