variable "aws_region" {
  description = "Región de AWS"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Entorno: staging | prod"
  type        = string
  default     = "staging"
}

variable "db_user" {
  description = "Usuario maestro de RDS"
  type        = string
  default     = "datavault"
}

variable "db_password" {
  description = "Contraseña maestra de RDS (sensible)"
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

variable "github_owner" {
  description = "Usuario u organización de GitHub dueño del repositorio"
  type        = string
  default     = "paolovf123"
}

variable "github_repo" {
  description = "Nombre del repositorio de GitHub"
  type        = string
  default     = "dev-ops-dmc"
}
