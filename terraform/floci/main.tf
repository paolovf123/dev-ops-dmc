terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
  # Local backend for Floci testing
  backend "local" {
    path = "floci.tfstate"
  }
}

provider "aws" {
  region                      = "us-east-1"
  access_key                  = "test"
  secret_key                  = "test"
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true
  s3_use_path_style           = true

  endpoints {
    s3             = "http://localhost:4566"
    ecr            = "http://localhost:4566"
    ecs            = "http://localhost:4566"
    rds            = "http://localhost:4566"
    iam            = "http://localhost:4566"
    sts            = "http://localhost:4566"
    ssm            = "http://localhost:4566"
    cloudwatch     = "http://localhost:4566"
    cloudwatchlogs = "http://localhost:4566"
    elbv2          = "http://localhost:4566"
    ec2            = "http://localhost:4566"
  }
}

# ── ECR ────────────────────────────────────────────────────────────────────────
resource "aws_ecr_repository" "backend" {
  name                 = "datavault-backend-floci"
  image_tag_mutability = "MUTABLE"
}

resource "aws_ecr_repository" "frontend" {
  name                 = "datavault-frontend-floci"
  image_tag_mutability = "MUTABLE"
}

resource "aws_ecr_lifecycle_policy" "backend" {
  repository = aws_ecr_repository.backend.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 10 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}

# ── S3 ─────────────────────────────────────────────────────────────────────────
resource "aws_s3_bucket" "frontend" {
  bucket        = "datavault-frontend-floci"
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket                  = aws_s3_bucket.frontend.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ── IAM Roles ──────────────────────────────────────────────────────────────────
resource "aws_iam_role" "ecs_execution_role" {
  name = "datavault-ecs-exec-role-floci"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role" "github_actions" {
  name = "datavault-github-actions-floci"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "github_actions" {
  name = "datavault-ci-policy-floci"
  role = aws_iam_role.github_actions.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ecr:GetAuthorizationToken", "ecr:BatchCheckLayerAvailability", "ecr:PutImage", "ecr:InitiateLayerUpload", "ecr:UploadLayerPart", "ecr:CompleteLayerUpload", "ecr:DescribeRepositories"]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["ecs:RegisterTaskDefinition", "ecs:UpdateService", "ecs:DescribeServices", "ecs:DescribeTaskDefinition"]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:ListBucket"]
        Resource = ["${aws_s3_bucket.frontend.arn}", "${aws_s3_bucket.frontend.arn}/*"]
      }
    ]
  })
}

# ── SSM Parameters ─────────────────────────────────────────────────────────────
resource "random_password" "secret_key" {
  length  = 32
  special = false
}

resource "aws_ssm_parameter" "database_url" {
  name  = "/datavault/floci/database_url"
  type  = "SecureString"
  value = "postgresql+asyncpg://dev:dev@localhost:5432/datavault"
}

resource "aws_ssm_parameter" "secret_key" {
  name  = "/datavault/floci/secret_key"
  type  = "SecureString"
  value = random_password.secret_key.result
}

# ── CloudWatch Logs ─────────────────────────────────────────────────────────────
resource "aws_cloudwatch_log_group" "backend" {
  name              = "/ecs/datavault-backend-floci"
  retention_in_days = 30
}

# ── ECS ────────────────────────────────────────────────────────────────────────
resource "aws_ecs_cluster" "main" {
  name = "datavault-floci"
}

resource "aws_ecs_task_definition" "backend" {
  family                   = "datavault-backend-floci"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.ecs_execution_role.arn

  container_definitions = jsonencode([{
    name  = "backend"
    image = "${aws_ecr_repository.backend.repository_url}:latest"
    portMappings = [{ containerPort = 8000, protocol = "tcp" }]
    environment = [
      { name = "ALLOWED_ORIGINS", value = "http://localhost:5173" }
    ]
    secrets = [
      { name = "DATABASE_URL", valueFrom = aws_ssm_parameter.database_url.arn },
      { name = "SECRET_KEY",   valueFrom = aws_ssm_parameter.secret_key.arn },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.backend.name
        "awslogs-region"        = "us-east-1"
        "awslogs-stream-prefix" = "ecs"
      }
    }
  }])
}

# ── Outputs ────────────────────────────────────────────────────────────────────
output "ecr_backend_url" {
  value = aws_ecr_repository.backend.repository_url
}

output "ecr_frontend_url" {
  value = aws_ecr_repository.frontend.repository_url
}

output "s3_bucket" {
  value = aws_s3_bucket.frontend.id
}

output "ecs_cluster" {
  value = aws_ecs_cluster.main.name
}

output "ssm_database_url" {
  value = aws_ssm_parameter.database_url.arn
}

output "task_definition_arn" {
  value = aws_ecs_task_definition.backend.arn
}
