# =========================================================================
# Charlotte AI Receptionist — Google Cloud Platform Main Infrastructure
# =========================================================================

# -------------------------------------------------------------------------
# 1. Enable Required Google Cloud APIs
# -------------------------------------------------------------------------
locals {
  env               = terraform.workspace == "default" ? "prod" : terraform.workspace
  is_shared_creator = local.env == "prod" ? 1 : 0

  # Base names
  db_instance_name = "charlotte-db-instance"
  vpc_name         = "charlotte-vpc"

  # Resolve IP
  db_ip = local.is_shared_creator == 1 ? google_sql_database_instance.db_instance[0].private_ip_address : data.google_sql_database_instance.shared_db[0].private_ip_address
}

data "google_sql_database_instance" "shared_db" {
  count   = local.is_shared_creator == 0 ? 1 : 0
  name    = local.db_instance_name
  project = var.project_id
}

locals {
  apis = [
    "compute.googleapis.com",
    "sqladmin.googleapis.com",
    "servicenetworking.googleapis.com",
    "secretmanager.googleapis.com",
    "run.googleapis.com",
    "vpcaccess.googleapis.com",
    "iam.googleapis.com"
  ]
}

resource "google_project_service" "gcp_services" {
  for_each = toset(local.apis)
  project  = var.project_id
  service  = each.key

  disable_on_destroy = false
}

# -------------------------------------------------------------------------
# 2. VPC Network and Serverless Access Configuration
# -------------------------------------------------------------------------
resource "google_compute_network" "vpc_network" {
  count = local.is_shared_creator

  name                    = "charlotte-vpc"
  auto_create_subnetworks = false
  project                 = var.project_id

  depends_on = [google_project_service.gcp_services]
}

resource "google_compute_subnetwork" "subnet" {
  count = local.is_shared_creator

  name          = "charlotte-subnet"
  ip_cidr_range = "10.0.0.0/24"
  region        = var.region
  network       = local.vpc_name
  project       = var.project_id
}

# Private services IP allocation for Cloud SQL peering
resource "google_compute_global_address" "private_ip_alloc" {
  count = local.is_shared_creator

  name          = "charlotte-private-ip-alloc"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = local.vpc_name
  project       = var.project_id
}

# VPC Peering Connection to Google Services (for Cloud SQL private IP)
resource "google_service_networking_connection" "private_vpc_connection" {
  count = local.is_shared_creator

  network                 = local.vpc_name
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_alloc[0].name]

  depends_on = [
    google_project_service.gcp_services,
    google_compute_global_address.private_ip_alloc[0]
  ]
}

# Serverless VPC Access Connector to route Cloud Run egress into VPC
resource "google_vpc_access_connector" "connector" {
  count = local.is_shared_creator

  name          = "charlotte-vpc-conn"
  region        = var.region
  network       = local.vpc_name
  ip_cidr_range = "10.8.0.0/28"
  project       = var.project_id

  depends_on = [
    google_project_service.gcp_services,
    google_compute_network.vpc_network
  ]
}

# -------------------------------------------------------------------------
# 3. Cloud SQL (PostgreSQL v15) Instance and Database
# -------------------------------------------------------------------------
resource "google_sql_database_instance" "db_instance" {
  count = local.is_shared_creator

  name             = "charlotte-db-instance"
  database_version = "POSTGRES_15"
  region           = var.region
  project          = var.project_id

  settings {
    tier = var.db_tier

    ip_configuration {
      ipv4_enabled                                  = false
      private_network                               = local.vpc_name
      enable_private_path_for_google_cloud_services = true
    }
  }

  depends_on = [
    google_project_service.gcp_services,
    google_service_networking_connection.private_vpc_connection
  ]
}

resource "google_sql_database" "database" {
  name     = "${var.db_name}_${local.env}"
  instance = local.db_instance_name
  project  = var.project_id
}

