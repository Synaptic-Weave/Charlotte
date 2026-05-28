output "backend_url" {
  description = "The URL of the deployed Charlotte backend Cloud Run service"
  value       = google_cloud_run_v2_service.backend.uri
}

output "frontend_url" {
  description = "The URL of the deployed Charlotte frontend Cloud Run service"
  value       = google_cloud_run_v2_service.frontend.uri
}

output "db_private_ip" {
  description = "The private IP address of the Cloud SQL PostgreSQL instance"
  value       = google_sql_database_instance.db_instance.private_ip_address
}

output "db_connection_name" {
  description = "The connection name of the Cloud SQL PostgreSQL instance"
  value       = google_sql_database_instance.db_instance.connection_name
}

output "vpc_name" {
  description = "The name of the VPC network created"
  value       = google_compute_network.vpc_network.name
}

output "vpc_connector_name" {
  description = "The name of the Serverless VPC Access Connector"
  value       = google_vpc_access_connector.connector.name
}
