Despliega la infraestructura DataVault en AWS con Terraform y muestra los secrets/variables de GitHub necesarios.

## Pasos

1. Verificar que AWS CLI y Terraform estén disponibles
2. Ejecutar `terraform apply` desde `.github/workflows/`
3. Leer outputs de Terraform
4. Imprimir los secrets y variables de GitHub a configurar

```bash
# Verificar herramientas
which aws terraform 2>/dev/null || { echo "ERROR: aws o terraform no encontrado en PATH"; exit 1; }

cd .github/workflows

echo "=== Inicializando Terraform ==="
terraform init

echo ""
echo "=== Aplicando infraestructura (puede tardar 5-10 min) ==="
terraform apply -auto-approve

echo ""
echo "=== Leyendo outputs ==="
CLOUDFRONT_DOMAIN=$(terraform output -raw cloudfront_domain_name 2>/dev/null || echo "N/A")
ROLE_ARN=$(terraform output -raw github_actions_role_arn 2>/dev/null || echo "N/A")
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "N/A")

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║           GITHUB SECRETS Y VARIABLES A CONFIGURAR               ║"
echo "║   Settings → Secrets and variables → Actions → Environments     ║"
echo "╠══════════════════════════════════════════════════════════════════╣"
echo "║                                                                  ║"
echo "║  ENVIRONMENT: staging                                            ║"
echo "║                                                                  ║"
echo "║  SECRETS (Settings > Secrets > Environment secrets):            ║"
echo "║  ┌─────────────────────────┬──────────────────────────────────┐ ║"
echo "║  │ AWS_ROLE_ARN_STAGING    │ $ROLE_ARN"
echo "║  └─────────────────────────┴──────────────────────────────────┘ ║"
echo "║                                                                  ║"
echo "║  VARIABLES (Settings > Variables > Environment variables):      ║"
echo "║  ┌─────────────────────────┬──────────────────────────────────┐ ║"
echo "║  │ VITE_API_URL            │ https://$CLOUDFRONT_DOMAIN"
echo "║  │ VITE_WS_URL             │ wss://$CLOUDFRONT_DOMAIN"
echo "║  │ AWS_REGION              │ us-east-1                        │ ║"
echo "║  └─────────────────────────┴──────────────────────────────────┘ ║"
echo "║                                                                  ║"
echo "║  URL DE LA APP: https://$CLOUDFRONT_DOMAIN"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
echo "NOTA: Los secrets de base de datos ya están en AWS SSM Parameter Store."
echo "No necesitas pasarlos a GitHub — ECS los inyecta directamente."
```
