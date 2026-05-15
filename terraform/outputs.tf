output "cloudfront_url" {
  description = "URL pública del frontend (CloudFront)"
  value       = "https://${aws_cloudfront_distribution.frontend.domain_name}"
}

output "alb_dns_name" {
  description = "DNS del Load Balancer (backend directo, sin CloudFront)"
  value       = aws_lb.main.dns_name
}

output "ecr_backend_url" {
  description = "URL del repositorio ECR del backend"
  value       = aws_ecr_repository.backend.repository_url
}

output "frontend_bucket_name" {
  description = "Nombre del bucket S3 del frontend"
  value       = aws_s3_bucket.frontend.id
}

output "cloudfront_distribution_id" {
  description = "ID de la distribución CloudFront (para invalidaciones en CI/CD)"
  value       = aws_cloudfront_distribution.frontend.id
}

output "rds_endpoint" {
  description = "Endpoint de RDS PostgreSQL"
  value       = aws_db_instance.postgres.endpoint
  sensitive   = true
}

output "github_actions_role_arn" {
  description = "ARN del rol IAM para configurar en GitHub Secrets (AWS_ROLE_ARN_STAGING / AWS_ROLE_ARN_PROD)"
  value       = aws_iam_role.github_actions.arn
}

output "ecs_cluster_name" {
  description = "Nombre del cluster ECS"
  value       = aws_ecs_cluster.main.name
}

output "codepipeline_name" {
  description = "Nombre del pipeline CodePipeline (alternativa AWS-nativa a GitHub Actions)"
  value       = aws_codepipeline.main.name
}

output "codestar_connection_arn" {
  description = "ARN de la conexión GitHub. IMPORTANTE: activar manualmente en AWS Console → Developer Tools → Connections"
  value       = aws_codestarconnections_connection.github.arn
}
