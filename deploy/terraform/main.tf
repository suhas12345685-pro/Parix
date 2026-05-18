# ─── Parix — Terraform Infrastructure ─────────────────────────
# Provisions cloud resources for Parix deployment.
# Supports: GCP (primary), AWS, Azure via provider swap.
# Usage: cd deploy/terraform && terraform init && terraform plan
# ───────────────────────────────────────────────────────────────

terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }

  backend "gcs" {
    bucket = "parix-tfstate"
    prefix = "terraform/state"
  }
}

# ─── Variables ─────────────────────────────────────────────────

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-central1"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "production"
  validation {
    condition     = contains(["production", "staging", "development"], var.environment)
    error_message = "Environment must be production, staging, or development."
  }
}

# ─── Provider ──────────────────────────────────────────────────

provider "google" {
  project = var.project_id
  region  = var.region
}

# ─── GKE Cluster ──────────────────────────────────────────────

resource "google_container_cluster" "parix" {
  name     = "parix-${var.environment}"
  location = var.region

  # Autopilot mode — Google manages node pools
  enable_autopilot = true

  network    = google_compute_network.parix.id
  subnetwork = google_compute_subnetwork.parix.id

  release_channel {
    channel = "REGULAR"
  }

  deletion_protection = var.environment == "production"
}

# ─── VPC Network ──────────────────────────────────────────────

resource "google_compute_network" "parix" {
  name                    = "parix-vpc-${var.environment}"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "parix" {
  name          = "parix-subnet-${var.environment}"
  ip_cidr_range = "10.0.0.0/24"
  region        = var.region
  network       = google_compute_network.parix.id

  secondary_ip_range {
    range_name    = "pods"
    ip_cidr_range = "10.1.0.0/16"
  }

  secondary_ip_range {
    range_name    = "services"
    ip_cidr_range = "10.2.0.0/20"
  }
}

# ─── Cloud Storage (SQLite backups) ───────────────────────────

resource "google_storage_bucket" "backups" {
  name          = "parix-backups-${var.project_id}"
  location      = var.region
  force_destroy = var.environment != "production"

  versioning {
    enabled = true
  }

  lifecycle_rule {
    condition {
      age = 30
    }
    action {
      type = "Delete"
    }
  }

  uniform_bucket_level_access = true
}

# ─── Secret Manager ──────────────────────────────────────────

resource "google_secret_manager_secret" "api_keys" {
  for_each  = toset(["gemini-api-key", "telegram-bot-token", "telegram-chat-id"])
  secret_id = "parix-${each.key}-${var.environment}"

  replication {
    auto {}
  }
}

# ─── Outputs ──────────────────────────────────────────────────

output "cluster_name" {
  value = google_container_cluster.parix.name
}

output "cluster_endpoint" {
  value     = google_container_cluster.parix.endpoint
  sensitive = true
}

output "backup_bucket" {
  value = google_storage_bucket.backups.name
}
