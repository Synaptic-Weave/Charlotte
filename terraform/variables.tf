variable "project_id" {
  description = "The ID of the GCP project where resources will be created"
  type        = string
}

variable "region" {
  description = "The region where GCP resources will be located"
  type        = string
  default     = "us-central1"
}


variable "db_user" {
  description = "The database user for PostgreSQL"
  type        = string
  default     = "charlotte_admin"
}

variable "db_name" {
  description = "The database name for PostgreSQL"
  type        = string
  default     = "charlotte_db"
}

variable "db_tier" {
  description = "The machine type (tier) for the Cloud SQL PostgreSQL instance"
  type        = string
  default     = "db-f1-micro"
}

variable "twilio_account_sid" {
  description = "Twilio Account SID used for making and managing calls"
  type        = string
  sensitive   = true
  default     = ""
}

variable "twilio_auth_token" {
  description = "Twilio Auth Token used for authenticating requests"
  type        = string
  sensitive   = true
  default     = ""
}

variable "twilio_api_key" {
  description = "Twilio API Key used for Twilio voice / WebSockets media streams"
  type        = string
  sensitive   = true
  default     = ""
}

variable "twilio_api_secret" {
  description = "Twilio API Secret matching the Twilio API Key"
  type        = string
  sensitive   = true
  default     = ""
}

variable "gemini_api_key" {
  description = "Google Gemini API Key for model interaction"
  type        = string
  sensitive   = true
  default     = ""
}

variable "jwt_secret" {
  description = "JWT super secret signing key for authentication"
  type        = string
  sensitive   = true
  default     = "charlotte_super_secret_jwt_sign_key_change_me_in_production"
}

variable "backend_image" {
  description = "The Docker image URI for the Charlotte backend service"
  type        = string
  default     = "us-central1-docker.pkg.dev/charlotte-sw/charlotte-repo/charlotte-backend:latest"
}

variable "frontend_image" {
  description = "The Docker image URI for the Charlotte frontend service"
  type        = string
  default     = "us-central1-docker.pkg.dev/charlotte-sw/charlotte-repo/charlotte-frontend:latest"
}
