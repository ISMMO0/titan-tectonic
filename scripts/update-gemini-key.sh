#!/usr/bin/env bash
# Replace the Gemini API key used by Titan on Cloud Run (run in Google Cloud Shell).
#
#   bash scripts/update-gemini-key.sh
#
# The key is read at a hidden prompt, tested against the Gemini API BEFORE it is
# saved, stored as a new version of the Secret Manager secret "gemini-api-key",
# then Cloud Run restarts on it. It never appears on screen, in history or in logs.
set -euo pipefail

REGION="${REGION:-europe-west1}"
SERVICE="${SERVICE:-titan}"
MODEL="${MODEL:-gemini-3.5-flash-lite}"

read -rsp "Paste your Google AI Studio key (hidden), then press Enter: " KEY
echo
KEY="$(printf '%s' "$KEY" | tr -d '[:space:]')"
[[ -n "$KEY" ]] || { echo "No key given."; exit 1; }

echo "Testing the key against Gemini ($MODEL)…"
code="$(curl -s -o /dev/null -w '%{http_code}' -H "x-goog-api-key: ${KEY}" \
  -H 'Content-Type: application/json' \
  --data '{"contents":[{"parts":[{"text":"Reply with OK."}]}]}' \
  "https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent")"
if [[ "$code" != 200 ]]; then
  unset KEY
  echo "❌ Gemini refused this key (HTTP $code). Nothing was changed."
  echo "   Use a key from https://aistudio.google.com/apikey (personal Google account, starts with AIza)."
  exit 1
fi
echo "✅ Key works."

printf '%s' "$KEY" | gcloud secrets versions add gemini-api-key --data-file=- >/dev/null
unset KEY
echo "Saved as a new version of secret gemini-api-key."

echo "Restarting $SERVICE on the new key…"
gcloud run services update "$SERVICE" --region="$REGION" --quiet \
  --update-secrets=GEMINI_API_KEY=gemini-api-key:latest >/dev/null
echo "✅ Done: $(gcloud run services describe "$SERVICE" --region="$REGION" --format='value(status.url)')"
