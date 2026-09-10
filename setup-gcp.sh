#!/usr/bin/env bash
# =============================================================================
# setup-gcp.sh — One-time GCP setup for ask-q-live Cloud Run pipeline
# Run: bash setup-gcp.sh
# =============================================================================
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
PROJECT_ID="gen-ai-guru-gdg-pune"
REGION="us-central1"
SERVICE_NAME="ask-q-live"
REPO_NAME="ask-q-live-repo"
GITHUB_OWNER="Yash-Kavaiya"
GITHUB_REPO="ask-q-live"
BRANCH="main"

echo "🚀 Setting up CI/CD pipeline for project: $PROJECT_ID"
echo ""

# ── Set active project ────────────────────────────────────────────────────────
gcloud config set project "$PROJECT_ID"

# ── Enable required APIs ──────────────────────────────────────────────────────
echo "📦 Enabling required GCP APIs..."
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  iam.googleapis.com \
  --project="$PROJECT_ID"
echo "✅ APIs enabled"

# ── Create Artifact Registry repository ──────────────────────────────────────
echo ""
echo "🗄️  Creating Artifact Registry repository: $REPO_NAME"
gcloud artifacts repositories create "$REPO_NAME" \
  --repository-format=docker \
  --location="$REGION" \
  --description="Docker images for ask-q-live" \
  --project="$PROJECT_ID" 2>/dev/null || echo "   (already exists, skipping)"

# ── Create secrets in Secret Manager ─────────────────────────────────────────
echo ""
echo "🔐 Creating secrets in Secret Manager..."

# GEMINI_API_KEY
echo -n "Enter your GEMINI_API_KEY: "
read -rs GEMINI_KEY
echo ""
echo -n "$GEMINI_KEY" | gcloud secrets create gemini-api-key \
  --data-file=- \
  --project="$PROJECT_ID" 2>/dev/null || \
  echo -n "$GEMINI_KEY" | gcloud secrets versions add gemini-api-key \
    --data-file=- \
    --project="$PROJECT_ID"
echo "✅ gemini-api-key secret stored"

# FIREBASE_API_KEY
echo -n "Enter your FIREBASE_API_KEY (AIzaSy...): "
read -rs FIREBASE_KEY
echo ""
echo -n "$FIREBASE_KEY" | gcloud secrets create firebase-api-key \
  --data-file=- \
  --project="$PROJECT_ID" 2>/dev/null || \
  echo -n "$FIREBASE_KEY" | gcloud secrets versions add firebase-api-key \
    --data-file=- \
    --project="$PROJECT_ID"
echo "✅ firebase-api-key secret stored"

# ── Get Cloud Build Service Account ──────────────────────────────────────────
echo ""
echo "🔑 Granting IAM permissions to Cloud Build service account..."
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")
CB_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"
echo "   Cloud Build SA: $CB_SA"

# Grant Cloud Run Admin
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${CB_SA}" \
  --role="roles/run.admin" \
  --condition=None 2>/dev/null || true

# Grant Artifact Registry Writer
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${CB_SA}" \
  --role="roles/artifactregistry.writer" \
  --condition=None 2>/dev/null || true

# Grant Secret Manager accessor
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${CB_SA}" \
  --role="roles/secretmanager.secretAccessor" \
  --condition=None 2>/dev/null || true

# Grant Service Account User (to act as Cloud Run SA)
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${CB_SA}" \
  --role="roles/iam.serviceAccountUser" \
  --condition=None 2>/dev/null || true

echo "✅ IAM permissions granted"

# Grant Cloud Run SA access to secrets
CR_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
echo "   Granting Cloud Run SA ($CR_SA) access to secrets..."
gcloud secrets add-iam-policy-binding gemini-api-key \
  --member="serviceAccount:${CR_SA}" \
  --role="roles/secretmanager.secretAccessor" \
  --project="$PROJECT_ID" 2>/dev/null || true

gcloud secrets add-iam-policy-binding firebase-api-key \
  --member="serviceAccount:${CR_SA}" \
  --role="roles/secretmanager.secretAccessor" \
  --project="$PROJECT_ID" 2>/dev/null || true

echo "✅ Cloud Run SA secrets access granted"

# ── Create Cloud Build trigger ────────────────────────────────────────────────
echo ""
echo "⚙️  Creating Cloud Build trigger (GitHub → Cloud Build)..."
echo "   NOTE: If GitHub connection is not set up, go to:"
echo "   https://console.cloud.google.com/cloud-build/triggers;region=$REGION?project=$PROJECT_ID"
echo "   and connect your GitHub account first."
echo ""

gcloud builds triggers create github \
  --name="${SERVICE_NAME}-trigger" \
  --repo-name="$GITHUB_REPO" \
  --repo-owner="$GITHUB_OWNER" \
  --branch-pattern="^${BRANCH}$" \
  --build-config="cloudbuild.yaml" \
  --region="$REGION" \
  --project="$PROJECT_ID" 2>/dev/null || echo "   (trigger may already exist or GitHub not connected — set up manually)"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "✅ GCP Setup Complete!"
echo ""
echo "  Project:     $PROJECT_ID"
echo "  Region:      $REGION"
echo "  Service:     $SERVICE_NAME"
echo "  Registry:    ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}"
echo "  Trigger:     Push to branch '$BRANCH' → auto build & deploy"
echo ""
echo "📋 Next steps:"
echo "  1. Ensure GitHub is connected in Cloud Build console"
echo "  2. git add . && git commit -m 'feat: add Cloud Run CI/CD pipeline'"
echo "  3. git push origin main"
echo "  4. Watch build: https://console.cloud.google.com/cloud-build/builds?project=$PROJECT_ID"
echo "════════════════════════════════════════════════════════════════"
