locals {
  # staging escucha develop, prod escucha main
  pipeline_branch = var.environment == "prod" ? "main" : "develop"
}

# ── CodeStar Connection (GitHub) ──────────────────────────────────────────────
resource "aws_codestarconnections_connection" "github" {
  name          = "datavault-github-${var.environment}"
  provider_type = "GitHub"
}

# ── S3 para artefactos del pipeline ──────────────────────────────────────────
resource "aws_s3_bucket" "pipeline_artifacts" {
  bucket        = "datavault-pipeline-artifacts-${var.environment}-${data.aws_caller_identity.current.account_id}"
  force_destroy = true
}

resource "aws_s3_bucket_versioning" "pipeline_artifacts" {
  bucket = aws_s3_bucket.pipeline_artifacts.id
  versioning_configuration { status = "Enabled" }
}

# ── IAM: rol para CodeBuild ───────────────────────────────────────────────────
resource "aws_iam_role" "codebuild" {
  name = "datavault-codebuild-${var.environment}"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "codebuild.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "codebuild" {
  name = "datavault-codebuild-policy-${var.environment}"
  role = aws_iam_role.codebuild.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Logs"
        Effect = "Allow"
        Action = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "*"
      },
      {
        Sid    = "S3Artifacts"
        Effect = "Allow"
        Action = ["s3:GetObject", "s3:PutObject", "s3:GetBucketVersioning", "s3:GetBucketLocation", "s3:ListBucket"]
        Resource = [
          aws_s3_bucket.pipeline_artifacts.arn,
          "${aws_s3_bucket.pipeline_artifacts.arn}/*",
        ]
      },
      {
        Sid    = "S3Frontend"
        Effect = "Allow"
        Action = ["s3:PutObject", "s3:ListBucket", "s3:DeleteObject", "s3:GetBucketLocation"]
        Resource = [
          aws_s3_bucket.frontend.arn,
          "${aws_s3_bucket.frontend.arn}/*",
        ]
      },
      {
        Sid    = "ECR"
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken",
          "ecr:BatchCheckLayerAvailability", "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage", "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart", "ecr:CompleteLayerUpload", "ecr:PutImage"
        ]
        Resource = "*"
      },
      {
        Sid    = "ECS"
        Effect = "Allow"
        Action = [
          "ecs:DescribeServices", "ecs:DescribeTaskDefinition",
          "ecs:RegisterTaskDefinition", "ecs:RunTask",
          "ecs:DescribeTasks", "ecs:UpdateService"
        ]
        Resource = "*"
      },
      {
        Sid      = "PassECSRole"
        Effect   = "Allow"
        Action   = "iam:PassRole"
        Resource = aws_iam_role.ecs_execution_role.arn
      },
      {
        Sid      = "CloudFront"
        Effect   = "Allow"
        Action   = ["cloudfront:CreateInvalidation"]
        Resource = "*"
      },
    ]
  })
}

# ── IAM: rol para CodePipeline ────────────────────────────────────────────────
resource "aws_iam_role" "codepipeline" {
  name = "datavault-codepipeline-${var.environment}"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "codepipeline.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "codepipeline" {
  name = "datavault-codepipeline-policy-${var.environment}"
  role = aws_iam_role.codepipeline.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["s3:GetObject", "s3:PutObject", "s3:GetBucketVersioning", "s3:GetBucketLocation"]
        Resource = [
          aws_s3_bucket.pipeline_artifacts.arn,
          "${aws_s3_bucket.pipeline_artifacts.arn}/*",
        ]
      },
      {
        Effect   = "Allow"
        Action   = ["codestar-connections:UseConnection"]
        Resource = aws_codestarconnections_connection.github.arn
      },
      {
        Effect = "Allow"
        Action = ["codebuild:StartBuild", "codebuild:BatchGetBuilds"]
        Resource = "*"
      },
    ]
  })
}