resource "random_password" "db_password" {
  length           = 16
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

resource "google_sql_user" "db_user" {
  name     = "${var.db_user}_${local.env}"
  instance = local.db_instance_name
  password = random_password.db_password.result
  project  = var.project_id
}

# -------------------------------------------------------------------------
# 4. Google Secret Manager configuration for storing application credentials
# -------------------------------------------------------------------------
resource "google_secret_manager_secret" "twilio_account_sid" {
  secret_id = local.env == "prod" ? "twilio_account_sid" : "twilio_account_sid_${local.env}"
  project   = var.project_id
  replication {
    auto {}
  }
  depends_on = [google_project_service.gcp_services]
}

resource "google_secret_manager_secret_version" "twilio_account_sid_version" {
  secret      = google_secret_manager_secret.twilio_account_sid.id
  secret_data = var.twilio_account_sid
}

resource "google_secret_manager_secret" "twilio_auth_token" {
  secret_id = local.env == "prod" ? "twilio_auth_token" : "twilio_auth_token_${local.env}"
  project   = var.project_id
  replication {
    auto {}
  }
  depends_on = [google_project_service.gcp_services]
}

resource "google_secret_manager_secret_version" "twilio_auth_token_version" {
  secret      = google_secret_manager_secret.twilio_auth_token.id
  secret_data = var.twilio_auth_token
}

resource "google_secret_manager_secret" "twilio_api_key" {
  secret_id = local.env == "prod" ? "twilio_api_key" : "twilio_api_key_${local.env}"
  project   = var.project_id
  replication {
    auto {}
  }
  depends_on = [google_project_service.gcp_services]
}

resource "google_secret_manager_secret_version" "twilio_api_key_version" {
  secret      = google_secret_manager_secret.twilio_api_key.id
  secret_data = var.twilio_api_key
}

resource "google_secret_manager_secret" "twilio_api_secret" {
  secret_id = local.env == "prod" ? "twilio_api_secret" : "twilio_api_secret_${local.env}"
  project   = var.project_id
  replication {
    auto {}
  }
  depends_on = [google_project_service.gcp_services]
}

resource "google_secret_manager_secret_version" "twilio_api_secret_version" {
  secret      = google_secret_manager_secret.twilio_api_secret.id
  secret_data = var.twilio_api_secret
}

resource "google_secret_manager_secret" "gemini_api_key" {
  secret_id = local.env == "prod" ? "gemini_api_key" : "gemini_api_key_${local.env}"
  project   = var.project_id
  replication {
    auto {}
  }
  depends_on = [google_project_service.gcp_services]
}

resource "google_secret_manager_secret_version" "gemini_api_key_version" {
  secret      = google_secret_manager_secret.gemini_api_key.id
  secret_data = var.gemini_api_key
}

resource "google_secret_manager_secret" "jwt_secret" {
  secret_id = local.env == "prod" ? "jwt_secret" : "jwt_secret_${local.env}"
  project   = var.project_id
  replication {
    auto {}
  }
  depends_on = [google_project_service.gcp_services]
}

resource "google_secret_manager_secret_version" "jwt_secret_version" {
  secret      = google_secret_manager_secret.jwt_secret.id
  secret_data = var.jwt_secret
}

resource "google_secret_manager_secret" "db_password" {
  secret_id = local.env == "prod" ? "db_password" : "db_password_${local.env}"
  project   = var.project_id
  replication {
    auto {}
  }
  depends_on = [google_project_service.gcp_services]
}

resource "google_secret_manager_secret_version" "db_password_version" {
  secret      = google_secret_manager_secret.db_password.id
  secret_data = random_password.db_password.result
}

resource "google_secret_manager_secret" "db_url" {
  secret_id = local.env == "prod" ? "database_url" : "database_url_${local.env}"
  project   = var.project_id
  replication {
    auto {}
  }
  depends_on = [google_project_service.gcp_services]
}

resource "google_secret_manager_secret_version" "db_url_version" {
  secret      = google_secret_manager_secret.db_url.id
  secret_data = "postgresql://${var.db_user}:${urlencode(random_password.db_password.result)}@${local.db_ip}:5432/${var.db_name}?sslmode=disable"
}

resource "google_secret_manager_secret" "google_client_id" {
  secret_id = local.env == "prod" ? "google_client_id" : "google_client_id_${local.env}"
  project   = var.project_id
  replication {
    auto {}
  }
  depends_on = [google_project_service.gcp_services]
}

resource "google_secret_manager_secret_version" "google_client_id_version" {
  secret      = google_secret_manager_secret.google_client_id.id
  secret_data = var.google_client_id
}

resource "google_secret_manager_secret" "google_client_secret" {
  secret_id = local.env == "prod" ? "google_client_secret" : "google_client_secret_${local.env}"
  project   = var.project_id
  replication {
    auto {}
  }
  depends_on = [google_project_service.gcp_services]
}

resource "google_secret_manager_secret_version" "google_client_secret_version" {
  secret      = google_secret_manager_secret.google_client_secret.id
  secret_data = var.google_client_secret
}

# -------------------------------------------------------------------------
# 5. Service Accounts for Frontend and Backend
# -------------------------------------------------------------------------
resource "google_service_account" "backend_sa" {
  account_id   = "charlotte-bknd-sa-${local.env}"
  display_name = "Charlotte Backend Cloud Run Service Account (${local.env})"
  project      = var.project_id
}

resource "google_service_account" "frontend_sa" {
  account_id   = "charlotte-frnt-sa-${local.env}"
  display_name = "Charlotte Frontend Cloud Run Service Account (${local.env})"
  project      = var.project_id
}

# Grant backend service account read access to all secrets
locals {
  managed_secrets = [
    google_secret_manager_secret.twilio_account_sid.secret_id,
    google_secret_manager_secret.twilio_auth_token.secret_id,
    google_secret_manager_secret.twilio_api_key.secret_id,
    google_secret_manager_secret.twilio_api_secret.secret_id,
    google_secret_manager_secret.gemini_api_key.secret_id,
    google_secret_manager_secret.jwt_secret.secret_id,
    google_secret_manager_secret.db_password.secret_id,
    google_secret_manager_secret.db_url.secret_id,
    google_secret_manager_secret.google_client_id.secret_id,
    google_secret_manager_secret.google_client_secret.secret_id
  ]
}

resource "google_secret_manager_secret_iam_member" "backend_secrets_accessor" {
  for_each  = toset(local.managed_secrets)
  secret_id = each.key
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.backend_sa.email}"
  project   = var.project_id
}

