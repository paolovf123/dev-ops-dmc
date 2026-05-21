Despliega la aplicación DataVault en AWS de forma manual, sin depender de CodePipeline.
Realiza: build Docker → push ECR → frontend S3 → migración Alembic → deploy ECS.

Uso: /datavault-aws-deploy [staging|prod]
Si no se especifica entorno, preguntar al usuario.

## Pasos

### 0. Determinar entorno

Leer $ARGUMENTS. Si contiene "prod", usar `ENVIRONMENT=prod`. Si contiene "staging", usar `ENVIRONMENT=staging`.
Si $ARGUMENTS está vacío, preguntar al usuario qué entorno desea desplegar y esperar respuesta antes de continuar.

### 1. Verificar prerrequisitos

```bash
echo "=== Verificando prerrequisitos ==="
for cmd in aws docker jq terraform; do
  if ! command -v $cmd >/dev/null 2>&1; then
    echo "ERROR: '$cmd' no encontrado en PATH. Instálalo antes de continuar."
    exit 1
  fi
done

aws sts get-caller-identity --query "Account" --output text >/dev/null 2>&1 \
  || { echo "ERROR: AWS CLI no autenticado. Ejecuta 'aws configure' o configura las credenciales."; exit 1; }

docker info >/dev/null 2>&1 \
  || { echo "ERROR: Docker no está corriendo. Inicia Docker Desktop."; exit 1; }

echo "OK — AWS account: $(aws sts get-caller-identity --query Account --output text)"
echo "OK — Región: ${AWS_DEFAULT_REGION:-us-east-1}"
```

### 2. Leer outputs de Terraform

```bash
echo ""
echo "=== Leyendo infraestructura (Terraform outputs) ==="
cd terraform

terraform init -reconfigure -input=false -no-color 2>&1 | tail -5

ECR_BACKEND_URL=$(terraform output -raw ecr_backend_url 2>/dev/null)
ECS_CLUSTER=$(terraform output -raw ecs_cluster_name 2>/dev/null)
ECS_SERVICE=$(terraform output -raw ecs_service_name 2>/dev/null)
TASK_DEF_FAMILY=$(terraform output -raw task_definition_family 2>/dev/null)
FRONTEND_BUCKET=$(terraform output -raw frontend_bucket 2>/dev/null)
CLOUDFRONT_DIST_ID=$(terraform output -raw cloudfront_distribution_id 2>/dev/null)
CLOUDFRONT_DOMAIN=$(terraform output -raw cloudfront_domain_name 2>/dev/null)

if [ -z "$ECR_BACKEND_URL" ]; then
  echo ""
  echo "ADVERTENCIA: No se pudo leer los outputs de Terraform."
  echo "Asegúrate de haber ejecutado 'terraform apply' con -var=\"environment=$ENVIRONMENT\"."
  echo "O ejecuta primero: /datavault-aws-up"
  exit 1
fi

echo "  ECR Backend:   $ECR_BACKEND_URL"
echo "  ECS Cluster:   $ECS_CLUSTER"
echo "  ECS Service:   $ECS_SERVICE"
echo "  Task Family:   $TASK_DEF_FAMILY"
echo "  S3 Frontend:   $FRONTEND_BUCKET"
echo "  CloudFront ID: $CLOUDFRONT_DIST_ID"
cd ..
```

### 3. Build y push de la imagen backend

```bash
echo ""
echo "=== [1/4] Build Backend → ECR ==="
IMAGE_TAG=$(git rev-parse --short=12 HEAD 2>/dev/null || date +%Y%m%d%H%M%S)
ECR_REGISTRY=$(echo $ECR_BACKEND_URL | cut -d/ -f1)
AWS_REGION="${AWS_DEFAULT_REGION:-us-east-1}"

echo "  Tag: $IMAGE_TAG"

aws ecr get-login-password --region $AWS_REGION \
  | docker login --username AWS --password-stdin $ECR_REGISTRY \
  || { echo "ERROR: No se pudo autenticar en ECR."; exit 1; }

docker build -f datavault/backend/Dockerfile.prod \
  -t $ECR_BACKEND_URL:$IMAGE_TAG \
  -t $ECR_BACKEND_URL:latest \
  datavault/backend/ \
  || { echo "ERROR: docker build falló."; exit 1; }

docker push $ECR_BACKEND_URL --all-tags \
  || { echo "ERROR: docker push falló."; exit 1; }

echo "  Push OK → $ECR_BACKEND_URL:$IMAGE_TAG"
```

### 4. Build y deploy del frontend

