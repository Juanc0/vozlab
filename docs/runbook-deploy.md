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

## 8. Floci + Terraform (simulación AWS local)

### ¿Qué es Floci?

Floci es un emulador open-source de AWS que corre en Docker en `localhost:4566`.
No necesita cuenta AWS. Emula: S3, SQS, DynamoDB, Secrets Manager, SSM,
IAM, STS, Lambda, etc.

### ¿Para qué sirve en nuestro caso?

1. **Practicar IaC** — escribir Terraform que apunte a Floci, validar localmente,
   y luego aplicar a AWS real cambiando un solo parámetro.
2. **Simular la infraestructura AWS** sin costo ni cuenta.
3. **Probar integraciones** (ej. leer secrets desde Secrets Manager) sin salir
   de tu máquina.

### ¿Qué NO emula Floci?

- PostgreSQL / RDS (AGE no está en RDS de todas formas)
- Redis / ElastiCache (usamos Redis directamente)
- ECS/Fargate, EC2, ALB, Route 53 (contenedores y redes)
- Ollama (proceso local)

Es decir: Floci emula los **servicios stateless** (S3, SQS, Secrets, SSM), pero
el compute (API, web, workers) y las bases de datos siguen corriendo en Docker
Compose. Floci **no reemplaza** el stack de producción.

### Cómo usar Floci

```bash
# 1. Levantar Floci
docker compose -f docker-compose.prod.yml --profile aws-emulation up -d

# 2. Sembrar recursos (secrets, S3, SQS, SSM)
./scripts/floci-seed.sh

# 3. Probar con AWS CLI
export AWS_ENDPOINT_URL=http://localhost:4566
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=us-east-1
aws --endpoint-url http://localhost:4566 secretsmanager list-secrets
aws --endpoint-url http://localhost:4566 s3 ls

# 4. Probar con Terraform
cd infra/terraform
terraform init
terraform plan -var="aws_endpoint=http://localhost:4566"
terraform apply -var="aws_endpoint=http://localhost:4566" -auto-approve

# 5. Para aplicar a AWS real (cuando tengas cuenta):
terraform apply -var="aws_endpoint="  # vacío = AWS real
```

### Flujo de secrets (Floci → .env → API)

```
Floci (Secrets Manager) → extraer valores → .env → API lee env vars
```

En producción real (AWS), ECS inyecta los secrets de Secrets Manager como
variables de entorno en el contenedor. El API no cambia: siempre lee env vars.
Floci te permite practicar este flujo localmente.

## 9. Notes

- Cloudflare Tunnel is **free** on every plan (1,000 tunnels per account).
- Requires a domain on Cloudflare (free plan works).
- TLS is terminated by Cloudflare; no certificate management needed.
- `cloudflared` connects outbound on port 7844 (UDP/TCP) — no inbound firewall rules.
- The API's `WEB_ORIGIN` must match the public hostname.
EOF
echo created