resource "google_project_iam_member" "backend_logging_viewer" {
  project = var.project_id
  role    = "roles/logging.viewer"
  member  = "serviceAccount:${google_service_account.backend_sa.email}"
}

# -------------------------------------------------------------------------
# 6. Cloud Run Backend Service
# -------------------------------------------------------------------------
resource "google_cloud_run_v2_service" "backend" {
  name     = "charlotte-backend-${local.env}"
  location = var.region
  project  = var.project_id
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.backend_sa.email

    vpc_access {
      connector = "projects/${var.project_id}/locations/${var.region}/connectors/charlotte-vpc-conn"
      egress    = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = var.backend_image

      ports {
        container_port = 8080
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }


      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.db_url.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "TWILIO_ACCOUNT_SID"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.twilio_account_sid.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "TWILIO_AUTH_TOKEN"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.twilio_auth_token.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "TWILIO_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.twilio_api_key.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "TWILIO_API_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.twilio_api_secret.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "GEMINI_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.gemini_api_key.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "JWT_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.jwt_secret.secret_id
            version = "latest"
          }
        }
      }

      # Standard environment configurations
      env {
        name  = "JWT_EXPIRY"
        value = "24h"
      }

      env {
        name  = "BCRYPT_SALT_ROUNDS"
        value = "12"
      }

      env {
        name  = "GEMINI_MODEL_NAME"
        value = "gemini-2.0-flash-exp"
      }

      env {
        name  = "GEMINI_VOICE_ID"
        value = "aoede"
      }
    }
  }

  depends_on = [
    google_project_service.gcp_services,
    google_secret_manager_secret_version.db_url_version,
    google_secret_manager_secret_version.twilio_account_sid_version,
    google_secret_manager_secret_version.twilio_auth_token_version,
    google_secret_manager_secret_version.twilio_api_key_version,
    google_secret_manager_secret_version.twilio_api_secret_version,
    google_secret_manager_secret_version.gemini_api_key_version,
    google_secret_manager_secret_version.jwt_secret_version,
    google_secret_manager_secret_version.google_client_id_version,
    google_secret_manager_secret_version.google_client_secret_version,
    google_vpc_access_connector.connector
  ]
}

# -------------------------------------------------------------------------
# 7. Cloud Run Frontend Service
# -------------------------------------------------------------------------
resource "google_cloud_run_v2_service" "frontend" {
  name     = "charlotte-frontend-${local.env}"
  location = var.region
  project  = var.project_id
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.frontend_sa.email

    containers {
      image = var.frontend_image

      ports {
        container_port = 80
      }

      env {
        name  = "VITE_API_URL"
        value = google_cloud_run_v2_service.backend.uri
      }
    }
  }

  depends_on = [
    google_project_service.gcp_services,
    google_cloud_run_v2_service.backend
  ]
}

# -------------------------------------------------------------------------
# 8. Public Access IAM Bindings
# -------------------------------------------------------------------------
resource "google_cloud_run_v2_service_iam_member" "backend_public" {
  name     = google_cloud_run_v2_service.backend.name
  location = google_cloud_run_v2_service.backend.location
  project  = google_cloud_run_v2_service.backend.project
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service_iam_member" "frontend_public" {
  name     = google_cloud_run_v2_service.frontend.name
  location = google_cloud_run_v2_service.frontend.location
  project  = google_cloud_run_v2_service.frontend.project
  role     = "roles/run.invoker"
  member   = "allUsers"
}
