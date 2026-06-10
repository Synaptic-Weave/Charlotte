# -------------------------------------------------------------------------
# GitHub Actions Continuous Deployment Setup
# -------------------------------------------------------------------------

# 1. Workload Identity Pool
resource "google_iam_workload_identity_pool" "github_pool" {
  workload_identity_pool_id = "github-actions-pool"
  display_name              = "GitHub Actions Pool"
  description               = "Identity pool for GitHub Actions deployments"
  project                   = var.project_id
}

# 2. Workload Identity Provider for GitHub
resource "google_iam_workload_identity_pool_provider" "github_provider" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github_pool.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-actions-provider"
  display_name                       = "GitHub Actions Provider"
  description                        = "OIDC identity provider for GitHub Actions"
  project                            = var.project_id

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.actor"      = "assertion.actor"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }

  attribute_condition = "assertion.repository == 'Synaptic-Weave/Charlotte'"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# 3. Service Account for GitHub Actions
resource "google_service_account" "github_actions_sa" {
  account_id   = "github-actions-sa"
  display_name = "GitHub Actions Deployment Service Account"
  project      = var.project_id
}

# 4. IAM Roles for GitHub Actions Service Account
locals {
  github_actions_roles = [
    "roles/artifactregistry.writer",
    "roles/run.admin",
    "roles/iam.serviceAccountUser",
    "roles/run.viewer"
  ]
}

resource "google_project_iam_member" "github_actions_roles" {
  for_each = toset(local.github_actions_roles)
  project  = var.project_id
  role     = each.key
  member   = "serviceAccount:${google_service_account.github_actions_sa.email}"
}

# 5. Grant Workload Identity Pool impersonation permission
resource "google_service_account_iam_member" "github_actions_impersonation" {
  service_account_id = google_service_account.github_actions_sa.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principal://iam.googleapis.com/${google_iam_workload_identity_pool.github_pool.name}/subject/repo:Synaptic-Weave/Charlotte:ref:refs/heads/main"
}

# -------------------------------------------------------------------------
# Cloud Run Job for DB Migrations
# -------------------------------------------------------------------------
resource "google_cloud_run_v2_job" "db_migrate" {
  name     = "charlotte-db-migrate"
  location = var.region
  project  = var.project_id

  template {
    template {
      service_account = google_service_account.backend_sa.email

      vpc_access {
        connector = google_vpc_access_connector.connector.id
        egress    = "PRIVATE_RANGES_ONLY"
      }

      containers {
        # Using the same image as backend, assuming migrations are run from it
        image = var.backend_image

        command = ["npm", "run", "migrate"]

        env {
          name = "DATABASE_URL"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.db_url.secret_id
              version = "latest"
            }
          }
        }
      }
    }
  }

  depends_on = [
    google_project_service.gcp_services,
    google_secret_manager_secret_version.db_url_version,
    google_vpc_access_connector.connector
  ]
}
