Prueba la infraestructura AWS del proyecto DataVault contra Floci (emulador local de AWS).
Verifica ECR, S3, ECS, SSM, IAM y Terraform sin gastar dinero en AWS real.

Uso: /probar-en-floci

## Pasos

### 1. Verificar / levantar Floci

```powershell
Write-Host "=== Verificando Floci ==="
$running = wsl docker ps --format "{{.Names}}" 2>&1 | Select-String "^floci$"
if (-not $running) {
    Write-Host "  Floci no está corriendo. Iniciando..."
    wsl docker run -d --name floci -p 4566:4566 -v /var/run/docker.sock:/var/run/docker.sock floci/floci:latest 2>&1 | Out-Null
    Start-Sleep -Seconds 5
    Write-Host "  Floci iniciado."
} else {
    Write-Host "  Floci ya está corriendo."
}

$ecrReg = wsl docker ps --format "{{.Names}}" 2>&1 | Select-String "floci-ecr-registry"
if ($ecrReg) {
    Write-Host "  ECR registry en localhost:5100 — OK"
} else {
    Write-Host "  WARN: floci-ecr-registry no está corriendo (ECR push no disponible)"
}
```

### 2. Configurar credenciales locales

```powershell
$env:AWS_ACCESS_KEY_ID     = "test"
$env:AWS_SECRET_ACCESS_KEY = "test"
$env:AWS_DEFAULT_REGION    = "us-east-1"
$ep = "http://localhost:4566"
Write-Host "  Credenciales configuradas (test/test → localhost:4566)"
```

### 3. Test ECR — autenticación y push de imagen

```powershell
Write-Host ""
Write-Host "=== [1/5] ECR: push de imagen ==="

# Autenticar Docker con el registry local
$loginPwd = aws --endpoint-url=$ep ecr get-login-password 2>&1
$loginResult = $loginPwd | wsl docker login --username AWS --password-stdin localhost:5100 2>&1
if ($loginResult -match "Login Succeeded") {
    Write-Host "  Auth ECR OK"
} else {
    Write-Host "  WARN: Auth ECR falló — $loginResult"
}

# Crear repo si no existe
aws --endpoint-url=$ep ecr create-repository --repository-name datavault-backend 2>&1 | Out-Null
aws --endpoint-url=$ep ecr create-repository --repository-name datavault-frontend 2>&1 | Out-Null

# Tag y push
$images = wsl docker images --format "{{.Repository}}" 2>&1
if ($images -match "datavault-backend") {
    wsl docker tag datavault-backend:latest localhost:5100/datavault-backend:latest 2>&1 | Out-Null
    $push = wsl docker push localhost:5100/datavault-backend:latest 2>&1 | Select-Object -Last 2
    Write-Host "  Push backend: $push"
} else {
    Write-Host "  SKIP — imagen datavault-backend no encontrada (ejecuta /datavault-start primero)"
}

if ($images -match "datavault-frontend") {
    wsl docker tag datavault-frontend:latest localhost:5100/datavault-frontend:latest 2>&1 | Out-Null
    $push = wsl docker push localhost:5100/datavault-frontend:latest 2>&1 | Select-Object -Last 2
    Write-Host "  Push frontend: $push"
}
```

### 4. Test S3 — sync del frontend

```powershell
Write-Host ""
Write-Host "=== [2/5] S3: deploy del frontend ==="

aws --endpoint-url=$ep s3 mb s3://datavault-frontend-floci 2>&1 | Out-Null

$distPath = "datavault/frontend/dist"
if (Test-Path $distPath) {
    $sync = aws --endpoint-url=$ep s3 sync $distPath s3://datavault-frontend-floci --delete 2>&1 | Select-Object -Last 3
    $count = (aws --endpoint-url=$ep s3 ls s3://datavault-frontend-floci --recursive 2>&1 | Measure-Object -Line).Lines
    Write-Host "  Sync OK — $count archivos en s3://datavault-frontend-floci"
} else {
    Write-Host "  SKIP — dist/ no existe. Ejecuta 'npm run build' en datavault/frontend/ primero."
}
```

