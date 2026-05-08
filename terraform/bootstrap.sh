#!/bin/bash
# Crea el bucket S3 para el estado de Terraform.
# Ejecutar UNA SOLA VEZ antes del primer `terraform init`.
# Requiere: AWS CLI configurado con permisos suficientes.

set -euo pipefail

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
BUCKET="datavault-tfstate-${ACCOUNT_ID}"
REGION="${AWS_REGION:-us-east-1}"

echo "Creando bucket de estado: s3://$BUCKET (región: $REGION)"

if aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  echo "El bucket ya existe, no se hace nada."
else
  if [ "$REGION" = "us-east-1" ]; then
    aws s3api create-bucket --bucket "$BUCKET" --region "$REGION"
  else
    aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" \
      --create-bucket-configuration LocationConstraint="$REGION"
  fi

  # Versionado — permite rollback del estado
  aws s3api put-bucket-versioning --bucket "$BUCKET" \
    --versioning-configuration Status=Enabled

  # Bloquear acceso público
  aws s3api put-public-access-block --bucket "$BUCKET" \
    --public-access-block-configuration \
      BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

  echo "Bucket creado y configurado."
fi

echo ""
echo "Actualiza terraform/main.tf si el bucket difiere del hardcodeado:"
echo "  bucket = \"$BUCKET\""
