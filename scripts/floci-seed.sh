# Floci seed script — creates AWS resources in the local emulator.
# Run after: docker compose -f docker/floci/docker-compose.yml up -d
# Requires: aws CLI (or use the floci CLI)

#!/usr/bin/env bash
set -euo pipefail

ENDPOINT="http://localhost:4566"
REGION="us-east-1"
export AWS_ENDPOINT_URL="$ENDPOINT"
export AWS_DEFAULT_REGION="$REGION"
export AWS_ACCESS_KEY_ID="test"
export AWS_SECRET_ACCESS_KEY="test"

echo "=== Creating Secrets Manager secrets ==="

aws secretsmanager create-secret \
  --name "vozlab/jwt-secret" \
  --secret-string "change-me-at-least-32-chars-for-demo" \
  --endpoint-url "$ENDPOINT" 2>/dev/null || echo "  (already exists)"

aws secretsmanager create-secret \
  --name "vozlab/db-password" \
  --secret-string "postgres" \
  --endpoint-url "$ENDPOINT" 2>/dev/null || echo "  (already exists)"

aws secretsmanager create-secret \
  --name "vozlab/oidc-client-secret" \
  --secret-string "change-me" \
  --endpoint-url "$ENDPOINT" 2>/dev/null || echo "  (already exists)"

echo "=== Creating SSM parameters ==="

aws ssm put-parameter \
  --name "/vozlab/environment" \
  --value "demo" \
  --type String \
  --endpoint-url "$ENDPOINT" 2>/dev/null || echo "  (already exists)"

aws ssm put-parameter \
  --name "/vozlab/api-base-url" \
  --value "http://localhost:3000" \
  --type String \
  --endpoint-url "$ENDPOINT" 2>/dev/null || echo "  (already exists)"

echo "=== Creating S3 bucket ==="

aws s3 mb s3://vozlab-assets \
  --endpoint-url "$ENDPOINT" 2>/dev/null || echo "  (already exists)"

echo "=== Creating SQS queue (for future async tasks) ==="

aws sqs create-queue \
  --queue-name vozlab-tasks \
  --endpoint-url "$ENDPOINT" 2>/dev/null || echo "  (already exists)"

echo "=== Done ==="
echo "Floci is running at $ENDPOINT"
echo "Verify: aws --endpoint-url $ENDPOINT secretsmanager list-secrets"
