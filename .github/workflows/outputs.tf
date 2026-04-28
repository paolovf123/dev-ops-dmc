output "alb_dns_name" {
  description = "El DNS público del Load Balancer (URL de tu app)"
  value       = aws_lb.main.dns_name
}

output "ecr_backend_url" {
  description = "URL del repositorio ECR del Backend"
  value       = aws_ecr_repository.backend.repository_url
}

output "cloudfront_domain_name" {
  description = "Dominio de CloudFront para acceder al Frontend"
  value       = aws_cloudfront_distribution.frontend.domain_name
}

output "frontend_bucket_name" {
  description = "Nombre del bucket S3 del frontend"
  value       = aws_s3_bucket.frontend.id
}

output "rds_endpoint" {
  description = "Endpoint de la base de datos RDS"
  value       = aws_db_instance.postgres.endpoint
}

# OPTIMIZADO: Redis desactivado. Descomentar para producción junto con ElastiCache.
# output "redis_endpoint" {
#   description = "Endpoint del cluster de Redis"
#   value       = aws_elasticache_cluster.redis.cache_nodes[0].address
# }