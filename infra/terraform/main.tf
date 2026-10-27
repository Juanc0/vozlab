# VozLab infrastructure skeleton (Phase 5).
# Targets Floci locally by default; pass -var="aws_endpoint=" for real AWS.

resource "aws_s3_bucket" "vozlab_assets" {
  bucket = "vozlab-assets-local"
}

resource "aws_sqs_queue" "vozlab_dlq" {
  name = "vozlab-dead-letter"
}

resource "aws_ssm_parameter" "vozlab_env" {
  name  = "/vozlab/environment"
  type  = "String"
  value = "local"
}

# Secrets Manager (example — real secrets go here in production)
resource "aws_secretsmanager_secret" "jwt_secret" {
  name = "vozlab/jwt-secret"
}
EOF
echo created