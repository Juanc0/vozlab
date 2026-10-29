# Floci — local AWS emulation for IaC testing

> Extracted 2026-10-29 from the archived `docs/archive/history/runbook-deploy-cloudflare-tunnel.md`
> (§8, which carried it duplicated in English and Spanish) after the T2
> re-alignment (ADR-0043) superseded the Cloudflare-tunnel deployment model.
> Floci testing is independent of how VozLab itself is exposed.

## What Floci is

An open-source AWS emulator running in Docker at `localhost:4566`. No AWS
account needed. It emulates S3, SQS, DynamoDB, Secrets Manager, SSM, IAM, STS,
Lambda and similar services.

## What it is for here

1. **Practice IaC** — write Terraform against Floci, validate locally, then
   point the same code at real AWS by changing one parameter.
2. **Simulate AWS-side integrations** (e.g. reading secrets from Secrets
   Manager) without leaving the machine.

## What it does NOT emulate

- PostgreSQL / RDS (AGE is not on RDS anyway)
- Redis / ElastiCache
- ECS/Fargate, EC2, ALB, Route 53
- Ollama (local process)

It emulates **stateless services** (S3, SQS, Secrets, SSM); compute (API, web,
workers) and the databases keep running under Docker Compose. Floci **never
replaces** the production stack — production exposure is the T2 topology
([ADR-0043](../decisions/ADR-0043-production-topology-caddy-t2.md),
[production runbook](production-deployment.md)).

## Workflow

```bash
# 1. Start Floci (compose profile aws-emulation)
docker compose -f docker/floci/docker-compose.yml up -d
#    (equivalently: docker-compose.prod.yml --profile aws-emulation)

# 2. Point the AWS CLI/SDK at it
export AWS_ENDPOINT_URL=http://localhost:4566
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=us-east-1

# 3. Terraform skeleton against the emulator
cd infra/terraform
terraform init
terraform plan  -var="aws_endpoint=http://localhost:4566"
terraform apply -var="aws_endpoint=http://localhost:4566" -auto-approve

# 4. Tear down
terraform destroy -var="aws_endpoint=http://localhost:4566" -auto-approve
```

Seed data for the emulator: `scripts/floci-seed.sh` (creates the buckets/queues
the Terraform skeleton declares). Floci state persists in the `floci_data`
volume; delete the volume for a clean slate.