### 5. Test ECS — cluster, task definition y service

```powershell
Write-Host ""
Write-Host "=== [3/5] ECS: cluster y servicio ==="

# Crear cluster
aws --endpoint-url=$ep ecs create-cluster --cluster-name datavault-floci 2>&1 | Out-Null

# Registrar task definition
$td = aws --endpoint-url=$ep ecs register-task-definition `
  --family datavault-backend-floci `
  --requires-compatibilities FARGATE `
  --network-mode awsvpc `
  --cpu 512 --memory 1024 `
  --container-definitions '[{"name":"backend","image":"localhost:5100/datavault-backend:latest","portMappings":[{"containerPort":8000}]}]' `
  2>&1 | Select-String "taskDefinitionArn" | Select-Object -First 1
Write-Host "  Task definition: $td"

# Crear/actualizar servicio
aws --endpoint-url=$ep ecs create-service `
  --cluster datavault-floci `
  --service-name datavault-backend `
  --task-definition datavault-backend-floci `
  --desired-count 1 `
  --launch-type FARGATE `
  --network-configuration "awsvpcConfiguration={subnets=[subnet-test],securityGroups=[sg-test],assignPublicIp=ENABLED}" `
  2>&1 | Out-Null

$svc = aws --endpoint-url=$ep ecs describe-services `
  --cluster datavault-floci `
  --services datavault-backend `
  --query "services[0].status" --output text 2>&1
Write-Host "  Servicio status: $svc"
Write-Host "  NOTA: ECS en Floci no ejecuta contenedores reales (es un emulador de API)"
```

### 6. Test SSM — parámetros seguros

```powershell
Write-Host ""
Write-Host "=== [4/5] SSM: parámetros de configuración ==="

aws --endpoint-url=$ep ssm put-parameter `
  --name "/datavault/floci/database_url" `
  --value "postgresql+asyncpg://dev:dev@localhost:5432/datavault" `
  --type SecureString --overwrite 2>&1 | Out-Null

aws --endpoint-url=$ep ssm put-parameter `
  --name "/datavault/floci/secret_key" `
  --value "floci-test-secret-key-32chars-ok!" `
  --type SecureString --overwrite 2>&1 | Out-Null

$params = aws --endpoint-url=$ep ssm get-parameters `
  --names "/datavault/floci/database_url" "/datavault/floci/secret_key" `
  --with-decryption --query "Parameters[*].Name" --output text 2>&1
Write-Host "  Parámetros leídos: $params"
```

### 7. Test Terraform

```powershell
Write-Host ""
Write-Host "=== [5/5] Terraform apply ==="

$flociTfPath = "terraform/floci"
if (Test-Path $flociTfPath) {
    Push-Location $flociTfPath
    $init = terraform init -reconfigure -no-color 2>&1 | Select-Object -Last 2
    Write-Host "  Init: $init"
    $plan = terraform plan -no-color 2>&1 | Select-Object -Last 5
    Write-Host "  Plan:`n$plan"
    $apply = terraform apply -auto-approve -no-color 2>&1 | Select-Object -Last 8
    Write-Host "  Apply:`n$apply"
    Pop-Location
} else {
    Write-Host "  SKIP — terraform/floci/ no existe"
}
```

### 8. Resumen final

```powershell
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════╗"
Write-Host "║             PRUEBA FLOCI — RESULTADO FINAL                  ║"
Write-Host "╠══════════════════════════════════════════════════════════════╣"
Write-Host "║  ECR push       → localhost:5100                            ║"
Write-Host "║  S3 frontend    → s3://datavault-frontend-floci             ║"
Write-Host "║  ECS cluster    → datavault-floci (API only, sin Fargate)   ║"
Write-Host "║  SSM params     → /datavault/floci/*                        ║"
Write-Host "║  Terraform      → terraform/floci/                          ║"
Write-Host "╠══════════════════════════════════════════════════════════════╣"
Write-Host "║  App real:      → http://localhost:8000 (docker-compose)    ║"
Write-Host "║  Floci endpoint → http://localhost:4566                     ║"
Write-Host "╚══════════════════════════════════════════════════════════════╝"
```
