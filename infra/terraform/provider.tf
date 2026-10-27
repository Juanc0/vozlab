terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

variable "aws_endpoint" {
  type    = string
  default = "http://localhost:4566" # empty = real AWS
}

provider "aws" {
  region = "us-east-1"

  dynamic "endpoints" {
    for_each = var.aws_endpoint != "" ? [var.aws_endpoint] : []
    content {
      s3             = endpoints.value
      sqs            = endpoints.value
      dynamodb       = endpoints.value
      secretsmanager = endpoints.value
      ssm            = endpoints.value
      iam            = endpoints.value
      sts            = endpoints.value
    }
  }

  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true
  s3_use_path_style           = true

  access_key = var.aws_endpoint != "" ? "test" : null
  secret_key = var.aws_endpoint != "" ? "test" : null
}
EOF
echo created