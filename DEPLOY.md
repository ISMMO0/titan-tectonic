# Deploy Titan to Google Cloud Run

These steps deploy Titan to the Tectonic hackathon project. The Qwiklabs project expires about one
week after activation, so confirm the final demo URL shortly before judging.

## Prerequisites

- Run the commands in Google Cloud Shell; `gcloud` is not required on developer machines.
- Sign in yourself and never paste passwords, API keys, or demo-user credentials into commands or logs.
- Keep `.env.local` local and git-ignored. The two `NEXT_PUBLIC_*` values below are publishable
  Supabase client configuration; Row Level Security protects the data.

```bash
git clone https://github.com/ISMMO0/titan-tectonic.git
cd titan-tectonic
git checkout feat/deploy-cloud-run

gcloud config set project qwiklabs-gcp-01-d65161dd06b1
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  aiplatform.googleapis.com \
  secretmanager.googleapis.com

gcloud artifacts repositories describe titan \
  --location=europe-west1 >/dev/null 2>&1 || \
gcloud artifacts repositories create titan \
  --repository-format=docker \
  --location=europe-west1 \
  --description="Titan Cloud Run images"
```

## IAM setup

The runtime service account needs permission to call Vertex AI. This changes project IAM and should
only be run by a project administrator who has reviewed the service account and role.

```bash
PROJECT_ID=qwiklabs-gcp-01-d65161dd06b1
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
RUNTIME_SA=64267130319-compute@developer.gserviceaccount.com
CLOUDBUILD_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role=roles/aiplatform.user

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${CLOUDBUILD_SA}" \
  --role=roles/artifactregistry.writer
```

If this project uses the Compute Engine service account for Cloud Build, use the service account
shown by `gcloud builds get-default-service-account` instead of `CLOUDBUILD_SA`.

## Validate Vertex models

The selected models are `gemini-2.5-flash` for the agent and audio transcription, and
`gemini-2.5-flash-tts` for speech output. Both use the Vertex `generateContent` API in `global`.
Availability can still vary by project, so run these smoke tests before deploying:

```bash
PROJECT_ID=qwiklabs-gcp-01-d65161dd06b1
LOCATION=global
ACCESS_TOKEN="$(gcloud auth print-access-token)"

curl -fsS \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H 'Content-Type: application/json' \
  "https://aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/gemini-2.5-flash:generateContent" \
  --data '{"contents":[{"role":"user","parts":[{"text":"Reply with OK."}]}]}' \
  | jq -e '.candidates[0].content.parts[0].text'

curl -fsS \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H 'Content-Type: application/json' \
  "https://aiplatform.googleapis.com/v1beta1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/gemini-2.5-flash-tts:generateContent" \
  --data '{"contents":[{"role":"user","parts":[{"text":"Say OK."}]}],"generationConfig":{"responseModalities":["AUDIO"],"speechConfig":{"voiceConfig":{"prebuiltVoiceConfig":{"voiceName":"Kore"}}}}}' \
  | jq -e '.candidates[0].content.parts[0].inlineData.data | length > 0'

unset ACCESS_TOKEN
```

The model references are documented in Google Cloud's
[Vertex AI quickstart](https://cloud.google.com/vertex-ai/generative-ai/docs/start/quickstart) and
[Gemini TTS guide](https://cloud.google.com/text-to-speech/docs/gemini-tts). If the TTS test is not
available in the lab, deploy with `VOICE_PROVIDER=browser`; the app will use browser speech synthesis.

## Build

Load the publishable Supabase values without printing them. Choose a unique immutable tag.

```bash
read -rsp "Supabase URL: " SUPABASE_URL && echo
read -rsp "Supabase publishable key: " SUPABASE_PUBLISHABLE_KEY && echo
IMAGE_TAG="$(git rev-parse --short HEAD)"

gcloud builds submit \
  --config=cloudbuild.yaml \
  --substitutions="_SUPABASE_URL=${SUPABASE_URL},_SUPABASE_PUBLISHABLE_KEY=${SUPABASE_PUBLISHABLE_KEY},_TAG=${IMAGE_TAG}"

unset SUPABASE_URL SUPABASE_PUBLISHABLE_KEY
IMAGE="europe-west1-docker.pkg.dev/qwiklabs-gcp-01-d65161dd06b1/titan/titan:${IMAGE_TAG}"
```

## Deploy

The chosen models below must pass the previous smoke tests. Making the service public and changing
IAM are outward-facing actions; review the command before running it.

```bash
AGENT_MODEL=gemini-2.5-flash
STT_MODEL="$AGENT_MODEL"
TTS_MODEL=gemini-2.5-flash-tts

gcloud run deploy titan \
  --image="$IMAGE" \
  --region=europe-west1 \
  --service-account=64267130319-compute@developer.gserviceaccount.com \
  --allow-unauthenticated \
  --port=8080 \
  --memory=1Gi \
  --min-instances=1 \
  --max-instances=3 \
  --set-env-vars="GOOGLE_GENAI_USE_VERTEXAI=true,GOOGLE_CLOUD_PROJECT=qwiklabs-gcp-01-d65161dd06b1,GOOGLE_CLOUD_LOCATION=global,GEMINI_MODEL=${AGENT_MODEL},GEMINI_STT_MODEL=${STT_MODEL},GEMINI_TTS_MODEL=${TTS_MODEL},GEMINI_TTS_VOICE=Kore,VOICE_PROVIDER=gemini"
```

If an organization policy blocks unauthenticated access, stop and ask the lab administrator. Do not
try to bypass the policy.

## Supabase callback URLs

Copy the Cloud Run service URL into Supabase Dashboard -> Authentication -> URL Configuration:

- Site URL: the Cloud Run URL
- Redirect URLs: the Cloud Run URL and the same URL with `/**`

Do not change the database schema, RLS policies, or service-role configuration.

## Verify

```bash
SERVICE_URL="$(gcloud run services describe titan --region=europe-west1 --format='value(status.url)')"

curl -i "${SERVICE_URL}/api/health"
curl -I "${SERVICE_URL}/"
curl -i -X POST "${SERVICE_URL}/api/chat" \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://untrusted.example' \
  --data '{"messages":[]}'
curl -sS -D - -o /dev/null "${SERVICE_URL}/login"

gcloud run services logs read titan --region=europe-west1 --limit=100
```

Expected results: health returns `200` and `{\"ok\":true}`; `/` redirects to `/login`; the
unauthenticated cross-origin chat request is rejected; CSP, X-Frame-Options, HSTS, and `nosniff`
headers are present; `x-powered-by` is absent. Inspect logs for errors and accidental secret output.

After the user adds the Supabase URLs and signs in, run the full demo: proactive Tokyo greeting,
budget breakdown, investment plan, stock confirmation, transfer confirmation, microphone flow, and
phone-size layout.

## Redeploy and roll back

Build each revision with a new `_TAG`, deploy that immutable image tag, and keep previous tags in
Artifact Registry. To roll back:

```bash
gcloud run revisions list --service=titan --region=europe-west1
gcloud run services update-traffic titan \
  --region=europe-west1 \
  --to-revisions=PREVIOUS_REVISION=100
```

## API-key fallback

Use this only if Vertex AI cannot work in the lab. Create `gemini-api-key` in Secret Manager by
entering the key interactively, grant the runtime service account `roles/secretmanager.secretAccessor`,
then deploy without the Vertex variables and add:

```bash
--set-secrets=GEMINI_API_KEY=gemini-api-key:latest
```

Never put the key in the image, repository, command history, or chat.
