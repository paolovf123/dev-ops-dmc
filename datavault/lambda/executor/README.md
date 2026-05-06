# DataVault Lambda Executor

Función Lambda que ejecuta código Python del usuario en un entorno aislado.

## Deploy

```bash
# 1. Build imagen
docker build -t datavault-executor .

# 2. Tag y push a ECR
aws ecr create-repository --repository-name datavault-executor --region us-east-1
aws ecr get-login-password | docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com
docker tag datavault-executor:latest <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/datavault-executor:latest
docker push <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/datavault-executor:latest

# 3. Crear función Lambda
aws lambda create-function \
  --function-name datavault-executor \
  --package-type Image \
  --code ImageUri=<ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/datavault-executor:latest \
  --role arn:aws:iam::<ACCOUNT_ID>:role/lambda-executor-role \
  --timeout 60 \
  --memory-size 1024

# 4. Agregar variable de entorno al backend ECS
# LAMBDA_EXECUTOR_ARN=arn:aws:lambda:us-east-1:<ACCOUNT_ID>:function:datavault-executor
```

## Permisos IAM necesarios

El rol del ECS task necesita:
```json
{
  "Effect": "Allow",
  "Action": ["lambda:InvokeFunction"],
  "Resource": "arn:aws:lambda:us-east-1:*:function:datavault-executor"
}
```

## Paquetes disponibles en el sandbox

- pandas, numpy, scipy, scikit-learn, openpyxl

## Ejemplo de código

```python
# 'pedidos' y 'productos' son DataFrames con los registros de esos datasets
# La columna especial '__id__' contiene el UUID del record

result = pedidos.merge(
    productos,
    left_on='id_producto',
    right_on='__id__',
    how='left'
)

result = result.groupby('categoria').agg({
    'total': 'sum',
    'cantidad': 'count'
}).reset_index()

result.columns = ['Categoria', 'Total ventas', 'Num pedidos']
# Asignar a 'result' — el backend lo persiste como nuevo dataset
```
