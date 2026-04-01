# DevOps DMC - AWS & Databricks

Proyecto de infraestructura y automatizacion para la gestion de pipelines de datos y servicios en la nube, utilizando AWS como proveedor cloud y Databricks como plataforma de procesamiento y analitica de datos.

## Alcances del Proyecto

### Infraestructura como Codigo (IaC)
- Provision y gestion de recursos AWS con Terraform
- Configuracion de workspaces de Databricks
- Gestion de networking (VPCs, subnets, security groups)
- Administracion de permisos y roles IAM

### CI/CD Pipelines
- Automatizacion de despliegues de notebooks y jobs en Databricks
- Pipelines de integracion continua para validacion de codigo
- Despliegue automatizado de infraestructura en multiples ambientes (dev, staging, prod)
- Versionamiento y promocion de artefactos

### Orquestacion de Datos
- Configuracion de Databricks Workflows y Jobs
- Integracion con servicios AWS (S3, Glue, Redshift, Lambda)
- Gestion de clusters y pools de Databricks
- Automatizacion de pipelines ETL/ELT

### Monitoreo y Observabilidad
- Configuracion de CloudWatch para metricas y alarmas
- Logging centralizado de pipelines y servicios
- Dashboards de estado de infraestructura y jobs
- Alertas y notificaciones ante fallos

### Seguridad y Gobernanza
- Gestion de secretos con AWS Secrets Manager
- Politicas de acceso y control de datos (Unity Catalog)
- Cifrado de datos en reposo y en transito
- Cumplimiento de politicas de seguridad corporativas

### Gestion de Ambientes
- Ambientes aislados: desarrollo, staging, produccion
- Estrategia de branching alineada a cada ambiente
- Parametrizacion por ambiente (variables, configuraciones)

## Estructura del Proyecto

```
dev_ops_dmc/
├── terraform/          # Modulos y configuracion de infraestructura
├── pipelines/          # Definiciones de CI/CD
├── notebooks/          # Notebooks de Databricks
├── scripts/            # Scripts de automatizacion y utilidades
├── monitoring/         # Configuracion de alertas y dashboards
├── docs/               # Documentacion del proyecto
├── .gitignore
└── README.md
```

## Tecnologias

- **Cloud:** AWS (S3, IAM, VPC, Lambda, CloudWatch, Secrets Manager)
- **Data Platform:** Databricks (Workflows, Unity Catalog, Delta Lake)
- **IaC:** Terraform
- **CI/CD:** GitHub Actions
- **Lenguajes:** Python, SQL, HCL
