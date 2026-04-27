terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Project     = "DataVault"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

data "aws_availability_zones" "available" {}
data "aws_caller_identity" "current" {}

# ------------------------------------------------------------------------------
# VPC y Redes
# ------------------------------------------------------------------------------
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "datavault-vpc-${var.environment}"
  cidr = "10.0.0.0/16"

  azs             = slice(data.aws_availability_zones.available.names, 0, 2)
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24"]

  enable_nat_gateway   = true
  single_nat_gateway   = true
  enable_dns_hostnames = true
}

# ------------------------------------------------------------------------------
# Security Groups
# ------------------------------------------------------------------------------
resource "aws_security_group" "alb" {
  name        = "datavault-alb-sg-${var.environment}"
  description = "Permitir trafico web al ALB"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description = "HTTP Frontend"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS Backend"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTP Backend (API & WS)"
    from_port   = 8000
    to_port     = 8000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "ecs" {
  name        = "datavault-ecs-sg-${var.environment}"
  description = "Permitir trafico desde el ALB hacia ECS"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port       = 80
    to_port         = 80
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  ingress {
    from_port       = 8000
    to_port         = 8000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "rds" {
  name        = "datavault-rds-sg-${var.environment}"
  description = "Permitir trafico de DB solo desde ECS"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }
}

resource "aws_security_group" "redis" {
  name        = "datavault-redis-sg-${var.environment}"
  description = "Permitir trafico de Redis solo desde ECS"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }
}

# ------------------------------------------------------------------------------
# Repositorios ECR (Listos para el pipeline CI/CD)
# ------------------------------------------------------------------------------
resource "aws_ecr_repository" "backend" {
  name                 = "datavault-backend-${var.environment}"
  image_tag_mutability = "MUTABLE"
  force_destroy        = true
}

# ------------------------------------------------------------------------------
# S3 + CloudFront (Frontend)
# ------------------------------------------------------------------------------
resource "aws_s3_bucket" "frontend" {
  # Agregamos el account_id para asegurar que el bucket sea único a nivel global
  bucket        = "datavault-frontend-${var.environment}-${data.aws_caller_identity.current.account_id}"
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket                  = aws_s3_bucket.frontend.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "datavault-frontend-oac-${var.environment}"
  description                       = "OAC for DataVault frontend"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"

  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "S3-frontend"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-frontend"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 3600
    max_ttl                = 86400
  }

  # SPA Fallback (React Router)
  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }
  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.frontend.arn}/*"
      Condition = {
        StringEquals = {
          "AWS:SourceArn" = aws_cloudfront_distribution.frontend.arn
        }
      }
    }]
  })
}


# ------------------------------------------------------------------------------
# Base de Datos PostgreSQL (RDS)
# ------------------------------------------------------------------------------
resource "aws_db_subnet_group" "main" {
  name       = "datavault-db-subnet-group-${var.environment}"
  subnet_ids = module.vpc.private_subnets
}

resource "aws_db_instance" "postgres" {
  identifier             = "datavault-db-${var.environment}"
  engine                 = "postgres"
  engine_version         = "16"
  instance_class         = "db.t4g.micro"
  allocated_storage      = 20
  db_name                = var.db_name
  username               = var.db_user
  password               = var.db_password
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  skip_final_snapshot    = true
  publicly_accessible    = false
}

# ------------------------------------------------------------------------------
# Redis (ElastiCache) para WebSockets y Rate Limiting
# ------------------------------------------------------------------------------
resource "aws_elasticache_subnet_group" "redis" {
  name       = "datavault-redis-subnet-group-${var.environment}"
  subnet_ids = module.vpc.private_subnets
}

resource "aws_elasticache_cluster" "redis" {
  cluster_id           = "datavault-redis-${var.environment}"
  engine               = "redis"
  node_type            = var.redis_node_type
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7"
  engine_version       = "7.1"
  port                 = 6379
  subnet_group_name    = aws_elasticache_subnet_group.redis.name
  security_group_ids   = [aws_security_group.redis.id]
}

# ------------------------------------------------------------------------------
# Load Balancer (ALB) y Target Groups
# ------------------------------------------------------------------------------
resource "aws_lb" "main" {
  name               = "datavault-alb-${var.environment}"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = module.vpc.public_subnets
}

# Target Group Backend (FastAPI)
resource "aws_lb_target_group" "backend" {
  name        = "datavault-tg-back-${var.environment}"
  port        = 8000
  protocol    = "HTTP"
  vpc_id      = module.vpc.vpc_id
  target_type = "ip"
  health_check {
    path = "/health"
  }
}

resource "aws_lb_listener" "backend_80" {
  load_balancer_arn = aws_lb.main.arn
  port              = "80"
  protocol          = "HTTP"

  dynamic "default_action" {
    for_each = var.backend_domain != "" ? [1] : []
    content {
      type = "redirect"
      redirect {
        port        = "443"
        protocol    = "HTTPS"
        status_code = "HTTP_301"
      }
    }
  }

  dynamic "default_action" {
    for_each = var.backend_domain == "" ? [1] : []
    content {
      type             = "forward"
      target_group_arn = aws_lb_target_group.backend.arn
    }
  }
}

# ------------------------------------------------------------------------------
# SSL Certificate & HTTPS Listener (Backend)
# ------------------------------------------------------------------------------
data "aws_route53_zone" "main" {
  count = var.backend_domain != "" ? 1 : 0
  name  = var.route53_zone_name
}

resource "aws_acm_certificate" "backend" {
  count             = var.backend_domain != "" ? 1 : 0
  domain_name       = var.backend_domain
  validation_method = "DNS"
  lifecycle { create_before_destroy = true }
}

resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in try(aws_acm_certificate.backend[0].domain_validation_options, []) : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }
  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = data.aws_route53_zone.main[0].zone_id
}

resource "aws_acm_certificate_validation" "backend" {
  count                   = var.backend_domain != "" ? 1 : 0
  certificate_arn         = aws_acm_certificate.backend[0].arn
  validation_record_fqdns = [for record in aws_route53_record.cert_validation : record.fqdn]
}

resource "aws_lb_listener" "backend_443" {
  count             = var.backend_domain != "" ? 1 : 0
  load_balancer_arn = aws_lb.main.arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-2016-08"
  certificate_arn   = aws_acm_certificate_validation.backend[0].certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend.arn
  }
}

# ------------------------------------------------------------------------------
# SSM Parameter Store (Secretos)
# ------------------------------------------------------------------------------
resource "random_password" "secret_key" {
  length  = 32
  special = false
}

resource "aws_ssm_parameter" "database_url" {
  name        = "/datavault/${var.environment}/database_url"
  description = "URL de conexion a la base de datos"
  type        = "SecureString"
  value       = "postgresql+asyncpg://${var.db_user}:${var.db_password}@${aws_db_instance.postgres.endpoint}/${var.db_name}"
}

resource "aws_ssm_parameter" "secret_key" {
  name        = "/datavault/${var.environment}/secret_key"
  description = "Secret Key para JWT"
  type        = "SecureString"
  value       = random_password.secret_key.result
}

# ------------------------------------------------------------------------------
# IAM Roles para ECS
# ------------------------------------------------------------------------------
resource "aws_iam_role" "ecs_execution_role" {
  name = "datavault-ecs-exec-role-${var.environment}"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_execution_role_policy" {
  role       = aws_iam_role.ecs_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "ecs_execution_ssm_policy" {
  name = "datavault-ecs-exec-ssm-policy-${var.environment}"
  role = aws_iam_role.ecs_execution_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = ["ssm:GetParameters"]
      Resource = [
        aws_ssm_parameter.database_url.arn,
        aws_ssm_parameter.secret_key.arn
      ]
    }]
  })
}

# ------------------------------------------------------------------------------
# CloudWatch Logs
# ------------------------------------------------------------------------------
resource "aws_cloudwatch_log_group" "backend" {
  name              = "/ecs/datavault-backend-${var.environment}"
  retention_in_days = 30
}

# ------------------------------------------------------------------------------
# ECS Cluster, Task Definitions y Services (Fargate)
# ------------------------------------------------------------------------------
resource "aws_ecs_cluster" "main" {
  name = "datavault-${var.environment}"
}

resource "aws_ecs_task_definition" "backend" {
  family                   = "datavault-backend-${var.environment}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.ecs_execution_role.arn

  container_definitions = jsonencode([{
    name  = "backend"
    image = "python:3.11-slim" # Placeholder temporal. CI/CD actualizará esto
    portMappings = [{ containerPort = 8000 }]
    environment = [
      { name = "REDIS_URL", value = "redis://${aws_elasticache_cluster.redis.cache_nodes[0].address}:6379/0" },
      { name = "ALLOWED_ORIGINS", value = "https://${aws_cloudfront_distribution.frontend.domain_name}" }
    ]
    secrets = [
      { name = "DATABASE_URL", valueFrom = aws_ssm_parameter.database_url.arn },
      { name = "SECRET_KEY", valueFrom = aws_ssm_parameter.secret_key.arn }
    ]
  }])
}

resource "aws_ecs_service" "backend" {
  name            = "datavault-backend"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.backend.arn
  launch_type     = "FARGATE"
  desired_count   = 1 # Sube esto para alta disponibilidad

  network_configuration {
    subnets          = module.vpc.private_subnets
    security_groups  = [aws_security_group.ecs.id]
  }
  load_balancer {
    target_group_arn = aws_lb_target_group.backend.arn
    container_name   = "backend"
    container_port   = 8000
  }
  lifecycle { ignore_changes = [task_definition, desired_count] }
}

# ------------------------------------------------------------------------------
# Alarmas de CloudWatch (Observabilidad)
# ------------------------------------------------------------------------------
resource "aws_cloudwatch_metric_alarm" "ecs_cpu_high" {
  alarm_name          = "datavault-ecs-cpu-high-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = "60"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "Esta alarma se dispara si el uso de CPU de ECS supera el 80% durante 2 minutos."

  dimensions = {
    ClusterName = aws_ecs_cluster.main.name
    ServiceName = aws_ecs_service.backend.name
  }
}

resource "aws_cloudwatch_metric_alarm" "alb_5xx_errors" {
  alarm_name          = "datavault-alb-5xx-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = "60"
  statistic           = "Sum"
  threshold           = "5"
  alarm_description   = "Alerta si el backend devuelve más de 5 errores 5xx en 1 minuto."

  dimensions = {
    TargetGroup  = aws_lb_target_group.backend.arn_suffix
    LoadBalancer = aws_lb.main.arn_suffix
  }
}

# ------------------------------------------------------------------------------
# OIDC y Roles IAM para GitHub Actions (CI/CD)
# ------------------------------------------------------------------------------

# 1. Configurar GitHub como Proveedor de Identidad en AWS
resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  # Thumbprints oficiales de GitHub Actions (AWS los requiere por Terraform)
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1", "1c58a3a8518e8759bf075b76b750d4f2df264fcd"]
}

# 2. Crear el Rol que GitHub asumirá, restringido a tu repositorio y entorno
resource "aws_iam_role" "github_actions" {
  name = "datavault-github-actions-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRoleWithWebIdentity"
      Effect = "Allow"
      Principal = {
        Federated = aws_iam_openid_connect_provider.github.arn
      }
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
        StringLike = {
          # IMPORTANTE: Reemplaza TU_USUARIO/TU_REPO por los valores reales en GitHub (ej. "paolovilcapoma/datavault")
          "token.actions.githubusercontent.com:sub" = "repo:TU_USUARIO/TU_REPO:environment:${var.environment}"
        }
      }
    }]
  })
}

# 3. Otorgar permisos al Rol para ECR y ECS
resource "aws_iam_role_policy" "github_actions_policy" {
  name = "datavault-ci-cd-policy-${var.environment}"
  role = aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken",
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:GetRepositoryPolicy",
          "ecr:DescribeRepositories",
          "ecr:ListImages",
          "ecr:DescribeImages",
          "ecr:BatchGetImage",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
          "ecr:PutImage",
          "ecs:UpdateService",
          "ecs:DescribeServices",
          "ecs:DescribeTaskDefinition",
          "ecs:RegisterTaskDefinition",
          "ecs:RunTask",
          "ecs:DescribeTasks",
          "s3:PutObject",
          "s3:ListBucket",
          "s3:DeleteObject",
          "s3:GetBucketLocation",
          "cloudfront:CreateInvalidation",
          "cloudfront:ListDistributions"
        ]
        Resource = "*"
      },
      {
        # Necesario para que ECS pueda asignar el Execution Role a las nuevas tareas
        Effect = "Allow"
        Action = "iam:PassRole"
        Resource = aws_iam_role.ecs_execution_role.arn
      }
    ]
  })
}

output "github_actions_role_arn" {
  description = "El ARN del rol para configurar en los secrets de GitHub"
  value       = aws_iam_role.github_actions.arn
}