# ── helpers: env vars comunes de ECS/ECR ─────────────────────────────────────
locals {
  ecs_env_vars = [
    { name = "ECR_REPOSITORY_URI", value = aws_ecr_repository.backend.repository_url },
    { name = "ECS_CLUSTER",        value = aws_ecs_cluster.main.name                 },
    { name = "ECS_SERVICE",        value = aws_ecs_service.backend.name              },
    { name = "TASK_DEF_FAMILY",    value = aws_ecs_task_definition.backend.family    },
  ]
}

# ── CodeBuild: 1 — Test (pytest + flake8) ────────────────────────────────────
resource "aws_codebuild_project" "test" {
  name          = "datavault-test-${var.environment}"
  service_role  = aws_iam_role.codebuild.arn
  build_timeout = 10

  source {
    type      = "CODEPIPELINE"
    buildspec = ".aws/buildspec-test.yml"
  }

  artifacts { type = "CODEPIPELINE" }

  environment {
    compute_type    = "BUILD_GENERAL1_SMALL"
    image           = "aws/codebuild/standard:7.0"
    type            = "LINUX_CONTAINER"
    privileged_mode = false
  }
}

# ── CodeBuild: 2 — Build Backend (Docker + ECR) ───────────────────────────────
resource "aws_codebuild_project" "build_backend" {
  name          = "datavault-build-backend-${var.environment}"
  service_role  = aws_iam_role.codebuild.arn
  build_timeout = 20

  source {
    type      = "CODEPIPELINE"
    buildspec = ".aws/buildspec-build-backend.yml"
  }

  artifacts { type = "CODEPIPELINE" }

  environment {
    compute_type    = "BUILD_GENERAL1_SMALL"
    image           = "aws/codebuild/standard:7.0"
    type            = "LINUX_CONTAINER"
    privileged_mode = true

    environment_variable {
      name  = "ECR_REPOSITORY_URI"
      value = aws_ecr_repository.backend.repository_url
    }
  }
}

# ── CodeBuild: 3 — Build Frontend (npm + S3 sync + CF invalidate) ─────────────
resource "aws_codebuild_project" "build_frontend" {
  name          = "datavault-build-frontend-${var.environment}"
  service_role  = aws_iam_role.codebuild.arn
  build_timeout = 15

  source {
    type      = "CODEPIPELINE"
    buildspec = ".aws/buildspec-build-frontend.yml"
  }

  artifacts { type = "CODEPIPELINE" }

  environment {
    compute_type    = "BUILD_GENERAL1_SMALL"
    image           = "aws/codebuild/standard:7.0"
    type            = "LINUX_CONTAINER"
    privileged_mode = false

    environment_variable {
      name  = "FRONTEND_BUCKET"
      value = aws_s3_bucket.frontend.bucket
    }
    environment_variable {
      name  = "CLOUDFRONT_DIST_ID"
      value = aws_cloudfront_distribution.frontend.id
    }
    environment_variable {
      name  = "VITE_API_URL"
      value = "https://${aws_cloudfront_distribution.frontend.domain_name}"
    }
    environment_variable {
      name  = "VITE_WS_URL"
      value = "wss://${aws_cloudfront_distribution.frontend.domain_name}/ws"
    }
  }
}

# ── CodeBuild: 4 — Migrate DB (Alembic via ECS run-task) ─────────────────────
resource "aws_codebuild_project" "migrate" {
  name          = "datavault-migrate-${var.environment}"
  service_role  = aws_iam_role.codebuild.arn
  build_timeout = 15

  source {
    type      = "CODEPIPELINE"
    buildspec = ".aws/buildspec-migrate.yml"
  }

  artifacts { type = "CODEPIPELINE" }

  environment {
    compute_type    = "BUILD_GENERAL1_SMALL"
    image           = "aws/codebuild/standard:7.0"
    type            = "LINUX_CONTAINER"
    privileged_mode = false

    dynamic "environment_variable" {
      for_each = local.ecs_env_vars
      content {
        name  = environment_variable.value.name
        value = environment_variable.value.value
      }
    }
  }
}

