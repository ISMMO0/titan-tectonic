#!/usr/bin/env bash
# Deploy Titan to Google Cloud Run (run in Google Cloud Shell from the repo root).
#
#   bash scripts/deploy-cloud-run.sh <SUPABASE_URL> <SUPABASE_PUBLISHABLE_KEY>
#
# Both values are the public Supabase client config (protected by RLS); they are
# baked into the build and never stored in the repo. Gemini runs on Vertex AI with
# the Cloud Run service account: no API key is needed in production.
# See DEPLOY.md for the step-by-step version.
set -euo pipefail

SUPABASE_URL="${1:?usage: deploy-cloud-run.sh <SUPABASE_URL> <SUPABASE_PUBLISHABLE_KEY>}"
SUPABASE_PUBLISHABLE_KEY="${2:?missing SUPABASE_PUBLISHABLE_KEY}"

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${REGION:-europe-west1}"
LOCATION="${LOCATION:-global}" # Vertex AI endpoint
SERVICE="${SERVICE:-titan}"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
RUNTIME_SA="${RUNTIME_SA:-${PROJECT_NUMBER}-compute@developer.gserviceaccount.com}"

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

step "Project $PROJECT_ID · region $REGION"
gcloud config set project "$PROJECT_ID" >/dev/null

step "Enabling services"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com aiplatform.googleapis.com

step "Artifact Registry repository"
gcloud artifacts repositories describe titan --location="$REGION" >/dev/null 2>&1 ||
  gcloud artifacts repositories create titan --repository-format=docker \
    --location="$REGION" --description="Titan images"

step "IAM: runtime service account can call Vertex AI"
gcloud projects add-iam-policy-binding "$PROJECT_ID" --condition=None --quiet \
  --member="serviceAccount:${RUNTIME_SA}" --role=roles/aiplatform.user >/dev/null

BUILD_SA="$(gcloud builds get-default-service-account --format='value(serviceAccountEmail)' 2>/dev/null |
  sed 's#.*/##')"
if [[ -n "$BUILD_SA" ]]; then
  step "IAM: Cloud Build ($BUILD_SA) can push images and write logs"
  for role in roles/artifactregistry.writer roles/logging.logWriter roles/storage.objectViewer; do
    gcloud projects add-iam-policy-binding "$PROJECT_ID" --condition=None --quiet \
      --member="serviceAccount:${BUILD_SA}" --role="$role" >/dev/null
  done
fi

step "Picking Gemini models that work on Vertex AI"
TOKEN="$(gcloud auth print-access-token)"
vertex() { # $1 = location, $2 = model, $3 = api version, $4 = json body → prints "<http status> <error message>"
  local host="aiplatform.googleapis.com"
  [[ "$1" != global ]] && host="$1-aiplatform.googleapis.com"
  local out code
  out="$(curl -s -w '\n%{http_code}' -H "Authorization: Bearer ${TOKEN}" \
    -H 'Content-Type: application/json' --data "$4" \
    "https://${host}/$3/projects/${PROJECT_ID}/locations/$1/publishers/google/models/$2:generateContent")"
  code="${out##*$'\n'}"
  local err=""
  if [[ "$code" != 200 ]]; then
    err="$(printf '%s' "${out%$'\n'*}" | tr -d '\n' | grep -o '"message": *"[^"]*"' | head -1 | cut -c1-160 || true)"
  fi
  echo "$code $err"
}
TEXT='{"contents":[{"role":"user","parts":[{"text":"Reply with OK."}]}]}'
AUDIO='{"contents":[{"role":"user","parts":[{"text":"OK"}]}],"generationConfig":{"responseModalities":["AUDIO"],"speechConfig":{"voiceConfig":{"prebuiltVoiceConfig":{"voiceName":"Kore"}}}}}'

AGENT_MODEL=""
for loc in ${VERTEX_LOCATIONS:-global europe-west1 us-central1}; do
  for m in gemini-2.5-flash gemini-2.5-flash-lite gemini-2.0-flash-001; do
    res="$(vertex "$loc" "$m" v1 "$TEXT")"
    code="${res%% *}"
    echo "  agent $loc/$m → HTTP $res"
    if [[ "$code" == 200 ]]; then AGENT_MODEL="$m"; LOCATION="$loc"; break 2; fi
  done
done
[[ -n "$AGENT_MODEL" ]] || { echo "No Gemini text model available on Vertex AI in $PROJECT_ID (see errors above)"; exit 1; }

TTS_MODEL=""
for m in gemini-2.5-flash-tts gemini-2.5-flash-preview-tts gemini-2.5-pro-tts; do
  res="$(vertex "$LOCATION" "$m" v1beta1 "$AUDIO")"
  code="${res%% *}"
  echo "  tts   $LOCATION/$m → HTTP $res"
  if [[ "$code" == 200 ]]; then TTS_MODEL="$m"; break; fi
done
unset TOKEN
# No TTS model? Keep Gemini for speech-to-text; the app falls back to the browser's voice.
TTS_MODEL="${TTS_MODEL:-gemini-2.5-flash-tts}"
echo "  → location: $LOCATION · agent/STT: $AGENT_MODEL · TTS: $TTS_MODEL"

TAG="$(git rev-parse --short HEAD)"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/titan/titan:${TAG}"

step "Building image $IMAGE (Cloud Build)"
gcloud builds submit --config=cloudbuild.yaml --quiet \
  --substitutions="_REGION=${REGION},_SUPABASE_URL=${SUPABASE_URL},_SUPABASE_PUBLISHABLE_KEY=${SUPABASE_PUBLISHABLE_KEY},_TAG=${TAG}"

step "Deploying to Cloud Run (public URL)"
gcloud run deploy "$SERVICE" --image="$IMAGE" --region="$REGION" --quiet \
  --service-account="$RUNTIME_SA" --allow-unauthenticated --port=8080 \
  --memory=1Gi --min-instances=1 --max-instances=3 \
  --set-env-vars="GOOGLE_GENAI_USE_VERTEXAI=true,GOOGLE_CLOUD_PROJECT=${PROJECT_ID},GOOGLE_CLOUD_LOCATION=${LOCATION},GEMINI_MODEL=${AGENT_MODEL},GEMINI_STT_MODEL=${AGENT_MODEL},GEMINI_TTS_MODEL=${TTS_MODEL},GEMINI_TTS_VOICE=Kore,VOICE_PROVIDER=gemini"

URL="$(gcloud run services describe "$SERVICE" --region="$REGION" --format='value(status.url)')"

step "Smoke tests"
echo "  health:        $(curl -s -o /dev/null -w '%{http_code}' "$URL/api/health") (expect 200)"
echo "  / signed out:  $(curl -s -o /dev/null -w '%{http_code}' "$URL/") (expect 307 → /login)"
echo "  chat, no auth: $(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Origin: https://evil.example' \
  -H 'Content-Type: application/json' --data '{"messages":[]}' "$URL/api/chat") (expect 401/403)"
echo "  headers:"
curl -sI "$URL/login" | grep -iE '^(content-security-policy|x-frame-options|strict-transport-security|x-content-type-options):' |
  cut -c1-80 | sed 's/^/    /' || true

printf '\n\033[1;32m✅ Titan is live: %s\033[0m\n' "$URL"
