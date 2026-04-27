variable "aws_region" {
  description = "Región de AWS"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Entorno (staging o prod)"
  type        = string
  default     = "staging"
}

variable "db_user" {
  description = "Usuario maestro de RDS"
  type        = string
  default     = "dev"
}

variable "db_password" {
  description = "Contraseña maestra de RDS"
  type        = string
  sensitive   = true
}

variable "db_name" {
  description = "Nombre de la base de datos"
  type        = string
  default     = "datavault"
}

variable "redis_node_type" {
  description = "Tipo de instancia para ElastiCache Redis"
  type        = string
  default     = "cache.t4g.micro"
}

variable "backend_domain" {
  description = "Dominio para el backend (ej. api.midominio.com). Deja en blanco para usar HTTP (solo pruebas)."
  type        = string
  default     = ""
}

variable "route53_zone_name" {
  description = "Nombre de la zona alojada en Route53 (ej. midominio.com)."
  type        = string
  default     = ""
}