# ── CodeBuild: 5 — Deploy ECS (update-service) ───────────────────────────────
resource "aws_codebuild_project" "deploy_ecs" {
  name          = "datavault-deploy-ecs-${var.environment}"
  service_role  = aws_iam_role.codebuild.arn
  build_timeout = 10

  source {
    type      = "CODEPIPELINE"
    buildspec = ".aws/buildspec-deploy-ecs.yml"
  }

  artifacts { type = "CODEPIPELINE" }

  environment {
    compute_type    = "BUILD_GENERAL1_SMALL"
    image           = "aws/codebuild/standard:7.0"
    type            = "LINUX_CONTAINER"
    privileged_mode = false

    dynamic "environment_variable" {
      for_each = local.ecs_env_vars
      content {
        name  = environment_variable.value.name
        value = environment_variable.value.value
      }
    }
  }
}

# ── CodePipeline — 6 etapas ───────────────────────────────────────────────────
# Source → Test → Build (backend ‖ frontend en paralelo) → Migrate → Deploy ECS
resource "aws_codepipeline" "main" {
  name     = "datavault-${var.environment}"
  role_arn = aws_iam_role.codepipeline.arn

  artifact_store {
    location = aws_s3_bucket.pipeline_artifacts.bucket
    type     = "S3"
  }

  # 1 ── Source
  stage {
    name = "Source"
    action {
      name             = "GitHub"
      category         = "Source"
      owner            = "AWS"
      provider         = "CodeStarSourceConnection"
      version          = "1"
      output_artifacts = ["source_output"]
      configuration = {
        ConnectionArn    = aws_codestarconnections_connection.github.arn
        FullRepositoryId = "${var.github_owner}/${var.github_repo}"
        BranchName       = local.pipeline_branch
        DetectChanges    = "true"
      }
    }
  }

  # 2 ── Test
  stage {
    name = "Test"
    action {
      name             = "LintAndTests"
      category         = "Build"
      owner            = "AWS"
      provider         = "CodeBuild"
      version          = "1"
      input_artifacts  = ["source_output"]
      output_artifacts = ["test_output"]
      configuration = {
        ProjectName = aws_codebuild_project.test.name
      }
    }
  }

  # 3 ── Build (backend y frontend en paralelo)
  stage {
    name = "Build"

    action {
      name             = "BuildBackend"
      category         = "Build"
      owner            = "AWS"
      provider         = "CodeBuild"
      version          = "1"
      run_order        = 1
      input_artifacts  = ["test_output"]
      output_artifacts = ["backend_output"]
      configuration = {
        ProjectName = aws_codebuild_project.build_backend.name
      }
    }

    action {
      name             = "BuildFrontend"
      category         = "Build"
      owner            = "AWS"
      provider         = "CodeBuild"
      version          = "1"
      run_order        = 1
      input_artifacts  = ["test_output"]
      output_artifacts = ["frontend_output"]
      configuration = {
        ProjectName = aws_codebuild_project.build_frontend.name
      }
    }
  }

  # 4 ── Migrate DB
  stage {
    name = "Migrate"
    action {
      name            = "AlembicUpgrade"
      category        = "Build"
      owner           = "AWS"
      provider        = "CodeBuild"
      version         = "1"
      input_artifacts = ["backend_output"]
      configuration = {
        ProjectName = aws_codebuild_project.migrate.name
      }
    }
  }

  # 5 ── Deploy ECS
  stage {
    name = "Deploy"
    action {
      name            = "UpdateECSService"
      category        = "Build"
      owner           = "AWS"
      provider        = "CodeBuild"
      version         = "1"
      input_artifacts = ["backend_output"]
      configuration = {
        ProjectName = aws_codebuild_project.deploy_ecs.name
      }
    }
  }
}