```bash
echo ""
echo "=== [2/4] Build Frontend → S3 ==="

if [ -z "$FRONTEND_BUCKET" ]; then
  echo "  SKIP — No se encontró FRONTEND_BUCKET en los outputs de Terraform."
else
  VITE_API_URL="https://$CLOUDFRONT_DOMAIN"
  VITE_WS_URL="wss://$CLOUDFRONT_DOMAIN/ws"

  cd datavault/frontend
  VITE_API_URL=$VITE_API_URL VITE_WS_URL=$VITE_WS_URL npm ci --silent \
    || { echo "ERROR: npm ci falló."; exit 1; }
  VITE_API_URL=$VITE_API_URL VITE_WS_URL=$VITE_WS_URL npm run build \
    || { echo "ERROR: npm run build falló."; exit 1; }

  aws s3 sync dist/ s3://$FRONTEND_BUCKET --delete --quiet \
    || { echo "ERROR: s3 sync falló."; exit 1; }

  aws cloudfront create-invalidation \
    --distribution-id $CLOUDFRONT_DIST_ID \
    --paths "/*" \
    --no-cli-pager \
    || echo "WARN: CloudFront invalidation falló (no crítico)."

  cd ../..
  echo "  Frontend sincronizado → s3://$FRONTEND_BUCKET"
fi
```

### 5. Migración Alembic vía ECS run-task

```bash
echo ""
echo "=== [3/4] Migración Alembic (ECS run-task) ==="

CURRENT_TASK=$(aws ecs describe-task-definition \
  --task-definition $TASK_DEF_FAMILY \
  --query 'taskDefinition' --output json)

NEW_TASK=$(echo "$CURRENT_TASK" | jq \
  --arg IMG "$ECR_BACKEND_URL:latest" \
  --arg CTR "backend" \
  '(.containerDefinitions[] | select(.name==$CTR) | .image) |= $IMG |
   del(.taskDefinitionArn,.revision,.status,.requiresAttributes,
       .compatibilities,.registeredAt,.registeredBy,.enableFaultInjection)')

NEW_TASK_ARN=$(aws ecs register-task-definition \
  --cli-input-json "$NEW_TASK" \
  --query 'taskDefinition.taskDefinitionArn' --output text)

echo "  Task definition: $NEW_TASK_ARN"

NET_CFG=$(aws ecs describe-services \
  --cluster $ECS_CLUSTER --services $ECS_SERVICE \
  --query 'services[0].networkConfiguration' --output json)

TASK_ARN=$(aws ecs run-task \
  --cluster $ECS_CLUSTER \
  --task-definition $NEW_TASK_ARN \
  --launch-type FARGATE \
  --network-configuration "$NET_CFG" \
  --overrides '{"containerOverrides":[{"name":"backend","command":["alembic","upgrade","head"]}]}' \
  --query 'tasks[0].taskArn' --output text) \
  || { echo "ERROR: No se pudo lanzar la tarea de migración."; exit 1; }

echo "  Esperando migración: $TASK_ARN"
aws ecs wait tasks-stopped --cluster $ECS_CLUSTER --tasks $TASK_ARN

EXIT_CODE=$(aws ecs describe-tasks \
  --cluster $ECS_CLUSTER --tasks $TASK_ARN \
  --query 'tasks[0].containers[0].exitCode' --output text)

[ "$EXIT_CODE" = "0" ] \
  || { echo "ERROR: Migración falló con exit code $EXIT_CODE"; exit 1; }

echo "  Migración OK."
```

### 6. Deploy ECS y esperar estabilidad

```bash
echo ""
echo "=== [4/4] Deploy ECS — actualizando servicio ==="

LATEST_ARN=$(aws ecs describe-task-definition \
  --task-definition $TASK_DEF_FAMILY \
  --query 'taskDefinition.taskDefinitionArn' --output text)

aws ecs update-service \
  --cluster $ECS_CLUSTER \
  --service $ECS_SERVICE \
  --task-definition $LATEST_ARN \
  --force-new-deployment \
  --no-cli-pager

echo "  Esperando estabilidad del servicio (puede tardar 2-5 min)..."
aws ecs wait services-stable \
  --cluster $ECS_CLUSTER \
  --services $ECS_SERVICE \
  || { echo "WARN: El servicio no alcanzó estabilidad. Revisa los logs en ECS."; }

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    DEPLOY COMPLETADO                        ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Entorno:   $ENVIRONMENT"
echo "║  Imagen:    $ECR_BACKEND_URL:$IMAGE_TAG"
echo "║  URL app:   https://$CLOUDFRONT_DOMAIN"
echo "║                                                              ║"
echo "║  Endpoints útiles:                                          ║"
echo "║    API docs:  https://$CLOUDFRONT_DOMAIN/docs"
echo "║    Health:    https://$CLOUDFRONT_DOMAIN/health"
echo "╚══════════════════════════════════════════════════════════════╝"
```
